#!/usr/bin/env python3
"""Regression checks for the homepage quote flow after quick-finder removal.

This is a source-level contract test, not a browser rendering test.
"""
from __future__ import annotations

import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
HOME = ROOT / "index.html"
CHROME = ROOT / "assets/site-chrome.js"
MOBILE_CSS = ROOT / "assets/css/mobile-readability-v1.css"
CONTRAST_CSS = ROOT / "assets/css/quote-contrast.css"
ERRORS: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        ERRORS.append(message)


def main() -> None:
    home = BeautifulSoup(HOME.read_text("utf-8"), "html.parser")
    js = CHROME.read_text("utf-8")
    mobile_css = MOBILE_CSS.read_text("utf-8")
    contrast_css = CONTRAST_CSS.read_text("utf-8")

    check(not home.select(".formal-quote-band"), "중복된 정식견적 홍보 띠가 다시 생김")
    check(bool(home.select_one("#services.kbix-section-anchor")), "기존 #services 링크 앵커 누락")
    check(bool(home.select_one(".header-actions > .header-btn")), "상단 견적 버튼 누락")
    check(not home.select_one('.header-actions a[href^="mailto:"]'), "상단 메일 문의 버튼 재생성")

    for ident in ("seaDialog", "expressDialog", "formalDialog"):
        check(bool(home.select_one(f"dialog#{ident} .dialog-head h2")), f"{ident}: 견적 팝업 제목 없음")
        check(f"#{ident} .dialog-head" in contrast_css, f"{ident}: 글자 대비 스타일 없음")
    for ident in ("seaForm", "expressForm", "formalForm"):
        check(bool(home.select_one(f"form#{ident}")), f"{ident}: 제출 폼 없음")
    dialog_ids = {x.get("id") for x in home.select("dialog[id]")}
    targets = [x.get("data-open") for x in home.select("[data-open]")]
    check(all(target in dialog_ids for target in targets), "버튼 data-open에 일치하는 팝업이 없음")
    check({"seaDialog", "expressDialog", "formalDialog"}.issubset(set(targets)), "주요 견적 팝업으로 가는 버튼 누락")

    for obsolete in ("kbix-palette", "kbix-search-trigger", "kbix-mobile-trigger", "quick-finder-v4.css", "openPalette"):
        check(obsolete not in js, f"제거된 빠른 찾기 UI 코드 남음: {obsolete}")
    check("initHomeFinder(base)" in js, "화물별 운송 추천 기능 누락")
    check(not (ROOT / "assets/css/quick-finder-v4.css").exists(), "미사용 빠른 찾기 CSS가 남음")
    for selector in (".mobile-nav", ".kbix-recommend", ".dialog-head", ".kb-blog-post"):
        check(selector in mobile_css, f"모바일 대비 스타일 없음: {selector}")

    linked = 0
    for page in ROOT.rglob("*.html"):
        source = page.read_text("utf-8")
        if "site-chrome.js" not in source:
            continue
        linked += 1
        check("site-chrome.js?v=20261018-clean-v1" in source, f"구버전 스크립트 참조: {page.relative_to(ROOT)}")
        check("mobile-readability-v1.css" in source, f"모바일 가독성 CSS 누락: {page.relative_to(ROOT)}")
        if "header-actions" in source:
            check('class="header-link" href="mailto:' not in source, f"헤더 문의 이메일 복귀: {page.relative_to(ROOT)}")

    if ERRORS:
        print(f"INTERACTIVE V4 QA FAIL: {len(ERRORS)}")
        for item in ERRORS:
            print("-", item)
        raise SystemExit(1)
    print("INTERACTIVE CLEAN QA PASS")
    print("- quick finder removed, cargo recommendations and 3 quote dialogs preserved")
    print(f"- refreshed site chrome pages: {linked}")
    print("- quote dialog targets/forms, readable heading selectors, removed duplicate band: normal")


if __name__ == "__main__":
    main()
