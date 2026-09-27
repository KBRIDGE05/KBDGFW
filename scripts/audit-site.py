#!/usr/bin/env python3
"""Fail-fast QA for KBRIDGE static site and blog SEO output."""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://www.kbexpress.kr"
POSTS = ROOT / "blog" / "posts"
CATEGORIES = {"info", "service", "news", "insight", "glossary"}

errors: list[str] = []
warnings: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)


def meta(soup: BeautifulSoup, *, name: str | None = None, prop: str | None = None) -> str:
    attrs = {"name": name} if name else {"property": prop}
    tag = soup.find("meta", attrs=attrs)
    return str(tag.get("content", "")).strip() if tag else ""


def encoded_page_url(page: Path) -> str:
    rel = page.relative_to(ROOT).as_posix()
    return f"{SITE}/{quote(rel, safe='/._-~')}"


def audit_posts() -> int:
    sitemap = (ROOT / "sitemap.xml").read_text("utf-8")
    rss = (ROOT / "rss.xml").read_text("utf-8")
    manifest = (ROOT / "assets" / "blog-posts.json").read_text("utf-8")
    blog_index = (ROOT / "blog" / "index.html").read_text("utf-8")
    count = 0

    for page in sorted(POSTS.glob("*/*.html")):
        if page.parent.name not in CATEGORIES:
            continue
        count += 1
        rel = page.relative_to(ROOT).as_posix()
        url = encoded_page_url(page)
        soup = BeautifulSoup(page.read_text("utf-8", errors="ignore"), "html.parser")
        h1 = soup.find_all("h1")
        canonical = soup.find("link", rel=lambda value: value and "canonical" in value)
        canonical_url = str(canonical.get("href", "")).strip() if canonical else ""

        if len(h1) != 1:
            fail(f"{rel}: h1 개수 {len(h1)}")
        if canonical_url != url:
            fail(f"{rel}: canonical 불일치 ({canonical_url!r} != {url!r})")
        if " " in canonical_url:
            fail(f"{rel}: canonical URL에 공백 포함")
        if not meta(soup, name="description"):
            fail(f"{rel}: description 없음")
        for key in ("robots", "naverbot", "yeti"):
            value = meta(soup, name=key).lower()
            if "index" not in value or "follow" not in value:
                fail(f"{rel}: {key}=index,follow 누락")
        for key in ("og:title", "og:description", "og:image", "og:url"):
            if not meta(soup, prop=key):
                fail(f"{rel}: {key} 없음")
        if meta(soup, prop="og:url") != url:
            fail(f"{rel}: og:url 불일치")
        if meta(soup, name="twitter:card") != "summary_large_image":
            fail(f"{rel}: twitter card 누락")

        article_json = False
        for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                data = json.loads(tag.get_text())
            except Exception:
                continue
            stack = data.get("@graph", []) if isinstance(data, dict) and "@graph" in data else [data]
            for item in stack:
                if not isinstance(item, dict):
                    continue
                types = item.get("@type", [])
                if not isinstance(types, list):
                    types = [types]
                if {"BlogPosting", "Article", "NewsArticle"} & set(types):
                    required = ("headline", "description", "image", "datePublished", "dateModified", "author", "publisher", "mainEntityOfPage")
                    if all(item.get(k) for k in required):
                        article_json = True
        if not article_json:
            fail(f"{rel}: 유효한 Article JSON-LD 없음")

        for label, text in (("sitemap", sitemap), ("rss", rss), ("manifest", manifest), ("blog index", blog_index)):
            if url not in text:
                fail(f"{rel}: {label} 누락")

        # Blog article images should not compete with the text-first LCP.
        for img in soup.find_all("img"):
            if img.get("src") and img.get("loading") != "lazy":
                fail(f"{rel}: article image lazy 누락 ({img.get('src')})")
            if img.get("src") and img.get("decoding") != "async":
                fail(f"{rel}: article image async decoding 누락 ({img.get('src')})")

    return count


def audit_local_refs() -> tuple[int, int]:
    refs = 0
    pages = 0
    for page in sorted(ROOT.rglob("*.html")):
        if ".git" in page.parts:
            continue
        pages += 1
        soup = BeautifulSoup(page.read_text("utf-8", errors="ignore"), "html.parser")
        for tag, attr in (("img", "src"), ("script", "src"), ("link", "href"), ("a", "href"), ("source", "src"), ("video", "poster")):
            for el in soup.find_all(tag):
                raw = el.get(attr)
                if not raw or raw.startswith(("#", "mailto:", "tel:", "javascript:", "data:", "http://", "https://", "//")):
                    continue
                path = unquote(urlsplit(raw).path)
                if not path:
                    continue
                candidate = (ROOT / path.lstrip("/")) if path.startswith("/") else (page.parent / path)
                try:
                    candidate = candidate.resolve()
                    candidate.relative_to(ROOT.resolve())
                except Exception:
                    continue
                refs += 1
                if candidate.is_dir():
                    candidate = candidate / "index.html"
                if not candidate.exists():
                    fail(f"{page.relative_to(ROOT)}: 로컬 경로 누락 {raw}")
    return pages, refs


def main() -> None:
    post_count = audit_posts()
    page_count, ref_count = audit_local_refs()
    if errors:
        print(f"QA FAIL: {len(errors)}개 오류")
        for item in errors:
            print(f"- {item}")
        raise SystemExit(1)
    print("QA PASS")
    print(f"- HTML 페이지: {page_count}개")
    print(f"- 블로그 포스팅 SEO: {post_count}개")
    print(f"- 로컬 리소스 참조 검사: {ref_count}개")
    print("- canonical/robots/Naver/OG/Twitter/Article JSON-LD/sitemap/RSS/manifest: 정상")
    print("- 블로그 이미지 lazy + async decoding: 정상")


if __name__ == "__main__":
    main()
