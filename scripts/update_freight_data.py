#!/usr/bin/env python3
"""Update KBRIDGE freight-index JSON from official public webpages.

The script is intentionally text/regex based rather than tied to fragile CSS classes.
If one source changes or becomes temporarily unavailable, the previous valid data is kept.
"""
from __future__ import annotations

import argparse
import copy
import html
import json
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "freight-data.json"
KST = ZoneInfo("Asia/Seoul")

URLS = {
    "scfi": "https://en.sse.net.cn/indices/scfinew.jsp",
    "kcci_grid": "https://www.kobc.or.kr/ebz/shippinginfo/kcci/gridList.do?mId=0304000000",
    "kcci_timeseries": "https://www.kobc.or.kr/ebz/shippinginfo/timeseries/gridList.do?mId=0304000000",
    "bdi": "https://en.stockq.org/index/BDI.php",
    "bdi_fallback": "https://tradingeconomics.com/commodity/baltic",
    "korean_air": "https://cargo.koreanair.com/ko/services/Surcharge-Information",
    "asiana": "https://asianacargo.com/contents/surcharge.do",
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


def fetch(url: str) -> BeautifulSoup:
    r = session().get(url, timeout=35)
    r.raise_for_status()
    r.encoding = r.apparent_encoding or r.encoding
    return BeautifulSoup(r.text, "html.parser")


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def num(value: str) -> float:
    return float(value.replace(",", ""))


def int_num(value: str) -> int:
    return int(round(num(value)))


def parse_iso(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


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
    page = clean(soup.get_text(" ", strip=True))
    header = re.search(
        r"Previous Index\s*(20\d{2}-\d{2}-\d{2}).*?Current Index\s*(20\d{2}-\d{2}-\d{2})",
        page,
        re.I,
    )
    if not header:
        dates = re.findall(r"20\d{2}-\d{2}-\d{2}", page)
        if len(dates) < 2:
            raise ParseError("SCFI 발표일을 찾지 못했습니다.")
        previous_date, current_date = dates[-2], dates[-1]
    else:
        previous_date, current_date = header.group(1), header.group(2)

    row_text = ""
    for tr in soup.find_all("tr"):
        candidate = clean(tr.get_text(" ", strip=True))
        if re.search(r"Comprehensive\s+Index", candidate, re.I):
            row_text = candidate
            break
    if not row_text:
        match = re.search(r"Comprehensive Index\s+(.{0,160})", page, re.I)
        row_text = match.group(0) if match else ""

    values = [num(x) for x in re.findall(r"-?\d+(?:,\d{3})*(?:\.\d+)?", row_text)]
    if len(values) < 2:
        # Official page can render the row outside a conventional table.
        match = re.search(
            r"Comprehensive Index.*?(\d{3,5}(?:\.\d+)?)\s+(\d{3,5}(?:\.\d+)?)\s+[-+]?\d+(?:\.\d+)?",
            page,
            re.I,
        )
        if not match:
            raise ParseError("SCFI 종합지수 값을 찾지 못했습니다.")
        previous_value, current_value = num(match.group(1)), num(match.group(2))
    else:
        previous_value, current_value = values[-3:-1] if len(values) >= 3 else values[:2]

    return [
        {"date": previous_date, "value": previous_value},
        {"date": current_date, "value": current_value},
    ]



def weekly_latest(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the latest available observation in each ISO week."""
    by_week: dict[tuple[int, int], dict[str, Any]] = {}
    for item in sorted(items, key=lambda x: x["date"]):
        day = parse_iso(str(item["date"]))
        iso = day.isocalendar()
        by_week[(iso.year, iso.week)] = {"date": day.isoformat(), "value": int(round(float(item["value"])))}
    return sorted(by_week.values(), key=lambda x: x["date"])


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

    if not found:
        raise ParseError("BDI 공개 시세를 찾지 못했습니다.")
    return weekly_latest(found.values())

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


def parse_kcci_routes(soup: BeautifulSoup) -> list[dict[str, Any]]:
    page = clean(soup.get_text(" ", strip=True))
    output: list[dict[str, Any]] = []
    for code, (group, label, default_weight) in ROUTES.items():
        # Route label is intentionally not captured; the official English/Korean spelling can change.
        pattern = re.compile(
            rf"\b{re.escape(code)}\b\s+.*?\s+(\d+(?:\.\d+)?)%\s+"
            r"([\d,]+)\s+([\d,]+)\s+([-+]?\d[\d,]*)\s*\(([-+]?\d+(?:\.\d+)?)%\)",
            re.I,
        )
        match = pattern.search(page)
        if not match:
            continue
        weight, current, previous, change, change_pct = match.groups()
        output.append(
            {
                "group": group,
                "code": code,
                "route": label,
                "weight": f"{weight}%" if weight else default_weight,
                "current": int_num(current),
                "previous": int_num(previous),
                "change": int_num(change),
                "change_pct": float(change_pct),
            }
        )
    if len(output) < 10:
        raise ParseError(f"KCCI 항로 데이터가 부족합니다({len(output)}개).")
    return output


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


def parse_korean_air(soup: BeautifulSoup) -> tuple[str, list[dict[str, Any]]]:
    page = clean(soup.get_text(" ", strip=True))
    match = re.search(
        r"대한민국\s+KRW\s+([\d,]+)\s+TC1,2.*?KRW\s+([\d,]+)\s+TC3.*?KRW\s+([\d,]+)\s+within\s+2\s+hours",
        page,
        re.I,
    )
    if not match:
        raise ParseError("대한항공 한국발 FSC 요율을 찾지 못했습니다.")
    long_rate, medium_rate, short_rate = map(int_num, match.groups())
    update_match = re.search(r"Last Update\s*(20\d{2})[.-](\d{2})[.-](\d{2})", page, re.I)
    checked = (
        f"{update_match.group(1)}-{update_match.group(2)}-{update_match.group(3)}"
        if update_match
        else datetime.now(KST).date().isoformat()
    )
    start, end = cycle_for_day(datetime.now(KST).date())
    return checked, [
        {
            "start": start,
            "end": end,
            "short": short_rate,
            "medium": medium_rate,
            "long": long_rate,
        }
    ]


def parse_asiana(soup: BeautifulSoup) -> tuple[str, list[dict[str, Any]]]:
    # The official page exposes the history as a table on some responses and as
    # values inside scripts/attributes on others. Inspect both visible text and raw HTML.
    visible = clean(soup.get_text(" ", strip=True))
    raw = clean(html.unescape(str(soup)))
    blobs = [visible, raw]
    periods: list[dict[str, Any]] = []

    labelled = re.compile(
        r"(20\d{2}-\d{2}-\d{2})\s*~\s*(20\d{2}-\d{2}-\d{2}).{0,180}?"
        r"MOPS.{0,40}?([\d.]+).{0,220}?"
        r"(?:Short[- ]distance|단거리).{0,80}?([\d,]+).{0,180}?"
        r"(?:Mid[- ]distance|Medium[- ]distance|중거리).{0,80}?([\d,]+).{0,180}?"
        r"(?:Long[- ]distance|장거리).{0,80}?([\d,]+)",
        re.I,
    )
    compact = re.compile(
        r"(20\d{2}-\d{2}-\d{2})\s*~\s*(20\d{2}-\d{2}-\d{2})"
        r".{0,100}?([1-9]\d?\.\d{2,5}).{0,100}?([\d,]{2,6})"
        r".{0,80}?([\d,]{2,6}).{0,80}?([\d,]{2,6})",
        re.I,
    )

    found: dict[str, dict[str, Any]] = {}
    for blob in blobs:
        matches = list(labelled.findall(blob)) or list(compact.findall(blob))
        for start, end, mops, short, medium, long_rate in matches:
            rates = tuple(map(int_num, (short, medium, long_rate)))
            # Reject dates or unrelated large figures accidentally captured from navigation text.
            if not all(0 <= rate <= 10000 for rate in rates):
                continue
            found[start] = {
                "start": start,
                "end": end,
                "mops": float(mops),
                "short": rates[0],
                "medium": rates[1],
                "long": rates[2],
            }

    # Conventional table-row fallback is the least ambiguous representation.
    for tr in soup.find_all("tr"):
        text = clean(tr.get_text(" ", strip=True))
        match = re.search(
            r"(20\d{2}-\d{2}-\d{2})\s*~\s*(20\d{2}-\d{2}-\d{2})\s+"
            r"([1-9]\d?\.\d{2,5})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)",
            text,
        )
        if match:
            start, end, mops, short, medium, long_rate = match.groups()
            found[start] = {
                "start": start,
                "end": end,
                "mops": float(mops),
                "short": int_num(short),
                "medium": int_num(medium),
                "long": int_num(long_rate),
            }

    periods = sorted(found.values(), key=lambda item: item["start"], reverse=True)[:6]
    if not periods:
        raise ParseError("아시아나 한국발 FSC 요율을 찾지 못했습니다.")
    return datetime.now(KST).date().isoformat(), periods


def load_data() -> dict[str, Any]:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def save_data(data: dict[str, Any]) -> None:
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def update(data: dict[str, Any], only: str = "all") -> dict[str, Result]:
    results: dict[str, Result] = {}

    if only in {"all", "ocean"}:
      try:
        items = parse_scfi(fetch(URLS["scfi"]))
        upsert_history(data["scfi"]["history"], items)
        results["scfi"] = Result(True, f"{items[-1]['date']} {items[-1]['value']:,.2f}")
      except Exception as exc:  # noqa: BLE001 - keep prior valid data on any source failure
        results["scfi"] = Result(False, str(exc))

      try:
        timeseries = parse_kcci_timeseries(fetch(URLS["kcci_timeseries"]))
        upsert_history(data["kcci"]["history"], timeseries)
        routes = parse_kcci_routes(fetch(URLS["kcci_grid"]))
        data["kcci"]["routes"] = routes
        results["kcci"] = Result(True, f"{timeseries[-1]['date']} {timeseries[-1]['value']:,}")
      except Exception as exc:  # noqa: BLE001
        results["kcci"] = Result(False, str(exc))

    if only in {"all", "bdi"}:
      errors: list[str] = []
      items: list[dict[str, Any]] = []
      used_source = ""
      for source_key in ("bdi", "bdi_fallback"):
        try:
          items = parse_bdi(fetch(URLS[source_key]))
          used_source = source_key
          break
        except Exception as exc:  # noqa: BLE001
          errors.append(f"{source_key}: {exc}")
      if items:
        data.setdefault("bdi", {}).setdefault("history", [])
        upsert_history(data["bdi"]["history"], items)
        data["bdi"]["last_data_source"] = URLS[used_source]
        results["bdi"] = Result(True, f"{items[-1]['date']} {items[-1]['value']:,} ({used_source})")
      else:
        results["bdi"] = Result(False, " / ".join(errors))

    if only in {"all", "fsc"}:
      try:
        checked, periods = parse_korean_air(fetch(URLS["korean_air"]))
        provider = data["fsc"]["providers"]["korean_air"]
        provider["last_checked"] = checked
        upsert_periods(provider["periods"], periods)
        results["korean_air"] = Result(True, f"{checked} FSC 반영")
      except Exception as exc:  # noqa: BLE001
        results["korean_air"] = Result(False, str(exc))

      try:
        checked, periods = parse_asiana(fetch(URLS["asiana"]))
        provider = data["fsc"]["providers"]["asiana"]
        provider["last_checked"] = checked
        upsert_periods(provider["periods"], periods)
        results["asiana"] = Result(True, f"{checked} {len(periods)}개 기간 반영")
      except Exception as exc:  # noqa: BLE001
        results["asiana"] = Result(False, str(exc))

    data.setdefault("meta", {})["timezone"] = "Asia/Seoul"
    status = data["meta"].setdefault("source_status", {})
    status.update({key: {"ok": value.ok, "message": value.message} for key, value in results.items()})
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Parse sources but do not write JSON")
    parser.add_argument("--only", choices=("all", "ocean", "bdi", "fsc"), default="all", help="Update only the selected source group")
    args = parser.parse_args()

    original = load_data()
    data = copy.deepcopy(original)
    results = update(data, args.only)
    for key, result in results.items():
        mark = "OK" if result.ok else "WARN"
        print(f"[{mark}] {key}: {result.message}")
    if not any(result.ok for result in results.values()):
        print("All sources failed; refusing a silent success.", file=sys.stderr)
        return 2

    def substantive(payload: dict[str, Any]) -> dict[str, Any]:
        clone = copy.deepcopy(payload)
        clone.pop("meta", None)
        for provider in clone.get("fsc", {}).get("providers", {}).values():
            provider.pop("last_checked", None)
        clone.get("bdi", {}).pop("last_data_source", None)
        return clone

    changed = substantive(data) != substantive(original)
    if not args.dry_run:
        if changed:
            data.setdefault("meta", {})["generated_at"] = datetime.now(KST).isoformat(timespec="seconds")
            save_data(data)
            print(f"Saved: {DATA_PATH}")
        else:
            print("No published value changed; JSON left untouched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
