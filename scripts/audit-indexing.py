from __future__ import annotations

from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote
import re
import sys
import xml.etree.ElementTree as ET

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://www.kbexpress.kr"
SITEMAP = ROOT / "sitemap.xml"
RSS = ROOT / "rss.xml"
ROBOTS = ROOT / "robots.txt"
KEY = "736f09a19bf4a21e9a05a8bfe60a60c4"
KEY_FILE = ROOT / f"{KEY}.txt"
WORKFLOW = ROOT / ".github" / "workflows" / "update-blog-posts.yml"
TEMPLATES = ROOT / "scripts" / "blog-templates"

errors: list[str] = []
warnings: list[str] = []


def err(message: str) -> None:
    errors.append(message)


def warn(message: str) -> None:
    warnings.append(message)


def soup_for(path: Path) -> BeautifulSoup:
    return BeautifulSoup(path.read_text(encoding="utf-8", errors="strict"), "html.parser")


def meta(soup: BeautifulSoup, name: str | None = None, prop: str | None = None) -> str:
    if name:
        node = soup.find("meta", attrs={"name": re.compile(rf"^{re.escape(name)}$", re.I)})
    else:
        node = soup.find("meta", attrs={"property": re.compile(rf"^{re.escape(prop or '')}$", re.I)})
    return (node.get("content") or "").strip() if node else ""


html_files = sorted(ROOT.rglob("*.html"))
indexable: dict[Path, str] = {}
canonical_to_file: dict[str, Path] = {}

for path in html_files:
    soup = soup_for(path)
    robots_values = " ".join(
        meta(soup, name=n) for n in ("robots", "naverbot", "yeti")
    ).lower()
    is_noindex = "noindex" in robots_values
    canonical_tag = soup.find("link", rel=lambda value: value and "canonical" in value)
    canonical = (canonical_tag.get("href") or "").strip() if canonical_tag else ""

    if is_noindex:
        continue
    if not canonical:
        err(f"canonical 누락: {path.relative_to(ROOT)}")
        continue
    if not canonical.startswith(f"{SITE}/") and canonical != f"{SITE}/":
        err(f"대표 도메인(www) 불일치: {path.relative_to(ROOT)} -> {canonical}")
    if canonical in canonical_to_file:
        err(
            "canonical 중복: "
            f"{path.relative_to(ROOT)} / {canonical_to_file[canonical].relative_to(ROOT)} -> {canonical}"
        )
    canonical_to_file[canonical] = path
    indexable[path] = canonical

    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    if not title:
        err(f"title 누락: {path.relative_to(ROOT)}")
    if "|" in title:
        err(f"SEO title에 금지 구분자 | 남음: {path.relative_to(ROOT)} -> {title}")
    is_blog_post = len(path.parts) >= 3 and path.parent.parent.name == "posts" and path.parent.parent.parent.name == "blog"
    if is_blog_post and not re.search(r"\s/\s(?:KBRIDGE|케이브릿지)(?:\s|$)", title, re.I):
        err(f"블로그 SEO title 브랜드 구분자가 / 형식이 아님: {path.relative_to(ROOT)} -> {title}")
    if len(title) > 40:
        warn(f"title 40자 초과: {path.relative_to(ROOT)} ({len(title)}자)")

    desc = meta(soup, name="description")
    if not desc:
        err(f"description 누락: {path.relative_to(ROOT)}")
    elif len(desc) > 80:
        warn(f"description 80자 초과: {path.relative_to(ROOT)} ({len(desc)}자)")

    for label, value in (("og:title", meta(soup, prop="og:title")), ("twitter:title", meta(soup, name="twitter:title"))):
        if value and "|" in value:
            err(f"{label}에 금지 구분자 | 남음: {path.relative_to(ROOT)} -> {value}")

# Future templates must keep the same title separator policy.
for template in sorted(TEMPLATES.glob("*.tmpl")):
    text = template.read_text(encoding="utf-8")
    if "{{TITLE}} | KBRIDGE" in text:
        err(f"신규 글 템플릿에 | 구분자 남음: {template.relative_to(ROOT)}")
    if "{{TITLE}} / KBRIDGE" not in text:
        err(f"신규 글 템플릿의 / KBRIDGE 제목 규칙 누락: {template.relative_to(ROOT)}")
    if 'name="kbridge:date" content="{{DATE}}"' not in text:
        err(f"신규 글 템플릿 날짜 메타 누락: {template.relative_to(ROOT)}")
    if '{{TAGS_HTML}}' not in text or 'class="tags"' not in text:
        err(f"신규 글 템플릿 태그 구조 누락: {template.relative_to(ROOT)}")
    if 'id="faq"' not in text or 'faq-item' not in text:
        err(f"신규 글 템플릿 FAQ 구조 누락: {template.relative_to(ROOT)}")

# Sitemap must exactly represent every indexable canonical URL.
if not SITEMAP.exists():
    err("sitemap.xml 누락")
    sitemap_urls: list[str] = []
else:
    try:
        tree = ET.parse(SITEMAP)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        sitemap_urls = [
            (node.text or "").strip()
            for node in tree.findall("sm:url/sm:loc", ns)
            if (node.text or "").strip()
        ]
    except Exception as exc:
        err(f"sitemap.xml 파싱 실패: {exc}")
        sitemap_urls = []

if len(sitemap_urls) != len(set(sitemap_urls)):
    err("sitemap.xml 중복 URL 존재")
for url in sitemap_urls:
    if not url.startswith(f"{SITE}/") and url != f"{SITE}/":
        err(f"sitemap www 대표도메인 불일치: {url}")

expected_urls = set(indexable.values())
actual_urls = set(sitemap_urls)
for url in sorted(expected_urls - actual_urls):
    err(f"sitemap 누락: {url}")
for url in sorted(actual_urls - expected_urls):
    err(f"sitemap 불필요/비색인 URL: {url}")

# RSS is intentionally a recent-content feed capped at 50 items.
# The sitemap carries the complete indexable URL set.
manifest = ROOT / "assets" / "blog-posts.json"
manifest_rows: list[dict] = []
manifest_urls: set[str] = set()
if manifest.exists():
    import json

    try:
        manifest_rows = [row for row in json.loads(manifest.read_text(encoding="utf-8")) if row.get("published", True) and row.get("url")]
        manifest_urls = {str(row.get("url", "")).strip() for row in manifest_rows}
    except Exception as exc:
        err(f"blog-posts.json 파싱 실패: {exc}")
else:
    err("assets/blog-posts.json 누락")

rss_order: list[str] = []
rss_urls: set[str] = set()
if RSS.exists():
    try:
        rss_tree = ET.parse(RSS)
        rss_order = [
            (node.text or "").strip()
            for node in rss_tree.findall("./channel/item/link")
            if (node.text or "").strip()
        ]
        rss_urls = set(rss_order)
    except Exception as exc:
        err(f"rss.xml 파싱 실패: {exc}")
else:
    err("rss.xml 누락")

RSS_LIMIT = 50
expected_rss = [str(row.get("url", "")).strip() for row in manifest_rows[:RSS_LIMIT]]
if len(rss_order) > RSS_LIMIT:
    err(f"RSS 항목이 {RSS_LIMIT}개를 초과함: {len(rss_order)}")
for url in expected_rss:
    if url not in rss_urls:
        err(f"RSS 최신 {RSS_LIMIT}건 URL 누락: {url}")
if rss_order and expected_rss and rss_order != expected_rss:
    err("RSS 항목 순서가 blog-posts.json 최신순과 일치하지 않음")

# Internal-link orphan check for indexable pages.
path_to_file: dict[str, Path] = {}
for file, canonical in indexable.items():
    parsed = urlparse(canonical)
    path_to_file[parsed.path] = file
    if parsed.path.endswith("/index.html"):
        path_to_file[parsed.path[: -len("index.html")]] = file

incoming = {file: 0 for file in indexable}
for source in html_files:
    soup = soup_for(source)
    base = indexable.get(source)
    if not base:
        rel = source.relative_to(ROOT).as_posix()
        base = f"{SITE}/{rel}"
    for anchor in soup.find_all("a", href=True):
        href = (anchor.get("href") or "").strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = urljoin(base, href)
        parsed = urlparse(absolute)
        if parsed.netloc and parsed.netloc not in {"www.kbexpress.kr", "kbexpress.kr"}:
            continue
        target = path_to_file.get(unquote(parsed.path)) or path_to_file.get(parsed.path)
        if target in incoming and target != source:
            incoming[target] += 1

for file, count in incoming.items():
    if indexable[file] == f"{SITE}/":
        continue
    if count == 0:
        err(f"내부링크 고립 URL: {file.relative_to(ROOT)} -> {indexable[file]}")

# robots and IndexNow key checks.
if not ROBOTS.exists():
    err("robots.txt 누락")
else:
    robots_text = ROBOTS.read_text(encoding="utf-8", errors="ignore").lower()
    if "user-agent: yeti" not in robots_text:
        warn("robots.txt에 Yeti 전용 규칙이 없음 (전체 Allow 규칙이 있으면 수집은 가능)")
    if "disallow: /blog" in robots_text or "disallow: /blog/" in robots_text:
        err("robots.txt가 /blog를 차단함")

if not KEY_FILE.exists() or KEY_FILE.read_text(encoding="utf-8").strip() != KEY:
    err("IndexNow key 파일 누락 또는 내용 불일치")

# Workflow reliability checks: deploy verification before IndexNow, all-site mode, strict failure.
if not WORKFLOW.exists():
    err("블로그 SEO workflow 누락")
else:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    required = {
        "deploy marker 작성": "deploy-version.txt",
        "실제 배포 확인": "Verify GitHub Pages deployment",
        "전체 sitemap IndexNow": "--notify-sitemap",
        "색인 QA": "python scripts/audit-indexing.py",
    }
    for label, needle in required.items():
        if needle not in workflow:
            err(f"workflow {label} 누락")
    if "sleep 75" in workflow:
        err("workflow에 고정 75초 대기가 남아 있음")

build_script = (ROOT / "scripts" / "build-blog-posts.mjs").read_text(encoding="utf-8")
if "throw new Error('IndexNow 전송 실패" not in build_script:
    err("IndexNow 3회 실패가 오류 종료로 처리되지 않음")
if "--notify-sitemap" not in build_script:
    err("사이트맵 전체 URL IndexNow 수동 모드 누락")

# Critical recent post must remain fully registered.
recent = f"{SITE}/blog/posts/news/39news.html"
if recent not in actual_urls:
    err("39주차 sitemap 누락")
if recent not in manifest_urls:
    err("39주차 blog-posts.json 누락")
if recent not in rss_urls:
    err("39주차 RSS 누락")

print("INDEXING QA " + ("PASS" if not errors else "FAIL"))
print(f"- HTML: {len(html_files)} / indexable: {len(indexable)} / sitemap: {len(actual_urls)}")
print(f"- blog manifest: {len(manifest_urls)} / RSS: {len(rss_urls)}")
print(f"- orphan pages: {sum(1 for f,c in incoming.items() if indexable[f] != f'{SITE}/' and c == 0)}")
print(f"- title/description length warnings: {len(warnings)}")
if warnings:
    for item in warnings[:12]:
        print(f"  WARN: {item}")
    if len(warnings) > 12:
        print(f"  WARN: ... {len(warnings) - 12} more")
if errors:
    for item in errors:
        print(f"  ERROR: {item}")
    sys.exit(1)
