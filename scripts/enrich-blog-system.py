#!/usr/bin/env python3
"""KBRIDGE Blog System V42: related posts + contextual logistics tools.

Adds a compact static resource hub before the authored CTA. The script is
idempotent and preserves authored HTML verbatim outside its own auto block.
"""
from __future__ import annotations

import html
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import quote

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / "blog" / "posts"
CONFIG = json.loads((ROOT / "scripts" / "blog-system-config.json").read_text("utf-8"))
CATEGORIES = set(CONFIG["categories"])
START = "<!-- KBRIDGE_BLOG_SYSTEM_START -->"
END = "<!-- KBRIDGE_BLOG_SYSTEM_END -->"
AUTO_RE = re.compile(r"\s*<!-- KBRIDGE_BLOG_SYSTEM_START -->[\s\S]*?<!-- KBRIDGE_BLOG_SYSTEM_END -->\s*", re.I)
CTA_RE = re.compile(r"<section\b[^>]*class=[\"'][^\"']*(?:\bcta\b|kb-blog-cta)[^\"']*[\"'][^>]*>", re.I)
BODY_RE = re.compile(r"<body\b(?P<attrs>[^>]*)>", re.I)
SITE = "https://www.kbexpress.kr"
STOP = {"그리고","하지만","대한","위한","에서","으로","하는","합니다","있는","있습니다","확인","실무","기준","방법","정리","관련","경우","수출입","물류","kbridge","케이브릿지","the","and","for","with","from","this","that","guide"}
TOKEN_RE = re.compile(r"[가-힣A-Za-z0-9]{2,}")


def esc(value: str) -> str:
    return html.escape(value or "", quote=True)


def text(el) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True) if el else "").strip()


def tokens(value: str) -> list[str]:
    return [t for t in TOKEN_RE.findall((value or "").lower()) if t not in STOP and not t.isdigit()]


def encoded_url(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    return f"{SITE}/{quote(rel, safe='/._-~')}"


def profile(path: Path) -> dict:
    soup = BeautifulSoup(path.read_text("utf-8"), "html.parser")
    for old_hub in soup.select(".kb-resource-hub"): old_hub.decompose()
    title = text(soup.find("h1")) or path.stem
    desc_tag = soup.find("meta", attrs={"name": "description"})
    desc = str(desc_tag.get("content", "")).strip() if desc_tag else ""
    kw_tag = soup.find("meta", attrs={"name": "keywords"})
    kws = str(kw_tag.get("content", "")).strip() if kw_tag else ""
    tags = " ".join(text(x) for x in soup.select(".tag"))
    headings = " ".join(text(x) for x in soup.find_all(["h2", "h3"]))
    all_text = f"{title} {desc} {kws} {tags} {headings}"
    weights = Counter()
    for t in tokens(title): weights[t] += 6
    for t in tokens(kws + " " + tags): weights[t] += 5
    for t in tokens(headings): weights[t] += 2
    for t in tokens(desc): weights[t] += 2
    return {"path": path, "category": path.parent.name, "title": title, "desc": desc, "weights": weights, "text": all_text.lower(), "url": encoded_url(path)}


def related(current: dict, posts: list[dict], limit: int = 3) -> list[dict]:
    same, cross = [], []
    for other in posts:
        if other["path"] == current["path"]: continue
        common = set(current["weights"]) & set(other["weights"])
        score = sum(min(current["weights"][k], other["weights"][k]) for k in common)
        if score <= 0: continue
        bucket = same if other["category"] == current["category"] else cross
        bucket.append((score, other["title"], other))
    same.sort(key=lambda x: (-x[0], x[1]))
    cross.sort(key=lambda x: (-x[0], x[1]))
    # Editorial relevance first: keep readers inside the current topic cluster.
    selected = [x[2] for x in same[:limit]]
    if len(selected) < limit:
        selected.extend(x[2] for x in cross[: limit-len(selected)])
    return selected


def tools_for(current: dict, limit: int = 2) -> list[dict]:
    hay = current["text"]
    scored = []
    for tool in CONFIG["tools"]:
        score = 0
        for kw in tool["keywords"]:
            q = kw.lower()
            if q in hay: score += 4 if " " in q else 2
            for tk in tokens(q): score += min(current["weights"].get(tk, 0), 5)
        if score: scored.append((score, tool["title"], tool))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [x[2] for x in scored[:limit]]


def block_html(current: dict, rels: list[dict], tools: list[dict]) -> str:
    chunks = [START, '<section class="kb-resource-hub" data-kb-auto="v44" aria-label="관련 자료와 물류도구">', '<p class="kb-resource-eyebrow">NEXT STEP</p>', '<h2>이 글과 함께 보면 좋은 자료</h2>', f'<p class="kb-resource-lead">{esc(CONFIG["categories"][current["category"]]["ctaLabel"])}</p>']
    if tools:
        chunks += ['<div class="kb-resource-tools"><h3>관련 물류도구</h3><div class="kb-resource-grid kb-resource-grid--tools">']
        for tool in tools:
            chunks.append(f'<a class="kb-resource-card kb-resource-card--tool" href="{esc(tool["url"])}"><span class="kb-resource-type">TOOL</span><strong>{esc(tool["title"])}</strong><span class="kb-resource-desc">{esc(tool["description"])}</span><span class="kb-resource-go">바로 사용하기 →</span></a>')
        chunks += ['</div></div>']
    if rels:
        chunks += ['<div class="kb-resource-related"><h3>함께 읽기</h3><div class="kb-resource-grid kb-resource-grid--posts">']
        for item in rels:
            label = CONFIG["categories"][item["category"]]["label"]
            desc = f'<span class="kb-resource-desc">{esc(item["desc"])}</span>' if item["desc"] else ''
            chunks.append(f'<a class="kb-resource-card kb-resource-card--post" href="{esc(item["url"])}"><span class="kb-resource-type">{esc(label)}</span><strong>{esc(item["title"])}</strong>{desc}<span class="kb-resource-go">글 보기 →</span></a>')
        chunks += ['</div></div>']
    chunks += ['</section>', END]
    return "\n".join(chunks) + "\n"


def add_category_attr(source: str, category: str) -> str:
    def repl(m: re.Match[str]) -> str:
        attrs = m.group("attrs")
        if re.search(r"\bdata-kb-blog-category\s*=", attrs, re.I):
            attrs = re.sub(r"\bdata-kb-blog-category\s*=\s*([\"']).*?\1", f'data-kb-blog-category="{category}"', attrs, flags=re.I)
        else:
            attrs = attrs.rstrip() + f' data-kb-blog-category="{category}"'
        return f"<body{attrs}>"
    return BODY_RE.sub(repl, source, count=1)


def main() -> None:
    paths = [p for p in sorted(POSTS.glob("*/*.html")) if p.parent.name in CATEGORIES]
    profiles = [profile(p) for p in paths]
    changed = []
    for current in profiles:
        path = current["path"]
        original = path.read_text("utf-8")
        source = AUTO_RE.sub("\n", original)
        source = add_category_attr(source, current["category"])
        cta = CTA_RE.search(source)
        if not cta:
            continue
        block = block_html(current, related(current, profiles), tools_for(current))
        source = source[:cta.start()] + block + source[cta.start():]
        source = source.replace("\r\n", "\n")
        if source != original:
            path.write_text(source, "utf-8", newline="\n")
            changed.append(path.relative_to(ROOT).as_posix())
    print(f"KBRIDGE Blog System V42 적용 완료: {len(changed)}개 파일 변경")
    for p in changed: print(f"- {p}")

if __name__ == "__main__": main()
