#!/usr/bin/env python3
"""Normalize KBRIDGE blog article SEO and header without altering article content."""
from __future__ import annotations

import html as html_lib
import json
import re
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
SITE_URL = "https://www.kbexpress.kr"
POSTS_ROOT = ROOT / "blog" / "posts"
RSS_URL = f"{SITE_URL}/rss.xml"

CATEGORY_LABELS = {
    "info": "물류 정보",
    "service": "물류 서비스",
    "news": "물류 뉴스",
    "insight": "물류 인사이트",
    "glossary": "물류 용어집",
}

HEADER_HTML = '''<header class="kb-header"><div class="kb-header-inner"><a class="kb-logo" href="https://www.kbexpress.kr/index.html" aria-label="케이브릿지 홈"><span class="kb-logo-mark">K</span><span>KBRIDGE</span></a><nav class="kb-nav" aria-label="주요 메뉴"><a href="https://www.kbexpress.kr/index.html#quote">즉시견적</a><a href="https://www.kbexpress.kr/quote-comparison.html">견적서 비교</a><a href="https://www.kbexpress.kr/warehouse-inquiry.html">창고 문의</a><a href="https://www.kbexpress.kr/domestic.html">국내운송</a><a href="https://www.kbexpress.kr/freight-index.html">운임지수</a><a href="https://www.kbexpress.kr/convenience.html">물류도구</a><a href="https://www.kbexpress.kr/blog/">블로그</a></nav><div class="kb-actions"><a class="kb-contact" href="https://www.kbexpress.kr/index.html#contact">문의</a><a class="kb-quote" href="https://www.kbexpress.kr/index.html?quote=formal">즉시 견적</a></div></div></header>'''

META_TAG_RE = re.compile(r"<meta\b[^>]*>", re.I)
LINK_TAG_RE = re.compile(r"<link\b[^>]*>", re.I)
LD_JSON_RE = re.compile(
    r'(<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>)([\s\S]*?)(</script>)',
    re.I,
)
AUTO_BLOCK_RE = re.compile(
    r"\s*<!-- KBRIDGE_AUTO_SEO_START -->[\s\S]*?<!-- KBRIDGE_AUTO_SEO_END -->\s*",
    re.I,
)


def decode(value: str) -> str:
    return html_lib.unescape(re.sub(r"\s+", " ", value or "")).strip()


def strip_tags(value: str) -> str:
    value = re.sub(r"<script\b[\s\S]*?</script>", " ", value or "", flags=re.I)
    value = re.sub(r"<style\b[\s\S]*?</style>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    return decode(value)


def attr_value(tag: str, name: str) -> str:
    pattern = re.compile(
        rf"\b{re.escape(name)}\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))",
        re.I,
    )
    match = pattern.search(tag)
    if not match:
        return ""
    return decode(next(group for group in match.groups() if group is not None))


def all_meta(source: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for tag in META_TAG_RE.findall(source):
        key = (attr_value(tag, "name") or attr_value(tag, "property")).lower()
        content = attr_value(tag, "content")
        if key and content and key not in result:
            result[key] = content
    return result


def tag_text(source: str, tag: str) -> str:
    match = re.search(rf"<{tag}\b[^>]*>([\s\S]*?)</{tag}>", source, re.I)
    return strip_tags(match.group(1)) if match else ""


def first_content_image(source: str) -> str:
    body = re.search(r"<(?:article|main)\b[^>]*>([\s\S]*?)</(?:article|main)>", source, re.I)
    region = body.group(1) if body else source
    for tag in re.findall(r"<img\b[^>]*>", region, re.I):
        src = attr_value(tag, "src") or attr_value(tag, "data-src")
        if not src or src.lower().startswith("data:"):
            continue
        label = f"{src} {attr_value(tag, 'alt')}".lower()
        if re.search(r"logo|icon|favicon|avatar", label):
            continue
        return src
    return ""


def json_candidates(source: str) -> list[object]:
    values: list[object] = []
    for _, raw, _ in LD_JSON_RE.findall(source):
        try:
            values.append(json.loads(html_lib.unescape(raw).strip()))
        except Exception:
            continue
    return values


def find_json_value(value: object, key: str) -> str:
    if isinstance(value, dict):
        if key in value and isinstance(value[key], str) and value[key].strip():
            return value[key].strip()
        for child in value.values():
            found = find_json_value(child, key)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_json_value(child, key)
            if found:
                return found
    return ""


def normalize_date(value: str, fallback: str = "2026-07-18") -> str:
    raw = strip_tags(value)
    match = re.search(r"(20\d{2})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})", raw)
    if not match:
        return fallback
    return f"{match.group(1)}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"


def iso_kst(date: str) -> str:
    return f"{date}T09:00:00+09:00"


def escape_attr(value: str) -> str:
    return html_lib.escape(value or "", quote=True)


def remove_conflicting_head_tags(source: str) -> str:
    remove_keys = {
        "robots", "naverbot", "yeti",
        "og:type", "og:locale", "og:site_name", "og:url", "og:title",
        "og:description", "og:image", "og:image:type", "og:image:width",
        "og:image:height", "og:image:alt",
        "twitter:card", "twitter:title", "twitter:description", "twitter:image",
        "twitter:image:alt", "article:published_time", "article:modified_time",
        "article:section",
    }

    def keep_meta(match: re.Match[str]) -> str:
        tag = match.group(0)
        key = (attr_value(tag, "name") or attr_value(tag, "property")).lower()
        return "" if key in remove_keys else tag

    source = META_TAG_RE.sub(keep_meta, source)

    def keep_link(match: re.Match[str]) -> str:
        tag = match.group(0)
        rel = attr_value(tag, "rel").lower()
        href = attr_value(tag, "href")
        typ = attr_value(tag, "type").lower()
        if "canonical" in rel.split():
            return ""
        if href.startswith("/assets/blog-header-28wnews.css") or "blog-header-28wnews.css" in href:
            return ""
        if "alternate" in rel.split() and typ == "application/rss+xml":
            return ""
        return tag

    return LINK_TAG_RE.sub(keep_link, source)


def update_json_ld(source: str, *, page_url: str, title: str, description: str,
                   image_url: str, category_label: str, published: str,
                   modified: str) -> tuple[str, bool]:
    article_found = False

    def article_types(value: object) -> set[str]:
        if not isinstance(value, dict):
            return set()
        raw = value.get("@type")
        if isinstance(raw, list):
            return {str(item) for item in raw}
        return {str(raw)} if raw else set()

    def update_node(value: object) -> None:
        nonlocal article_found
        if isinstance(value, dict):
            types = article_types(value)
            if types & {"Article", "BlogPosting", "NewsArticle"}:
                article_found = True
                value["mainEntityOfPage"] = {"@type": "WebPage", "@id": page_url}
                value["url"] = page_url
                if "@id" in value:
                    value["@id"] = f"{page_url}#article"
                value["headline"] = title
                value["description"] = description
                current_image = value.get("image")
                if isinstance(current_image, dict):
                    current_image["@type"] = current_image.get("@type") or "ImageObject"
                    current_image["url"] = image_url
                    current_image.pop("contentUrl", None)
                elif isinstance(current_image, list):
                    value["image"] = [image_url]
                else:
                    value["image"] = image_url
                value["datePublished"] = published
                value["dateModified"] = modified
                value["articleSection"] = category_label
                value["inLanguage"] = "ko-KR"
                value.setdefault("author", {"@type": "Organization", "name": "케이브릿지 주식회사", "url": f"{SITE_URL}/"})
                value.setdefault("publisher", {"@type": "Organization", "name": "케이브릿지 주식회사", "url": f"{SITE_URL}/"})
            if "BreadcrumbList" in types:
                items = value.get("itemListElement")
                if isinstance(items, list) and items:
                    last = items[-1]
                    if isinstance(last, dict):
                        last["item"] = page_url
            for child in value.values():
                update_node(child)
        elif isinstance(value, list):
            for child in value:
                update_node(child)

    def callback(match: re.Match[str]) -> str:
        raw = match.group(2)
        try:
            data = json.loads(html_lib.unescape(raw).strip())
        except Exception:
            return match.group(0)
        update_node(data)
        encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        return f'{match.group(1)}{encoded}{match.group(3)}'

    updated = LD_JSON_RE.sub(callback, source)
    return updated, article_found


def generated_article_json(page_url: str, title: str, description: str, image_url: str,
                           category_label: str, published: str, modified: str) -> str:
    data = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "@id": f"{page_url}#article",
        "mainEntityOfPage": {"@type": "WebPage", "@id": page_url},
        "url": page_url,
        "headline": title,
        "description": description,
        "image": image_url,
        "datePublished": published,
        "dateModified": modified,
        "author": {"@type": "Organization", "name": "케이브릿지 주식회사", "url": f"{SITE_URL}/"},
        "publisher": {"@type": "Organization", "name": "케이브릿지 주식회사", "url": f"{SITE_URL}/"},
        "articleSection": category_label,
        "inLanguage": "ko-KR",
    }
    return f'<script type="application/ld+json">{json.dumps(data, ensure_ascii=False, separators=(",", ":"))}</script>'


def replace_site_header(source: str) -> str:
    body_match = re.search(r"<body\b[^>]*>", source, re.I)
    main_match = re.search(r"<main\b", source, re.I)
    if not body_match or not main_match or main_match.start() <= body_match.end():
        return source
    prefix = source[:main_match.start()]
    suffix = source[main_match.start():]
    header_re = re.compile(
        r'<header\b[^>]*class=["\'][^"\']*(?:kb-header|header)[^"\']*["\'][^>]*>[\s\S]*?</header>',
        re.I,
    )
    matches = list(header_re.finditer(prefix))
    if matches:
        match = matches[-1]
        prefix = f"{prefix[:match.start()]}{HEADER_HTML}{prefix[match.end():]}"
    else:
        prefix = f"{prefix[:body_match.end()]}\n{HEADER_HTML}\n{prefix[body_match.end():]}"
    return prefix + suffix


def normalize_file(file_path: Path) -> bool:
    relative = file_path.relative_to(ROOT).as_posix()
    parts = relative.split("/")
    if len(parts) < 4 or parts[0:2] != ["blog", "posts"]:
        return False
    category = parts[2]
    if category not in CATEGORY_LABELS:
        return False

    original = file_path.read_text(encoding="utf-8")
    source = AUTO_BLOCK_RE.sub("\n", original)
    meta = all_meta(source)
    json_values = json_candidates(source)

    page_url = f"{SITE_URL}/{relative}"
    title = tag_text(source, "h1") or tag_text(source, "title") or file_path.stem
    description = meta.get("description") or meta.get("og:description") or title
    description = strip_tags(description)
    category_label = CATEGORY_LABELS[category]

    image_raw = (
        meta.get("og:image") or meta.get("twitter:image") or
        meta.get("kbridge:thumbnail") or first_content_image(source) or
        "/assets/og/og-blog-post.png"
    )
    image_url = urljoin(page_url, image_raw)

    published_raw = (
        meta.get("article:published_time") or meta.get("kbridge:date") or
        next((find_json_value(item, "datePublished") for item in json_values if find_json_value(item, "datePublished")), "")
    )
    modified_raw = (
        meta.get("article:modified_time") or
        next((find_json_value(item, "dateModified") for item in json_values if find_json_value(item, "dateModified")), "") or
        published_raw
    )
    published_date = normalize_date(published_raw)
    modified_date = normalize_date(modified_raw, published_date)
    published_iso = published_raw if re.search(r"T\d{2}:\d{2}", published_raw or "") else iso_kst(published_date)
    modified_iso = modified_raw if re.search(r"T\d{2}:\d{2}", modified_raw or "") else iso_kst(modified_date)

    source = remove_conflicting_head_tags(source)
    source, article_found = update_json_ld(
        source,
        page_url=page_url,
        title=title,
        description=description,
        image_url=image_url,
        category_label=category_label,
        published=published_iso,
        modified=modified_iso,
    )

    auto_lines = [
        "<!-- KBRIDGE_AUTO_SEO_START -->",
        f'<link rel="canonical" href="{escape_attr(page_url)}">',
        f'<link rel="alternate" type="application/rss+xml" title="KBRIDGE 물류 블로그 RSS" href="{RSS_URL}">',
        '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">',
        '<meta name="naverbot" content="index,follow">',
        '<meta name="yeti" content="index,follow">',
        '<meta name="author" content="케이브릿지 주식회사">',
        '<meta property="og:type" content="article">',
        '<meta property="og:locale" content="ko_KR">',
        '<meta property="og:site_name" content="KBRIDGE 물류 블로그">',
        f'<meta property="og:url" content="{escape_attr(page_url)}">',
        f'<meta property="og:title" content="{escape_attr(title)}">',
        f'<meta property="og:description" content="{escape_attr(description)}">',
        f'<meta property="og:image" content="{escape_attr(image_url)}">',
        f'<meta property="og:image:alt" content="{escape_attr(title)}">',
        f'<meta property="article:published_time" content="{escape_attr(published_iso)}">',
        f'<meta property="article:modified_time" content="{escape_attr(modified_iso)}">',
        f'<meta property="article:section" content="{escape_attr(category_label)}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{escape_attr(title)}">',
        f'<meta name="twitter:description" content="{escape_attr(description)}">',
        f'<meta name="twitter:image" content="{escape_attr(image_url)}">',
    ]
    if not article_found:
        auto_lines.append(generated_article_json(
            page_url, title, description, image_url, category_label, published_iso, modified_iso
        ))
    auto_lines.append("<!-- KBRIDGE_AUTO_SEO_END -->")
    auto_block = "\n  " + "\n  ".join(auto_lines) + "\n"

    source = re.sub(r"</head>", f"{auto_block}</head>", source, count=1, flags=re.I)
    source = replace_site_header(source)

    # Clean accidental HTML tags inside the keywords content attribute without changing other metadata.
    def clean_keywords(match: re.Match[str]) -> str:
        tag = match.group(0)
        key = (attr_value(tag, "name") or attr_value(tag, "property")).lower()
        if key != "keywords":
            return tag
        content = strip_tags(attr_value(tag, "content"))
        return f'<meta name="keywords" content="{escape_attr(content)}">'

    source = META_TAG_RE.sub(clean_keywords, source)
    source = source.replace("\r\n", "\n")
    if source != original:
        file_path.write_text(source, encoding="utf-8", newline="\n")
        return True
    return False


def main() -> None:
    changed_paths: set[str] = set()
    # A second pass absorbs metadata that was relative or incomplete in the source.
    # The loop stops as soon as every file is stable, preventing future workflow churn.
    for _pass in range(3):
        pass_changes = 0
        for file_path in sorted(POSTS_ROOT.glob("*/*.html")):
            if normalize_file(file_path):
                changed_paths.add(file_path.relative_to(ROOT).as_posix())
                pass_changes += 1
        if pass_changes == 0:
            break
    changed = sorted(changed_paths)
    print(f"블로그 HTML 정규화 완료: {len(changed)}개 파일 변경")
    for path in changed:
        print(f"- {path}")


if __name__ == "__main__":
    main()
