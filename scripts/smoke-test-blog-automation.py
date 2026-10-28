#!/usr/bin/env python3
"""Regression smoke test for future KBRIDGE blog posts.

Runs the real blog pipeline inside a temporary copy of the repository, creates
new posts in every category, pushes the public post count above 100 to verify
unlimited RSS membership, and verifies idempotence. No network requests are
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
    [sys.executable, "scripts/audit-editorial-readability.py"],
    [sys.executable, "scripts/audit-url-contract.py"],
    ["node", "scripts/test-blog-filter.cjs"],
    [sys.executable, "scripts/audit-site.py"],
    [sys.executable, "scripts/audit-indexing.py"],
    [sys.executable, "scripts/audit-legacy-urls.py"],
    [sys.executable, "scripts/audit-functional-links.py"],
    ["node", "scripts/test-quote-deeplink.cjs"],
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

        # Snapshot real published article timestamps before generated fixtures.
        def modified_dates():
            found = {}
            for item in sorted((work / 'blog' / 'posts').glob('*/*.html')):
                source = BeautifulSoup(item.read_text('utf-8'), 'html.parser')
                mt = source.find('meta', attrs={'property': 'article:modified_time'})
                if mt and mt.get('content'):
                    found[item.relative_to(work).as_posix()] = str(mt['content'])
            return found
        stable_dates = modified_dates()

        # One canonical future post per category verifies every template.
        primary: list[tuple[str, str]] = []
        for category in CATEGORIES:
            slug = f"zz-smoke-{category}"
            primary.append((category, slug))
            command = [
                sys.executable, "scripts/create-blog-post.py",
                "--category", category,
                "--slug", slug,
                "--title", f"자동화 회귀검수 {category}",
                "--summary", f"{category} 신규 글의 공통 디자인과 SEO 자동 적용을 확인하는 회귀 테스트입니다.",
                "--keywords", f"KBRIDGE, {category}, 자동화검수",
                "--date", TEST_DATE,
            ]
            if category == "info":
                # Real publication path for the new topic-led editorial option.
                command.extend([
                    "--editorial-kind", "calculation",
                    "--reader-question", "계산 결과가 달라지는 변수는 무엇인가요?",
                    "--reader-answer", "측정 단위와 계산 기준을 먼저 확인합니다.",
                    "--focus-section", "how",
                ])
            run(command, work)

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
            '<p class="breadcrumb"><a href="../../index.html?category=news">물류 뉴스</a></p>'
            '<header class="article-hero"><h1>수동 업로드 검수</h1>'
            f'<p class="article-meta">작성 {TEST_DATE} · KBRIDGE 물류 뉴스</p></header>'
            '<div class="article-body"><section class="quick-summary">'
            '<p class="summary-title">핵심 요약</p><p><strong>해상운임과 관세, 선박 정보를 함께 확인하는 수동 업로드 자동화 테스트입니다.</strong></p></section>'
            '<nav class="toc"><ol><li><a href="#ocean">해상운임</a></li><li><a href="#response">실무 대응</a></li></ol></nav>'
            '<section class="section" id="ocean"><h2>1. 해상운임</h2><p><strong>해상운임 변동을 확인합니다.</strong></p><p>선박과 공급망 정보를 함께 검토합니다.</p></section>'
            '<section class="section" id="response"><h2>2. 실무 대응</h2><p><strong>관세와 스케줄을 함께 확인합니다.</strong></p><p>실제 화물 조건별 검토가 필요합니다.</p></section>'
            # An uploaded article may contain a hand-inserted v44 hub but no
            # KBRIDGE_BLOG_SYSTEM_START/END markers. This caused live run #187
            # to fail (two hubs after automatic enrichment).
            '<section class="kb-resource-hub" data-kb-auto="v44">'
            '<h2>기존 관련 물류도구</h2><a class="kb-resource-card" href="../../../safe-rate.html">안전운임 조회</a>'
            '<a class="kb-resource-card" href="../../../vehicle-spec.html">차량 제원</a></section>'
            '<section class="cta kb-blog-cta"><h2>물류 조건을 확인하세요</h2><p>케이브릿지와 실제 조건을 검토합니다.</p>'
            '<div class="action-row"><a class="btn" href="https://www.kbexpress.kr/index.html?quote=formal">정식 견적 문의</a></div></section>'
            '</div></article></main></body></html>'
        )
        raw_path.write_text(raw_html, encoding="utf-8")
        primary.append(("news", raw_slug))
        # The original hand-authored links must not disappear during repair.
        preserved_resource_title = "기존 관련 물류도구"

        for cmd in PIPELINE:
            run(cmd, work)
        for cmd in AUDITS:
            run(cmd, work)
        after_dates = modified_dates()
        backdated = [rel for rel, old_date in stable_dates.items()
                     if after_dates.get(rel, '')[:10] < old_date[:10]]
        if backdated:
            raise SystemExit('existing article modified timestamp regressed: '+', '.join(backdated[:8]))

        manifest = json.loads((work / "assets" / "blog-posts.json").read_text("utf-8"))
        sitemap_text = (work / "sitemap.xml").read_text("utf-8")
        blog_index = (work / "blog" / "index.html").read_text("utf-8")
        rss_tree = ET.parse(work / "rss.xml")
        rss_urls = [
            (node.text or "").strip()
            for node in rss_tree.findall("./channel/item/link")
            if (node.text or "").strip()
        ]
        expected_rss_urls = [str(row["url"]).strip() for row in manifest]
        if rss_urls != expected_rss_urls:
            raise SystemExit(
                f"RSS order/membership regression: manifest={len(manifest)}, "
                f"expected={len(expected_rss_urls)}, rss={len(rss_urls)}"
            )

        for category, slug in primary:
            path = work / "blog" / "posts" / category / f"{slug}.html"
            soup = BeautifulSoup(path.read_text("utf-8"), "html.parser")
            if slug == raw_slug:
                hub = soup.select_one(".kb-resource-hub[data-kb-auto='v44']")
                if not hub or preserved_resource_title not in hub.get_text(" ", strip=True):
                    raise SystemExit("custom uploaded resource hub not preserved")
                if not any("vehicle-spec.html" in a.get("href", "") for a in hub.select("a")):
                    raise SystemExit("custom uploaded resource links were lost")
            url = f"https://www.kbexpress.kr/blog/posts/{category}/{slug}.html"
            checks = {
                "site header": len(soup.select("header.header#top")) == 1,
                "mobile nav": len(soup.select("#mobileNav.mobile-nav")) == 1,
                "footer": len(soup.select("footer.kb-footer")) == 1,
                "shared css": len([x for x in soup.find_all("link", href=True) if "blog-unified.css" in x.get("href", "")]) == 1,
                "site chrome": len([x for x in soup.find_all("script", src=True) if "site-chrome.js" in x.get("src", "")]) == 1,
                "finder removed": not (work / "assets" / "css" / "quick-finder-v4.css").exists(),
                "mobile contrast": len([x for x in soup.find_all("link", href=True) if "mobile-readability-v1.css" in x.get("href", "")]) == 1,
                "body category": bool(soup.body and soup.body.get("data-kb-blog-category") == category),
                "faq": len(soup.select("#faq .faq-item, section#faq details")) >= 1,
                "tags": len(soup.select(".tags .tag")) >= 1,
                "takeaways": len(soup.select(".kb-takeaways")) == 1,
                "resource hub": len(soup.select(".kb-resource-hub")) == 1,
                "legacy category cleaned": not any('?category=' in a.get('href','') for a in soup.select('a[href]')),
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
            if category == "info":
                editorial = soup.select_one("section.kb-editorial-lead a.kb-editorial-jump")
                css = [x.get("href", "") for x in soup.find_all("link", href=True) if "blog-editorial.css" in x.get("href", "")]
                checks.update({
                    "editorial block": bool(editorial and editorial.get("href") == "#how"),
                    "editorial theme": bool(soup.body and soup.body.get("data-kb-editorial-kind") == "calculation"),
                    "editorial css": len(css) == 1 and (path.parent / css[0].split("?", 1)[0]).exists(),
                })
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

        # All-post RSS regression: add enough lightweight public fixtures to
        # exceed 100 articles, plus unpublished/noindex fixtures to exclude.
        # Real article templates and the full editorial pipeline were checked
        # for every category above; this stage stress-tests publication and
        # generator behavior without mutating the source repository.
        current_count = len(manifest)
        extra = max(1, 125 - current_count)
        fixtures = []
        for i in range(extra):
            p = work / "blog" / "posts" / "news" / f"zz-rss-unlimited-{i:03d}.html"
            p.write_text(
                '<!doctype html><html lang="ko"><head>'
                f'<title>RSS 전체 글 테스트 {i:03d} / KBRIDGE</title>'
                '<meta name="description" content="공개 글 RSS 전체 등록 검수">'
                '<meta name="robots" content="index,follow">'
                '</head><body><main><article><h1>'
                f'RSS 전체 글 {i:03d}</h1><p>RSS 항목 수 제한 제거 테스트</p>'
                '</article></main></body></html>',
                encoding="utf-8",
            )
            fixtures.append(p)
        for name, tag in (
            ("zz-rss-noindex.html", '<meta name="robots" content="noindex,nofollow">'),
            ("zz-rss-draft.html", '<meta name="blog-published" content="false">'),
        ):
            p = work / "blog" / "posts" / "news" / name
            p.write_text(
                '<!doctype html><html lang="ko"><head>' + tag +
                '</head><body><main><article><h1>미공개 테스트</h1>'
                '<p>RSS에서 제외되어야 합니다</p></article></main></body></html>',
                encoding="utf-8",
            )
        def inspect_all_rss(label: str) -> tuple[list[dict], list[str]]:
            rows = json.loads((work / "assets" / "blog-posts.json").read_text("utf-8"))
            tree = ET.parse(work / "rss.xml")
            urls = [(node.text or "").strip() for node in tree.findall("./channel/item/link")]
            expected = [str(row["url"]).strip() for row in rows]
            if urls != expected or len(urls) != len(set(urls)):
                raise SystemExit(f"{label}: RSS full membership/order mismatch: manifest={len(expected)} rss={len(urls)}")
            sitemap = (work / "sitemap.xml").read_text("utf-8")
            if any(url not in sitemap for url in expected):
                raise SystemExit(f"{label}: public RSS article missing from sitemap")
            if any(name in (work / "rss.xml").read_text("utf-8") for name in ('zz-rss-noindex', 'zz-rss-draft')):
                raise SystemExit(f"{label}: draft/noindex post leaked into RSS")
            return rows, urls

        run(["node", "scripts/build-blog-posts.mjs"], work)
        manifest2, rss_urls2 = inspect_all_rss('125-post case')
        if len(manifest2) < 125:
            raise SystemExit(f"RSS scaling regression: only {len(manifest2)} posts generated")
        oldest_url = str(manifest2[-1]["url"]).strip()
        if oldest_url not in rss_urls2:
            raise SystemExit("RSS scaling regression: oldest published post displaced")
        # Remove one published post: manifest, sitemap and feed must all drop it.
        victim = fixtures[0]
        victim_url = f"https://www.kbexpress.kr/blog/posts/news/{victim.name}"
        victim.unlink()
        run(["node", "scripts/build-blog-posts.mjs"], work)
        manifest3, rss_urls3 = inspect_all_rss('deleted-post case')
        if victim_url in rss_urls3 or any(row["url"] == victim_url for row in manifest3):
            raise SystemExit("RSS deletion regression: removed public post remains in feed")
        if victim_url in (work / "sitemap.xml").read_text("utf-8"):
            raise SystemExit("RSS deletion regression: removed public post remains in sitemap")
        # Re-running output generation must be deterministic to avoid bot loops.
        before_build = {rel: hashlib.sha256((work / rel).read_bytes()).hexdigest()
                        for rel in ('assets/blog-posts.json', 'blog/index.html', 'sitemap.xml', 'rss.xml')}
        run(["node", "scripts/build-blog-posts.mjs"], work)
        after_build = {rel: hashlib.sha256((work / rel).read_bytes()).hexdigest()
                       for rel in before_build}
        if before_build != after_build:
            raise SystemExit("RSS automation regression: repeated generation changed outputs")

        print("FUTURE BLOG AUTOMATION SMOKE PASS")
        print(f"- generated/tested categories: {len(primary)}")
        print(f"- full-pipeline posts: {len(manifest)}")
        print(f"- scale test: {len(manifest2)} public posts / {len(rss_urls2)} RSS items")
        print(f"- post deletion: {len(manifest3)} public posts / {len(rss_urls3)} RSS items")
        print("- noindex/draft excluded; sitemap coverage verified")
        print("- full pipeline and generator re-runs: idempotent")
        print("- header/footer/mobile/CSS/SEO/date/FAQ/tags/list/editorial layout: normal")


if __name__ == "__main__":
    main()
