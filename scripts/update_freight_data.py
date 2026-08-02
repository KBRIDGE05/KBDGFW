#!/usr/bin/env python3
"""Update KBRIDGE freight-index JSON from official public webpages.

The parsers prefer semantic table labels and validate dates/value ranges before writing.
A source-specific run exits non-zero when that source fails, so GitHub Actions cannot
report a silent success while leaving stale public data in place.
"""
from __future__ import annotations

import argparse
import copy
import html
import json
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "freight-data.json"
KST = ZoneInfo("Asia/Seoul")

# BDI is an index-point series. Values outside this broad historical range are
# treated as page-parser noise and are never written to the public JSON.
BDI_MIN_VALUE = 100
BDI_MAX_VALUE = 20_000
BDI_MAX_WEEKLY_CHANGE_PCT = 80.0
SCFI_MIN_VALUE = 100.0
SCFI_MAX_VALUE = 20_000.0

URLS = {
    "scfi": "https://www.sse.net.cn/index/singleIndex?indexType=scfi",
    "scfi_fallback": "https://www.sse.sh.cn/index/singleIndex?indexType=scfi",
    "kcci_grid": "https://www.kobc.or.kr/ebz/shippinginfo/kcci/gridList.do?mId=0304000000",
    "kcci_timeseries": "https://www.kobc.or.kr/ebz/shippinginfo/timeseries/gridList.do?mId=0304000000",
    "kcci_grid_eng": "https://www.kobc.or.kr/ebz/shippinginfoeng/kcci/gridList.do?mId=0304000000",
    "bdi": "https://en.stockq.org/index/BDI.php",
    "bdi_fallback": "https://tradingeconomics.com/commodity/baltic",
    "korean_air": "https://cargo.koreanair.com/ko/services/Surcharge-Information",
    "korean_air_news": "https://cargo.koreanair.com/ko/cargo-news",
}

ROUTES = {
    "KCCI": ("Index", "종합지수", "100%"),
    "KUWI": ("Mainlane", "미주 서안", "15%"),
    "KUEI": ("Mainlane", "미주 동안", "10%"),
    "KNEI": ("Mainlane", "북유럽", "10%"),
    "KMDI": ("Mainlane", "지중해", "5%"),
    "KMEI": ("Non-Mainlane", "중동", "5%"),
    "KAUI": ("Non-Mainlane", "호주", "5%"),
    "KLEI": ("Non-Mainlane", "중남미 동안", "5%"),
    "KLWI": ("Non-Mainlane", "중남미 서안", "5%"),
    "KSAI": ("Non-Mainlane", "남아프리카", "2.5%"),
    "KWAI": ("Non-Mainlane", "서아프리카", "2.5%"),
    "KCI": ("Intra Asia", "중국", "15%"),
    "KJI": ("Intra Asia", "일본", "10%"),
    "KSEI": ("Intra Asia", "동남아", "10%"),
}


class ParseError(RuntimeError):
    pass


@dataclass
class Result:
    ok: bool
    message: str


def session() -> requests.Session:
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        backoff_factor=1.2,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    s = requests.Session()
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Chrome/126 Safari/537.36 KBRIDGE-FreightIndex/1.0"
            ),
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        }
    )
    return s


def cache_busted_url(url: str) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["_kbts"] = str(int(time.time()))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def fetch(url: str, *, cache_bust: bool = True) -> BeautifulSoup:
    target = cache_busted_url(url) if cache_bust else url
    r = session().get(
        target,
        timeout=35,
        headers={"Cache-Control": "no-cache, no-store, max-age=0", "Pragma": "no-cache"},
    )
    r.raise_for_status()
    content_type = (r.headers.get("content-type") or "").lower()
    if "charset=" not in content_type and not r.encoding:
        r.encoding = "utf-8"
    return BeautifulSoup(r.text, "html.parser")


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def num(value: str) -> float:
    return float(value.replace(",", ""))


def int_num(value: str) -> int:
    return int(round(num(value)))


def parse_iso(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def normalize_ymd(year: str, month: str, day: str) -> str:
    return date(int(year), int(month), int(day)).isoformat()


def assert_fresh(label: str, value: str, max_age_days: int) -> None:
    observed = parse_iso(value)
    today = datetime.now(KST).date()
    age = (today - observed).days
    if age < 0:
        raise ParseError(f"{label} 발표일이 미래입니다: {value}")
    if age > max_age_days:
        raise ParseError(f"{label} 최신값이 {age}일 경과했습니다: {value}")


def upsert_history(history: list[dict[str, Any]], items: Iterable[dict[str, Any]], limit: int = 104) -> None:
    indexed = {str(item["date"]): item for item in history if item.get("date")}
    for item in items:
        indexed[str(item["date"])] = item
    history[:] = sorted(indexed.values(), key=lambda x: x["date"])[-limit:]


def upsert_periods(periods: list[dict[str, Any]], items: Iterable[dict[str, Any]]) -> None:
    indexed = {str(item["start"]): item for item in periods if item.get("start")}
    for item in items:
        indexed[str(item["start"])] = item
    # Preserve the complete FSC trend seeded from January 2026 while appending future periods.
    ordered = sorted(indexed.values(), key=lambda x: x["start"])
    today = datetime.now(KST).date()
    for item in ordered:
        start, end = parse_iso(item["start"]), parse_iso(item["end"])
        item["status"] = "current" if start <= today <= end else ("upcoming" if start > today else "expired")
    periods[:] = ordered


def parse_scfi(soup: BeautifulSoup) -> list[dict[str, Any]]:
    """Parse the official SSEI/SSE SCFI text table.

    Since June 2026 the legacy English endpoint renders the figures as an image.
    The current Chinese official page exposes a normal table with labels such as
    ``上期``, ``本期`` and ``综合指数 Comprehensive Index``.  This parser accepts
    both Chinese and English labels and validates the row before returning it.
    """
    page = clean(soup.get_text(" ", strip=True))

    # Prefer the dates that are explicitly attached to previous/current columns.
    header_patterns = (
        r"上期\s*(20\d{2}-\d{2}-\d{2})\s*本期\s*(20\d{2}-\d{2}-\d{2})",
        r"Previous\s+Index\s*(20\d{2}-\d{2}-\d{2}).*?Current\s+Index\s*(20\d{2}-\d{2}-\d{2})",
    )
    previous_date = current_date = ""
    for pattern in header_patterns:
        match = re.search(pattern, page, re.I)
        if match:
            previous_date, current_date = match.groups()
            break
    if not previous_date:
        # A date-search input can add an unrelated date before the table, so use
        # the last two dates only as a guarded fallback.
        dates = re.findall(r"20\d{2}-\d{2}-\d{2}", page)
        if len(dates) < 2:
            raise ParseError("SCFI 발표일을 찾지 못했습니다.")
        previous_date, current_date = dates[-2], dates[-1]

    row_text = ""
    for tr in soup.find_all("tr"):
        candidate = clean(tr.get_text(" ", strip=True))
        if re.search(r"(?:综合指数\s*)?Comprehensive\s+Index|综合指数", candidate, re.I):
            row_text = candidate
            break
    if not row_text:
        match = re.search(
            r"(?:综合指数\s*)?Comprehensive\s+Index\s+[-+\d,. ]+|综合指数\s+[-+\d,. ]+",
            page,
            re.I,
        )
        row_text = match.group(0) if match else ""
    if not row_text:
        raise ParseError("SCFI 종합지수 행을 찾지 못했습니다.")

    values = [num(raw) for raw in re.findall(r"-?\d+(?:,\d{3})*(?:\.\d+)?", row_text)]
    if len(values) < 2:
        raise ParseError("SCFI 종합지수 값을 찾지 못했습니다.")
    previous_value, current_value = values[0], values[1]
    reported_change = values[2] if len(values) >= 3 else None

    previous_day, current_day = parse_iso(previous_date), parse_iso(current_date)
    today = datetime.now(KST).date()
    if previous_day >= current_day or current_day > today + timedelta(days=1):
        raise ParseError(f"SCFI 발표일 순서가 비정상입니다: {previous_date} → {current_date}")
    if not (SCFI_MIN_VALUE <= previous_value <= SCFI_MAX_VALUE):
        raise ParseError(f"SCFI 이전값이 허용 범위를 벗어났습니다: {previous_value}")
    if not (SCFI_MIN_VALUE <= current_value <= SCFI_MAX_VALUE):
        raise ParseError(f"SCFI 현재값이 허용 범위를 벗어났습니다: {current_value}")
    if reported_change is not None and abs((current_value - previous_value) - reported_change) > 0.2:
        raise ParseError("SCFI 증감값 검증에 실패했습니다.")

    return [
        {"date": previous_date, "value": round(previous_value, 2)},
        {"date": current_date, "value": round(current_value, 2)},
    ]


def fetch_scfi() -> tuple[list[dict[str, Any]], str]:
    """Try official SCFI text-table endpoints in order and report the source used."""
    errors: list[str] = []
    for source_key in ("scfi", "scfi_fallback"):
        try:
            return parse_scfi(fetch(URLS[source_key])), source_key
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{source_key}: {exc}")
    raise ParseError(" / ".join(errors))



def weekly_latest(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the latest available observation in each ISO week."""
    by_week: dict[tuple[int, int], dict[str, Any]] = {}
    for item in sorted(items, key=lambda x: x["date"]):
        day = parse_iso(str(item["date"]))
        iso = day.isocalendar()
        by_week[(iso.year, iso.week)] = {"date": day.isoformat(), "value": int(round(float(item["value"])))}
    return sorted(by_week.values(), key=lambda x: x["date"])


def valid_bdi_point(item: dict[str, Any]) -> bool:
    """Return True only for a plausible, non-future BDI observation."""
    try:
        day = parse_iso(str(item.get("date", "")))
        value = int(round(float(item.get("value"))))
    except (TypeError, ValueError):
        return False
    return day <= datetime.now(KST).date() and BDI_MIN_VALUE <= value <= BDI_MAX_VALUE


def sanitize_bdi_history(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove malformed/implausible points and return a sorted weekly series."""
    clean_items: list[dict[str, Any]] = []
    for item in items:
        if not valid_bdi_point(item):
            continue
        clean_items.append({
            "date": parse_iso(str(item["date"])).isoformat(),
            "value": int(round(float(item["value"]))),
        })
    dedup = {item["date"]: item for item in weekly_latest(clean_items)}
    return sorted(dedup.values(), key=lambda item: item["date"])[-104:]


def validate_bdi_update(
    existing: Iterable[dict[str, Any]],
    incoming: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Reject parser noise and implausible one-week jumps before JSON is changed."""
    current = sanitize_bdi_history(existing)
    candidates = sanitize_bdi_history(incoming)
    if not candidates:
        raise ParseError(
            f"BDI 값이 허용 범위({BDI_MIN_VALUE:,}~{BDI_MAX_VALUE:,})를 벗어났습니다."
        )

    accepted: list[dict[str, Any]] = []
    reference = current[-1] if current else None
    for candidate in candidates:
        if reference and candidate["date"] >= reference["date"]:
            pct = abs(candidate["value"] - reference["value"]) / reference["value"] * 100
            if pct > BDI_MAX_WEEKLY_CHANGE_PCT:
                continue
        accepted.append(candidate)
        if not reference or candidate["date"] >= reference["date"]:
            reference = candidate

    if not accepted:
        raise ParseError(
            f"BDI 주간 변동이 비정상적입니다(허용 최대 {BDI_MAX_WEEKLY_CHANGE_PCT:.0f}%). "
            "직전 정상값을 유지합니다."
        )
    return accepted


def parse_bdi(soup: BeautifulSoup) -> list[dict[str, Any]]:
    """Parse recent Baltic Dry Index observations from a public delayed quote page."""
    page = clean(soup.get_text(" ", strip=True))
    found: dict[str, dict[str, Any]] = {}

    # StockQ format: 2026/07/10 2944.00 1.17%
    for raw_date, raw_value in re.findall(r"(20\d{2}/\d{2}/\d{2})\s+([\d,]+(?:\.\d+)?)\s+[-+]?\d+(?:\.\d+)?%", page):
        day = datetime.strptime(raw_date, "%Y/%m/%d").date().isoformat()
        found[day] = {"date": day, "value": int_num(raw_value)}

    # Investing-style format: Jul 10, 2026 2,944.00 ...
    month_pattern = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
    for raw_date, raw_value in re.findall(
        rf"({month_pattern}\s+\d{{1,2}},\s+20\d{{2}})\s+([\d,]+(?:\.\d+)?)",
        page,
        re.I,
    ):
        day = datetime.strptime(raw_date.title(), "%b %d, %Y").date().isoformat()
        found[day] = {"date": day, "value": int_num(raw_value)}

    # Trading Economics summary fallback: rose to 2,944 ... on July 10, 2026
    summary = re.search(
        r"Baltic Dry (?:rose|fell|decreased|increased|was).*?to\s+([\d,]+(?:\.\d+)?)"
        r"(?:\s+Index Points)?.{0,180}?on\s+"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+"
        r"(\d{1,2}),\s+(20\d{2})",
        page,
        re.I,
    )
    if summary:
        value, month, day_num, year = summary.groups()
        day = datetime.strptime(f"{month} {day_num}, {year}", "%B %d, %Y").date().isoformat()
        found[day] = {"date": day, "value": int_num(value)}

    # Trading Economics current-summary format: "traded ... at 2,732 Index Points on July 31, 2026".
    current_summary = re.search(
        r"Baltic Dry.*?traded.{0,80}?at\s+([\d,]+(?:\.\d+)?)"
        r"(?:\s+Index Points)?.{0,100}?on\s+"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+"
        r"(\d{1,2}),\s+(20\d{2})",
        page,
        re.I,
    )
    if current_summary:
        value, month, day_num, year = current_summary.groups()
        day = datetime.strptime(f"{month} {day_num}, {year}", "%B %d, %Y").date().isoformat()
        found[day] = {"date": day, "value": int_num(value)}

    if not found:
        raise ParseError("BDI 공개 시세를 찾지 못했습니다.")
    parsed = sanitize_bdi_history(found.values())
    if not parsed:
        raise ParseError(
            f"BDI 공개 시세가 허용 범위({BDI_MIN_VALUE:,}~{BDI_MAX_VALUE:,})에 없습니다."
        )
    return parsed

def parse_kcci_timeseries(soup: BeautifulSoup) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for tr in soup.find_all("tr"):
        text = clean(tr.get_text(" ", strip=True))
        match = re.match(r"(20\d{2}-\d{2}-\d{2})\s+([\d,]+)", text)
        if match:
            rows.append({"date": match.group(1), "value": int_num(match.group(2))})
    if not rows:
        page = clean(soup.get_text(" ", strip=True))
        for d, value in re.findall(r"(20\d{2}-\d{2}-\d{2})\s+([\d,]+)", page):
            rows.append({"date": d, "value": int_num(value)})
    if not rows:
        raise ParseError("KCCI 시계열 값을 찾지 못했습니다.")
    dedup = {r["date"]: r for r in rows}
    return sorted(dedup.values(), key=lambda x: x["date"])


def parse_kcci_grid(soup: BeautifulSoup) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Parse KOBC current/previous KCCI values and all route rows from the grid page.

    The grid is authoritative for the newest Monday publication.  The timeseries page
    can lag one publication, so the KCCI row from this grid is also returned as two
    history points and merged into the longer series.
    """
    page = clean(soup.get_text(" ", strip=True))
    table = None
    for candidate in soup.find_all("table"):
        if re.search(r"\bKCCI\b", clean(candidate.get_text(" ", strip=True))):
            table = candidate
            break
    scope = clean((table or soup).get_text(" ", strip=True))
    dates = sorted(set(re.findall(r"20\d{2}-\d{2}-\d{2}", scope)))
    if len(dates) < 2:
        dates = sorted(set(re.findall(r"20\d{2}-\d{2}-\d{2}", page)))
    if len(dates) < 2:
        raise ParseError("KCCI 현재/이전 발표일을 찾지 못했습니다.")
    previous_date, current_date = dates[-2], dates[-1]

    output: list[dict[str, Any]] = []
    rows = (table or soup).find_all("tr")
    for tr in rows:
        cells = [clean(cell.get_text(" ", strip=True)) for cell in tr.find_all(["th", "td"])]
        if not cells:
            continue
        code_index = next((i for i, value in enumerate(cells) if value in ROUTES), None)
        if code_index is None:
            continue
        code = cells[code_index]
        group, label, default_weight = ROUTES[code]
        tail = cells[code_index + 1:]
        if len(tail) < 4:
            continue
        weight_idx = next((i for i, value in enumerate(tail) if re.fullmatch(r"\d+(?:\.\d+)?%", value)), None)
        if weight_idx is None or len(tail) < weight_idx + 4:
            continue
        weight = tail[weight_idx]
        current_raw = tail[weight_idx + 1]
        previous_raw = tail[weight_idx + 2]
        change_raw = " ".join(tail[weight_idx + 3:])
        if not re.fullmatch(r"[\d,]+(?:\.\d+)?", current_raw) or not re.fullmatch(r"[\d,]+(?:\.\d+)?", previous_raw):
            continue
        change_match = re.search(r"([-+]?\d[\d,]*)\s*\(\s*([-+]?\d+(?:\.\d+)?)%\s*\)", change_raw)
        current = int_num(current_raw)
        previous = int_num(previous_raw)
        if change_match:
            change = int_num(change_match.group(1))
            change_pct = float(change_match.group(2))
        else:
            change = current - previous
            change_pct = round((change / previous * 100) if previous else 0.0, 2)
        output.append({
            "group": group,
            "code": code,
            "route": label,
            "weight": weight or default_weight,
            "current": current,
            "previous": previous,
            "change": change,
            "change_pct": change_pct,
        })

    if len(output) < 10:
        raise ParseError(f"KCCI 항로 데이터가 부족합니다({len(output)}개).")
    kcci_row = next((row for row in output if row["code"] == "KCCI"), None)
    if not kcci_row:
        raise ParseError("KCCI 종합지수 행을 찾지 못했습니다.")
    history = [
        {"date": previous_date, "value": kcci_row["previous"]},
        {"date": current_date, "value": kcci_row["current"]},
    ]
    return history, output

def cycle_for_day(day: date) -> tuple[str, str]:
    if day.day >= 16:
        start = day.replace(day=16)
        next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        end = next_month.replace(day=15)
    else:
        this_month = day.replace(day=1)
        previous_month_end = this_month - timedelta(days=1)
        start = previous_month_end.replace(day=16)
        end = day.replace(day=15)
    return start.isoformat(), end.isoformat()


def parse_korean_air_article(soup: BeautifulSoup) -> list[dict[str, Any]]:
    """Parse a Korean Air Cargo monthly Korea-origin international FSC notice."""
    page = clean(soup.get_text(" ", strip=True))
    period_match = re.search(
        r"적용\s*기간\s*[:：]?\s*(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})"
        r"\s*~\s*(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})",
        page,
        re.I,
    )
    if not period_match:
        raise ParseError("대한항공 FSC 공지의 적용기간을 찾지 못했습니다.")
    sy, sm, sd, ey, em, ed = period_match.groups()
    start = normalize_ymd(sy, sm, sd)
    end = normalize_ymd(ey, em, ed)

    def rate(label: str) -> int:
        match = re.search(rf"{label}\s*(?:할증료)?\s*[:：]?\s*([\d,]+)\s*원", page, re.I)
        if not match:
            raise ParseError(f"대한항공 {label} FSC 요율을 찾지 못했습니다.")
        return int_num(match.group(1))

    mops_match = re.search(
        r"(?:싱가포르\s*항공유\s*현물\s*시장가|MOPS).{0,120}?US\s*\$?\s*([\d.]+)\s*/?\s*Gallon",
        page,
        re.I,
    )
    period: dict[str, Any] = {
        "start": start,
        "end": end,
        "short": rate("단거리"),
        "medium": rate("중거리"),
        "long": rate("장거리"),
    }
    if mops_match:
        period["mops"] = float(mops_match.group(1))
    return [period]


def find_korean_air_fsc_article(soup: BeautifulSoup) -> str:
    candidates: list[tuple[str, str]] = []
    for anchor in soup.find_all("a", href=True):
        text = clean(anchor.get_text(" ", strip=True))
        if not re.search(r"한국발\s*국제선\s*화물\s*유류할증료", text):
            continue
        href = urljoin(URLS["korean_air_news"], anchor.get("href", ""))
        if "/cargo-news/" not in href:
            continue
        candidates.append((text, href))
    if not candidates:
        raise ParseError("대한항공 국제선 화물 FSC 최신 공지 링크를 찾지 못했습니다.")
    # The news list is newest-first; use the first matching official notice.
    return candidates[0][1]


def parse_korean_air_service(soup: BeautifulSoup) -> tuple[str, list[dict[str, Any]]]:
    """Fallback parser for the live surcharge page.

    Important: the rate cycle is derived from the page's Last Update date, not the
    workflow execution date.  This prevents a stale page from being assigned to a
    newer 16th~15th cycle.
    """
    page = clean(soup.get_text(" ", strip=True))
    match = re.search(
        r"대한민국\s+KRW\s+([\d,]+)\s+TC1,2.*?KRW\s+([\d,]+)\s+TC3.*?KRW\s+([\d,]+)\s+within\s+2\s+hours",
        page,
        re.I,
    )
    if not match:
        raise ParseError("대한항공 한국발 FSC 요율을 찾지 못했습니다.")
    long_rate, medium_rate, short_rate = map(int_num, match.groups())
    update_match = re.search(r"Last Update\s*(20\d{2})[.\-/](\d{2})[.\-/](\d{2})", page, re.I)
    if not update_match:
        raise ParseError("대한항공 FSC 페이지의 Last Update 날짜를 찾지 못했습니다.")
    checked = normalize_ymd(*update_match.groups())
    start, end = cycle_for_day(parse_iso(checked))
    return checked, [{
        "start": start,
        "end": end,
        "short": short_rate,
        "medium": medium_rate,
        "long": long_rate,
    }]


def fetch_korean_air_fsc() -> tuple[str, list[dict[str, Any]], str]:
    errors: list[str] = []
    try:
        listing = fetch(URLS["korean_air_news"])
        article_url = find_korean_air_fsc_article(listing)
        periods = parse_korean_air_article(fetch(article_url))
        return datetime.now(KST).date().isoformat(), periods, article_url
    except Exception as exc:  # noqa: BLE001
        errors.append(f"cargo-news: {exc}")

    try:
        checked, periods = parse_korean_air_service(fetch(URLS["korean_air"]))
        return checked, periods, URLS["korean_air"]
    except Exception as exc:  # noqa: BLE001
        errors.append(f"surcharge-page: {exc}")
    raise ParseError(" / ".join(errors))


def validate_fsc_coverage(periods: Iterable[dict[str, Any]]) -> None:
    today = datetime.now(KST).date()
    normalized = list(periods)
    if any(parse_iso(item["start"]) <= today <= parse_iso(item["end"]) for item in normalized):
        return
    # Early-month official notices can announce the next 16th before it becomes current.
    if any(today < parse_iso(item["start"]) <= today + timedelta(days=20) for item in normalized):
        return
    raise ParseError("대한항공 FSC 데이터에 현재 또는 다음 적용기간이 없습니다.")

def load_data() -> dict[str, Any]:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def save_data(data: dict[str, Any]) -> None:
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def update(data: dict[str, Any], only: str = "all") -> dict[str, Result]:
    results: dict[str, Result] = {}

    if only in {"all", "ocean", "scfi"}:
      try:
        items, source_key = fetch_scfi()
        assert_fresh("SCFI", items[-1]["date"], 9)
        upsert_history(data["scfi"]["history"], items)
        data["scfi"]["source_url"] = URLS[source_key]
        results["scfi"] = Result(
            True, f"{items[-1]['date']} {items[-1]['value']:,.2f} ({source_key})"
        )
      except Exception as exc:  # noqa: BLE001 - keep prior valid data on any source failure
        results["scfi"] = Result(False, str(exc))

    if only in {"all", "ocean", "kcci"}:
      try:
        errors: list[str] = []
        grid_history: list[dict[str, Any]] = []
        routes: list[dict[str, Any]] = []
        grid_source = ""
        for source_key in ("kcci_grid", "kcci_grid_eng"):
          try:
            grid_history, routes = parse_kcci_grid(fetch(URLS[source_key]))
            grid_source = source_key
            break
          except Exception as exc:  # noqa: BLE001
            errors.append(f"{source_key}: {exc}")
        if not grid_history:
          raise ParseError(" / ".join(errors))
        assert_fresh("KCCI", grid_history[-1]["date"], 10)
        # Timeseries is useful for history but can lag the newest Monday release.
        try:
          timeseries = parse_kcci_timeseries(fetch(URLS["kcci_timeseries"]))
          upsert_history(data["kcci"]["history"], timeseries)
        except Exception as exc:  # noqa: BLE001
          errors.append(f"timeseries(optional): {exc}")
        upsert_history(data["kcci"]["history"], grid_history)
        data["kcci"]["routes"] = routes
        data["kcci"]["source_url"] = URLS[grid_source]
        latest = grid_history[-1]
        suffix = f"; {' / '.join(errors)}" if errors else ""
        results["kcci"] = Result(True, f"{latest['date']} {latest['value']:,} ({grid_source}){suffix}")
      except Exception as exc:  # noqa: BLE001
        results["kcci"] = Result(False, str(exc))

    if only in {"all", "bdi"}:
      errors: list[str] = []
      items: list[dict[str, Any]] = []
      used_source = ""
      bdi = data.setdefault("bdi", {})
      existing_history = sanitize_bdi_history(bdi.setdefault("history", []))
      bdi["history"] = existing_history
      for source_key in ("bdi", "bdi_fallback"):
        try:
          parsed = parse_bdi(fetch(URLS[source_key]))
          items = validate_bdi_update(existing_history, parsed)
          used_source = source_key
          break
        except Exception as exc:  # noqa: BLE001
          errors.append(f"{source_key}: {exc}")
      if items:
        assert_fresh("BDI", items[-1]["date"], 5)
        upsert_history(bdi["history"], items)
        bdi["history"] = sanitize_bdi_history(bdi["history"])
        bdi["last_data_source"] = URLS[used_source]
        latest = bdi["history"][-1]
        results["bdi"] = Result(True, f"{latest['date']} {latest['value']:,} ({used_source})")
      else:
        results["bdi"] = Result(False, " / ".join(errors))

    if only in {"all", "fsc"}:
      # Asiana was intentionally removed from the public page.  Keeping it out of
      # the updater also prevents an unrelated source change from failing FSC updates.
      data.get("fsc", {}).get("providers", {}).pop("asiana", None)
      data.setdefault("meta", {}).setdefault("source_status", {}).pop("asiana", None)
      try:
        checked, periods, article_url = fetch_korean_air_fsc()
        provider = data["fsc"]["providers"]["korean_air"]
        provider["last_checked"] = checked
        provider["source_article_url"] = article_url
        upsert_periods(provider["periods"], periods)
        validate_fsc_coverage(provider["periods"])
        latest = sorted(periods, key=lambda item: item["start"])[-1]
        results["korean_air"] = Result(
            True,
            f"{latest['start']}~{latest['end']} {latest['short']:,}/{latest['medium']:,}/{latest['long']:,}원/kg",
        )
      except Exception as exc:  # noqa: BLE001
        results["korean_air"] = Result(False, str(exc))

    data.setdefault("meta", {})["timezone"] = "Asia/Seoul"
    status = data["meta"].setdefault("source_status", {})
    status.update({key: {"ok": value.ok, "message": value.message} for key, value in results.items()})
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Parse sources but do not write JSON")
    parser.add_argument(
        "--only",
        choices=("all", "ocean", "scfi", "kcci", "bdi", "fsc"),
        default="all",
        help="Update only the selected source or source group",
    )
    args = parser.parse_args()

    original = load_data()
    data = copy.deepcopy(original)
    results = update(data, args.only)
    for key, result in results.items():
        mark = "OK" if result.ok else "WARN"
        print(f"[{mark}] {key}: {result.message}")
    failed = [key for key, result in results.items() if not result.ok]

    def substantive(payload: dict[str, Any]) -> dict[str, Any]:
        clone = copy.deepcopy(payload)
        clone.pop("meta", None)
        for provider in clone.get("fsc", {}).get("providers", {}).values():
            provider.pop("last_checked", None)
        clone.get("bdi", {}).pop("last_data_source", None)
        return clone

    substantive_changed = substantive(data) != substantive(original)
    if substantive_changed:
        data.setdefault("meta", {})["generated_at"] = datetime.now(KST).isoformat(timespec="seconds")

    # Persist source_status even when the published value itself did not change.
    # This clears a stale warning after a parser/source recovery.
    any_changed = data != original
    if not args.dry_run:
        if any_changed:
            save_data(data)
            print(f"Saved: {DATA_PATH}")
        else:
            print("No published value or source status changed; JSON left untouched.")

    if failed:
        print(f"Required source failure: {', '.join(failed)}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
