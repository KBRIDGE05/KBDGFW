#!/usr/bin/env python3
"""QA for KBRIDGE deprecated URL compatibility pages.

Known historical URLs must return a lightweight HTML page instead of a hard
400/404, while staying out of the index, sitemap, RSS, manifest and current
internal-link graph. Search query forwarding must preserve the q parameter.
"""
from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://www.kbexpress.kr"
MAP = ROOT / "scripts" / "legacy-url-map.json"
errors: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


def meta(soup: BeautifulSoup, name: str) -> str:
    node = soup.find("meta", attrs={"name": re.compile(rf"^{re.escape(name)}$", re.I)})
    return str(node.get("content", "")).strip() if node else ""


def canonical(soup: BeautifulSoup) -> str:
    node = soup.find("link", rel=lambda value: value and "canonical" in value)
    return str(node.get("href", "")).strip() if node else ""


def local_file_for_url(url: str) -> Path | None:
    parsed = urlparse(url)
    if parsed.netloc and parsed.netloc not in {"www.kbexpress.kr", "kbexpress.kr"}:
        return None
    path = parsed.path or "/"
    if path == "/":
        return ROOT / "index.html"
    candidate = ROOT / path.lstrip("/")
    if path.endswith("/"):
        candidate = candidate / "index.html"
    return candidate


def main() -> None:
    if not MAP.exists():
        fail("scripts/legacy-url-map.json 누락")
        rows = []
    else:
        try:
            rows = json.loads(MAP.read_text("utf-8"))
        except Exception as exc:
            fail(f"legacy-url-map.json 파싱 실패: {exc}")
            rows = []

    legacy_paths = {str(row.get("path", "")).strip() for row in rows if row.get("path")}
    legacy_files = {str(row.get("file", "")).strip() for row in rows if row.get("file")}

    for row in rows:
        rel = str(row.get("file", "")).strip()
        old_path = str(row.get("path", "")).strip()
        expected_canonical = str(row.get("canonical", "")).strip()
        target = str(row.get("target", "")).strip()
        kind = str(row.get("type", "")).strip()
        page = ROOT / rel
        if not rel or not page.exists():
            fail(f"호환 페이지 누락: {rel or old_path}")
            continue
        source = page.read_text("utf-8", errors="strict")
        soup = BeautifulSoup(source, "html.parser")
        if not soup.body or soup.body.get("data-kb-legacy-url") != old_path:
            fail(f"legacy marker 불일치: {rel}")
        for bot in ("robots", "naverbot", "yeti"):
            value = meta(soup, bot).lower().replace(" ", "")
            if "noindex" not in value or "follow" not in value:
                fail(f"{rel}: {bot}=noindex,follow 누락 ({value!r})")
        if canonical(soup) != expected_canonical:
            fail(f"{rel}: canonical 불일치 ({canonical(soup)!r} != {expected_canonical!r})")
        target_file = local_file_for_url(target)
        if target_file is not None and not target_file.exists():
            fail(f"{rel}: 이동 대상 로컬 파일 누락 -> {target}")
        if "location.replace" not in source:
            fail(f"{rel}: location.replace 이동 처리 누락")
        if kind == "search-forward":
            for token in ("URLSearchParams", "oldParams.get('q')", "next.searchParams.set('q',q)"):
                if token not in source:
                    fail(f"{rel}: 검색어 전달 로직 누락 ({token})")
        elif target and target not in source:
            fail(f"{rel}: 이동 대상 URL이 문서에 없음 -> {target}")

    # Deprecated URLs must never be index sources again.
    sitemap = (ROOT / "sitemap.xml").read_text("utf-8", errors="ignore") if (ROOT / "sitemap.xml").exists() else ""
    rss = (ROOT / "rss.xml").read_text("utf-8", errors="ignore") if (ROOT / "rss.xml").exists() else ""
    manifest = (ROOT / "assets" / "blog-posts.json").read_text("utf-8", errors="ignore") if (ROOT / "assets" / "blog-posts.json").exists() else ""
    for old_path in sorted(legacy_paths):
        absolute = SITE + old_path
        for label, text in (("sitemap", sitemap), ("RSS", rss), ("blog manifest", manifest)):
            if absolute in text:
                fail(f"{label}에 폐기 URL 재등록: {absolute}")

    # Current HTML must not point users/crawlers to deprecated addresses.
    for page in sorted(ROOT.rglob("*.html")):
        rel = page.relative_to(ROOT).as_posix()
        if rel in legacy_files or ".git" in page.parts:
            continue
        soup = BeautifulSoup(page.read_text("utf-8", errors="ignore"), "html.parser")
        for anchor in soup.find_all("a", href=True):
            href = str(anchor.get("href", "")).strip()
            try:
                parsed = urlparse(href)
            except Exception:
                continue
            candidate = parsed.path if parsed.scheme or parsed.netloc else href.split("?", 1)[0].split("#", 1)[0]
            if candidate in legacy_paths or (candidate.startswith("/") and candidate in legacy_paths):
                fail(f"현재 HTML 내부링크가 폐기 URL 사용: {rel} -> {href}")

    blog_js = (ROOT / "assets" / "blog.js").read_text("utf-8", errors="ignore")
    for token in ('initialParams.get("q")', 'url.searchParams.set("q",q)', 'search.value=requestedQuery'):
        if token not in blog_js:
            fail(f"assets/blog.js 검색 q 호환 로직 누락: {token}")

    # The standard index audit must continue to exclude these noindex pages.
    if not (ROOT / "scripts" / "audit-indexing.py").exists():
        fail("scripts/audit-indexing.py 누락")

    if errors:
        print(f"LEGACY URL QA FAIL: {len(errors)}개")
        for item in errors:
            print(f"- {item}")
        sys.exit(1)

    print("LEGACY URL QA PASS")
    print(f"- compatibility pages: {len(rows)}")
    print("- noindex/follow + canonical + redirect/search-forward: 정상")
    print("- sitemap/RSS/blog manifest 재등록 방지: 정상")
    print("- 현재 HTML 내부링크의 폐기 URL 재사용: 0건")
    print("- legacy search q 파라미터 전달: 정상")


if __name__ == "__main__":
    main()
