#!/usr/bin/env python3
"""Enforce one canonical KBRIDGE header/mobile shell on every blog post.

This intentionally leaves authored article content, page-specific CSS, metadata,
and images untouched. Only the site chrome is normalized and the shared blog
CSS/JS references are refreshed.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POSTS_ROOT = ROOT / "blog" / "posts"
CATEGORIES = {"info", "service", "news", "insight", "glossary"}
STYLE_VERSION = "20260826-blog-unified-v26"
SCRIPT_VERSION = "20260826-blog-unified-v26"

STYLE_LINK_RE = re.compile(
    r'<link\b[^>]*href=["\'][^"\']*(?:kbridge-design-system\.css|pages/blog-unified\.css)[^"\']*["\'][^>]*>\s*',
    re.I,
)
SCRIPT_SRC_RE = re.compile(
    r'<script\b[^>]*src=["\'][^"\']*(?:enterprise-motion\.js|site-chrome\.js|kebby-chat\.js)[^"\']*["\'][^>]*>\s*</script>\s*',
    re.I,
)
SCRIPT_BLOCK_RE = re.compile(r'<script\b([^>]*)>([\s\S]*?)</script>\s*', re.I)
SITE_HEADER_RE = re.compile(
    r'<header\b[^>]*class=["\'][^"\']*(?:header|kb-header)[^"\']*["\'][^>]*>[\s\S]*?</header>',
    re.I,
)
BODY_RE = re.compile(r'<body\b([^>]*)>', re.I)
CLASS_ATTR_RE = re.compile(r'\bclass\s*=\s*(["\'])(.*?)\1', re.I | re.S)
LOCAL_PAGE_STYLE_RE = re.compile(
    r'<link\b[^>]*href=["\'](?P<href>[^"\']*assets/css/pages/[^"\']+\.css(?:\?[^"\']*)?)["\'][^>]*>\s*',
    re.I,
)

CANONICAL_HEADER = '''<header class="header" id="top"><div class="container header-inner"><a aria-label="케이브릿지 메인 화면으로 이동" class="brand" data-brand-action="home" href="../../../index.html" title="케이브릿지 메인 화면으로 이동"><span aria-hidden="true" class="brand-symbol"><svg aria-hidden="true" focusable="false" preserveaspectratio="xMidYMid meet" viewbox="0 0 100 100"><rect fill="#2B5CDB" height="90" rx="20" width="90" x="5" y="5"></rect><path d="M27 22h15v25.5L64 22h20L55.5 51 85 78H64L42 57v21H27z" fill="#FFFFFF"></path></svg></span><span class="brand-copy"><strong>KBRIDGE</strong></span></a><nav aria-label="주요 메뉴" class="nav"><a href="../../../index.html#services">즉시견적</a><a href="../../../quote-comparison.html">견적서 비교</a><a href="../../../warehouse-inquiry.html">창고 문의</a><div class="nav-dropdown"><button aria-expanded="false" aria-haspopup="true" class="nav-dropdown-toggle" type="button">국내운송</button><div class="nav-dropdown-menu"><small>DOMESTIC TRANSPORT</small><a href="../../../domestic.html">국내운송 안내<span>운송 서비스와 견적 접수</span></a><a href="../../../load-planner.html">차량 배차 시뮬레이터<span>차량 추천·3D 적입 배치</span></a><a href="../../../safe-rate.html#safe-rate-tool">안전운임 조회<span>2026 고시·공식 운임표 확인</span></a><a href="../../../vehicle-spec.html#vehicle-spec-tool">차량 제원 조회<span>톤수·적재함·팔레트 비교</span></a></div></div><a href="../../../freight-index.html">운임지수</a><div class="nav-dropdown tools-nav-dropdown"><button aria-expanded="false" aria-haspopup="true" class="nav-dropdown-toggle" type="button">물류도구</button><div class="nav-dropdown-menu tools-dropdown-menu"><small>LOGISTICS TOOLS</small><a href="../../../duty-calculator.html">관부가세 계산기<span>해외직구·특송 예상 세액 계산</span></a><a href="../../../customs-exchange-rate.html">관세청 고시환율<span>수입신고 기준환율 확인</span></a><a href="../../../cbm-calculator.html">CBM 계산기<span>박스 규격·수량으로 부피 계산</span></a><a href="../../../holiday-calendar.html">전세계 공휴일 조회<span>국가별 휴무 일정 확인</span></a><a href="../../../hs-code-search.html">HS CODE 조회<span>품명·재질·용도 기준 검색</span></a><a href="../../../incoterms-guide.html">인코텀즈 가이드<span>거래조건별 비용·위험 비교</span></a><a href="../../../lcl-storage.html">LCL 창고료<span>CFS 예상비용 계산</span></a><a href="../../../dangerous-goods.html">위험물 정보 조회<span>UN 번호·Class 정보 확인</span></a><a href="../../../vessel-location.html">실시간 선박 위치<span>MarineTraffic 공식 지도 연결</span></a><a href="../../../terminal-info.html">터미널 정보 조회<span>터미널 코드·작업정보 확인</span></a></div></div><div class="nav-dropdown blog-nav-dropdown active"><button aria-expanded="false" aria-haspopup="true" class="nav-dropdown-toggle" type="button">블로그</button><div class="nav-dropdown-menu blog-dropdown-menu"><small>KBRIDGE BLOG</small><a href="../../../blog/index.html?category=info">물류 정보<span>수출입 실무와 운송 참고 정보</span></a><a href="../../../blog/index.html?category=service">물류 서비스<span>케이브릿지 운송·통관 서비스 안내</span></a><a href="../../../blog/index.html?category=news">물류 뉴스<span>해상·항공·공급망 주요 소식</span></a><a href="../../../blog/index.html?category=insight">물류 인사이트<span>시장 변화와 실무 대응 분석</span></a><a href="../../../blog/index.html?category=glossary">물류 용어집<span>수출입 물류 핵심 용어 정리</span></a></div></div></nav><div class="header-actions"><a class="header-link" href="mailto:all@kbridges.co.kr">문의</a><a class="header-btn" href="../../../index.html#services">견적 받기</a></div><button aria-controls="mobileNav" aria-expanded="false" aria-label="메뉴 열기" class="menu-btn" id="menuBtn" type="button"><span></span></button></div></header>'''

CANONICAL_MOBILE = '''<div aria-hidden="true" aria-label="모바일 메뉴" class="mobile-nav" id="mobileNav"><a href="../../../index.html#services">즉시견적 <span>→</span></a><a href="../../../quote-comparison.html">견적서 비교 <span>→</span></a><a href="../../../warehouse-inquiry.html">창고 문의 <span>→</span></a><div class="mobile-nav-group"><span class="mobile-nav-label">국내운송</span><a href="../../../domestic.html">국내운송 안내 <span>→</span></a><a href="../../../load-planner.html">차량 배차 시뮬레이터 <span>→</span></a><a href="../../../safe-rate.html#safe-rate-tool">안전운임 조회 <span>→</span></a><a href="../../../vehicle-spec.html#vehicle-spec-tool">차량 제원 조회 <span>→</span></a></div><a href="../../../freight-index.html">운임지수 <span>→</span></a><div class="mobile-nav-group tools-mobile-group"><span class="mobile-nav-label">물류도구</span><a href="../../../duty-calculator.html">관부가세 계산기 <span>→</span></a><a href="../../../customs-exchange-rate.html">관세청 고시환율 <span>→</span></a><a href="../../../cbm-calculator.html">CBM 계산기 <span>→</span></a><a href="../../../holiday-calendar.html">전세계 공휴일 조회 <span>→</span></a><a href="../../../hs-code-search.html">HS CODE 조회 <span>→</span></a><a href="../../../incoterms-guide.html">인코텀즈 가이드 <span>→</span></a><a href="../../../lcl-storage.html">LCL 창고료 <span>→</span></a><a href="../../../dangerous-goods.html">위험물 정보 조회 <span>→</span></a><a href="../../../vessel-location.html">실시간 선박 위치 <span>→</span></a><a href="../../../terminal-info.html">터미널 정보 조회 <span>→</span></a></div><div class="mobile-nav-group blog-mobile-group"><span class="mobile-nav-label">블로그</span><a href="../../../blog/index.html?category=info">물류 정보 <span>→</span></a><a href="../../../blog/index.html?category=service">물류 서비스 <span>→</span></a><a href="../../../blog/index.html?category=news">물류 뉴스 <span>→</span></a><a href="../../../blog/index.html?category=insight">물류 인사이트 <span>→</span></a><a href="../../../blog/index.html?category=glossary">물류 용어집 <span>→</span></a></div><a href="../../../index.html#services">견적 받기 <span>→</span></a></div>'''

SHARED_STYLES = f'''<link href="../../../assets/css/kbridge-design-system.css?v={STYLE_VERSION}" rel="stylesheet"/>\n<link href="../../../assets/css/pages/blog-unified.css?v={STYLE_VERSION}" rel="stylesheet"/>'''
SHARED_SCRIPTS = f'''<script defer src="../../../assets/enterprise-motion.js?v=20260720-v17"></script>\n<script defer src="../../../assets/site-chrome.js?v={SCRIPT_VERSION}"></script>\n<script defer src="../../../assets/kebby-chat.js?v={SCRIPT_VERSION}"></script>'''


def remove_legacy_menu_script(match: re.Match[str]) -> str:
    attrs, code = match.group(1), match.group(2)
    if re.search(r'\bsrc\s*=', attrs, re.I):
        return match.group(0)
    if re.search(r'\btype\s*=\s*["\']application/ld\+json["\']', attrs, re.I):
        return match.group(0)
    if "menuBtn" in code and "mobileNav" in code:
        return ""
    return match.group(0)


def ensure_body_classes(source: str) -> str:
    match = BODY_RE.search(source)
    if not match:
        return source
    attrs = match.group(1)
    required = ["site-subpage", "kb-unified-site", "kb-blog-post"]
    class_match = CLASS_ATTR_RE.search(attrs)
    if class_match:
        classes = class_match.group(2).split()
        for item in required:
            if item not in classes:
                classes.append(item)
        quote = class_match.group(1)
        replacement = f'class={quote}{" ".join(classes)}{quote}'
        attrs = attrs[:class_match.start()] + replacement + attrs[class_match.end():]
    else:
        attrs = attrs.rstrip() + ' class="' + ' '.join(required) + '"'
    return source[:match.start()] + f"<body{attrs}>" + source[match.end():]


def remove_missing_page_styles(source: str, html_path: Path) -> str:
    """Remove only broken local page stylesheet links; shared styles are re-added later."""
    def repl(match: re.Match[str]) -> str:
        href = match.group("href").split("?", 1)[0]
        if href.startswith(("http://", "https://", "//", "/")):
            return match.group(0)
        target = (html_path.parent / href).resolve()
        try:
            target.relative_to(ROOT.resolve())
        except ValueError:
            return match.group(0)
        return match.group(0) if target.exists() else ""
    return LOCAL_PAGE_STYLE_RE.sub(repl, source)


def normalize_shell(source: str, html_path: Path | None = None) -> str:
    if html_path is not None:
        source = remove_missing_page_styles(source, html_path)
    source = STYLE_LINK_RE.sub("", source)
    source = SCRIPT_SRC_RE.sub("", source)
    source = SCRIPT_BLOCK_RE.sub(remove_legacy_menu_script, source)
    source = ensure_body_classes(source)

    main = re.search(r'<main\b', source, re.I)
    if main:
        prefix, suffix = source[:main.start()], source[main.start():]
        headers = list(SITE_HEADER_RE.finditer(prefix))
        canonical = CANONICAL_HEADER + "\n" + CANONICAL_MOBILE + "\n"
        if headers:
            h = headers[-1]
            # The site header is the last shell element before <main>; replacing
            # through <main> also removes any legacy mobile-nav implementation.
            prefix = prefix[:h.start()] + canonical
        else:
            prefix = prefix.rstrip() + "\n" + canonical
        source = prefix + suffix

    source = re.sub(r'</head>', SHARED_STYLES + "\n</head>", source, count=1, flags=re.I)
    source = re.sub(r'</body>', SHARED_SCRIPTS + "\n</body>", source, count=1, flags=re.I)
    return source.replace("\r\n", "\n")


def main() -> None:
    changed: list[str] = []
    for path in sorted(POSTS_ROOT.glob("*/*.html")):
        if path.parent.name not in CATEGORIES:
            continue
        original = path.read_text(encoding="utf-8")
        updated = normalize_shell(original, path)
        if updated != original:
            path.write_text(updated, encoding="utf-8", newline="\n")
            changed.append(path.relative_to(ROOT).as_posix())
    print(f"블로그 공통 헤더/쉘 정규화 완료: {len(changed)}개 파일 변경")
    for item in changed:
        print(f"- {item}")


if __name__ == "__main__":
    main()
