#!/usr/bin/env python3
"""Regression smoke test for future KBRIDGE blog posts.

Runs the real blog pipeline inside a temporary copy of the repository, creates
new posts in every category, pushes total post count beyond 50 to exercise the
RSS cap, and verifies the final files are idempotent. No network requests are
made and the working repository is never modified.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ["info", "service", "news", "insight", "glossary"]
TEST_DATE = "2099-12-31"
RSS_LIMIT = 50

PIPELINE = [
    [sys.executable, "scripts/enforce-blog-shell.py"],
    [sys.executable, "scripts/normalize-blog-posts.py"],
    [sys.executable, "scripts/enforce-blog-shell.py"],
    [sys.executable, "scripts/enhance-blog-content.py"],
    [sys.executable, "scripts/normalize-blog-tables.py"],
    [sys.executable, "scripts/enrich-blog-system.py"],
    [sys.executable, "scripts/optimize-blog-performance.py"],
    ["node", "scripts/build-blog-posts.mjs"],
]
AUDITS = [
    [sys.executable, "scripts/audit-blog-system.py"],
    [sys.executable, "scripts/audit-design-v47.py"],
    [sys.executable, "scripts/audit-site.py"],
    [sys.executable, "scripts/audit-indexing.py"],
    [sys.executable, "scripts/audit-legacy-urls.py"],
]


def run(cmd: list[str], cwd: Path) -> None:
    result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if result.returncode:
        print(result.stdout)
        print(result.stderr, file=sys.stderr)
        raise SystemExit(f"smoke command failed: {' '.join(cmd)}")


def digest_tree(root: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file() or "__pycache__" in path.parts:
            continue
        rel = path.relative_to(root).as_posix()
        result[rel] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def meta(soup: BeautifulSoup, name: str | None = None, prop: str | None = None) -> str:
    node = soup.find("meta", attrs={"name" if name else "property": name or prop})
    return str(node.get("content", "")).strip() if node else ""


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="kbridge-blog-smoke-") as tmp:
        work = Path(tmp) / "repo"
        shutil.copytree(
            ROOT,
            work,
            ignore=shutil.ignore_patterns(".git", "__pycache__", "*.pyc"),
        )

        # One canonical future post per category verifies every template.
        primary: list[tuple[str, str]] = []
        for category in CATEGORIES:
            slug = f"zz-smoke-{category}"
            primary.append((category, slug))
            run([
                sys.executable, "scripts/create-blog-post.py",
                "--category", category,
                "--slug", slug,
                "--title", f"자동화 회귀검수 {category}",
                "--summary", f"{category} 신규 글의 공통 디자인과 SEO 자동 적용을 확인하는 회귀 테스트입니다.",
                "--keywords", f"KBRIDGE, {category}, 자동화검수",
                "--date", TEST_DATE,
            ], work)

        # Also simulate a custom HTML upload that did not use the creator.
        # The pipeline must repair | -> /, infer the visible date, and add the
        # shared shell, FAQ and tags automatically.
        raw_slug = "zz-smoke-raw-upload"
        raw_path = work / "blog" / "posts" / "news" / f"{raw_slug}.html"
        raw_html = (
            '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>수동 업로드 검수 | KBRIDGE</title>'
            '<meta name="description" content="수동 업로드 신규 글 자동 보정 검수">'
            '<meta name="keywords" content="해상운임, 관세, 선박, KBRIDGE"></head><body>'
            '<main class="page-wrap"><article class="article-shell">'
            '<header class="article-hero"><h1>수동 업로드 검수</h1>'
            f'<p class="article-meta">작성 {TEST_DATE} · KBRIDGE 물류 뉴스</p></header>'
            '<div class="article-body"><section class="quick-summary">'
            '<p class="summary-title">핵심 요약</p><p><strong>해상운임과 관세, 선박 정보를 함께 확인하는 수동 업로드 자동화 테스트입니다.</strong></p></section>'
            '<nav class="toc"><ol><li><a href="#ocean">해상운임</a></li><li><a href="#response">실무 대응</a></li></ol></nav>'
            '<section class="section" id="ocean"><h2>1. 해상운임</h2><p><strong>해상운임 변동을 확인합니다.</strong></p><p>선박과 공급망 정보를 함께 검토합니다.</p></section>'
            '<section class="section" id="response"><h2>2. 실무 대응</h2><p><strong>관세와 스케줄을 함께 확인합니다.</strong></p><p>실제 화물 조건별 검토가 필요합니다.</p></section>'
            '<section class="cta kb-blog-cta"><h2>물류 조건을 확인하세요</h2><p>케이브릿지와 실제 조건을 검토합니다.</p>'
            '<div class="action-row"><a class="btn" href="https://www.kbexpress.kr/index.html?quote=formal">정식 견적 문의</a></div></section>'
            '</div></article></main></body></html>'
        )
        raw_path.write_text(raw_html, encoding="utf-8")
        primary.append(("news", raw_slug))

        for cmd in PIPELINE:
            run(cmd, work)
        for cmd in AUDITS:
            run(cmd, work)

        manifest = json.loads((work / "assets" / "blog-posts.json").read_text("utf-8"))
        sitemap_text = (work / "sitemap.xml").read_text("utf-8")
        blog_index = (work / "blog" / "index.html").read_text("utf-8")
        rss_tree = ET.parse(work / "rss.xml")
        rss_urls = [
            (node.text or "").strip()
            for node in rss_tree.findall("./channel/item/link")
            if (node.text or "").strip()
        ]
        if len(rss_urls) != min(len(manifest), RSS_LIMIT):
            raise SystemExit(f"RSS item count regression: manifest={len(manifest)}, rss={len(rss_urls)}")

        for category, slug in primary:
            path = work / "blog" / "posts" / category / f"{slug}.html"
            soup = BeautifulSoup(path.read_text("utf-8"), "html.parser")
            url = f"https://www.kbexpress.kr/blog/posts/{category}/{slug}.html"
            checks = {
                "site header": len(soup.select("header.header#top")) == 1,
                "mobile nav": len(soup.select("#mobileNav.mobile-nav")) == 1,
                "footer": len(soup.select("footer.kb-footer")) == 1,
                "shared css": len([x for x in soup.find_all("link", href=True) if "blog-unified.css" in x.get("href", "")]) == 1,
                "site chrome": len([x for x in soup.find_all("script", src=True) if "site-chrome.js" in x.get("src", "")]) == 1,
                "body category": bool(soup.body and soup.body.get("data-kb-blog-category") == category),
                "faq": len(soup.select("#faq .faq-item, section#faq details")) >= 1,
                "tags": len(soup.select(".tags .tag")) >= 1,
                "takeaways": len(soup.select(".kb-takeaways")) == 1,
                "resource hub": len(soup.select(".kb-resource-hub")) == 1,
                "cta": len(soup.select(".kb-blog-cta, section.cta")) == 1,
                "canonical": bool(soup.find("link", rel="canonical") and soup.find("link", rel="canonical").get("href") == url),
                "robots": "index" in meta(soup, name="robots").lower(),
                "naverbot": meta(soup, name="naverbot").lower() == "index,follow",
                "yeti": meta(soup, name="yeti").lower() == "index,follow",
                "published date": meta(soup, prop="article:published_time").startswith(TEST_DATE),
                "title slash": bool(soup.title and " / KBRIDGE" in soup.title.get_text(" ", strip=True)),
                "manifest": any(row.get("url") == url for row in manifest),
                "blog index": url in blog_index,
                "sitemap": url in sitemap_text,
            }
            failed = [name for name, ok in checks.items() if not ok]
            if failed:
                raise SystemExit(f"future post contract failed for {category}: {', '.join(failed)}")

        # A complete second run must not change the final output. This catches
        # scripts that fight each other and create endless bot commits.
        before = digest_tree(work)
        for cmd in PIPELINE:
            run(cmd, work)
        after = digest_tree(work)
        changed = sorted(key for key in set(before) | set(after) if before.get(key) != after.get(key))
        if changed:
            raise SystemExit("pipeline is not idempotent after second run: " + ", ".join(changed[:20]))

        # Lightweight 51st-post boundary check. Extra fixtures only need enough
        # metadata for build-blog-posts.mjs because the full structural pipeline
        # was already exercised above in every category.
        current_count = len(manifest)  # noindex/legacy compatibility files are intentionally excluded
        extra = max(0, 51 - current_count)
        for i in range(extra):
            p = work / "blog" / "posts" / "news" / f"zz-rss-boundary-{i:02d}.html"
            p.write_text(
                '<!doctype html><html lang="ko"><head>'
                f'<title>RSS 경계 {i:02d} / KBRIDGE</title>'
                '<meta name="description" content="RSS 50건 경계 테스트">'
                '<meta name="robots" content="index,follow">'
                '</head><body><main><article><h1>'
                f'RSS 경계 {i:02d}</h1><p>RSS 50건 경계 테스트</p></article></main></body></html>',
                encoding="utf-8",
            )
        run(["node", "scripts/build-blog-posts.mjs"], work)
        manifest2 = json.loads((work / "assets" / "blog-posts.json").read_text("utf-8"))
        rss_tree2 = ET.parse(work / "rss.xml")
        rss_urls2 = [(node.text or "").strip() for node in rss_tree2.findall("./channel/item/link") if (node.text or "").strip()]
        if len(manifest2) <= RSS_LIMIT or len(rss_urls2) != RSS_LIMIT:
            raise SystemExit(f"RSS 51st-post boundary regression: manifest={len(manifest2)}, rss={len(rss_urls2)}")

        print("FUTURE BLOG AUTOMATION SMOKE PASS")
        print(f"- generated/tested categories: {len(primary)}")
        print(f"- full-pipeline posts: {len(manifest)}")
        print(f"- RSS boundary posts: {len(manifest2)} / RSS items: {len(rss_urls2)}")
        print("- header/footer/mobile/CSS/SEO/date/FAQ/tags/sitemap/RSS/list: normal")
        print("- second full pipeline run: idempotent")


if __name__ == "__main__":
    main()
