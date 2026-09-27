#!/usr/bin/env python3
"""Static QA for K-BRIDGE V47 editorial design hooks.

Checks durable markup/CSS invariants that must survive the blog automation
pipeline. Browser-computed style checks are performed separately during the
release QA because GitHub Actions does not install Chromium for this job.
"""
from __future__ import annotations

from pathlib import Path
from bs4 import BeautifulSoup
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
POSTS = sorted((ROOT / "blog" / "posts").rglob("*.html"))
CSS = ROOT / "assets" / "css" / "pages" / "blog-unified.css"
VERSION = "20260927-blog-design-v47"

errors: list[str] = []
stats = {"posts": 0, "tables": 0, "sources": 0, "resources": 0, "ctas": 0, "visuals": 0}

css = CSS.read_text(encoding="utf-8")
for marker in ["V47 — K-BRIDGE Editorial System", "/* END V47 */", "V47 CTA final contrast lock", "END V47 FINAL CASCADE LOCK"]:
    if marker not in css:
        errors.append(f"CSS marker missing: {marker}")

# Critical final rules must exist; these are intentionally literal guards.
for token in [
    ".kb-table-shell",
    ".kb-source-block",
    ".kb-resource-hub",
    "-webkit-text-fill-color:#edf4ff!important",
    "-webkit-text-fill-color:#0f2744!important",
]:
    if token not in css:
        errors.append(f"critical V47 CSS token missing: {token}")

for path in POSTS:
    stats["posts"] += 1
    text = path.read_text(encoding="utf-8")
    rel = path.relative_to(ROOT).as_posix()
    soup = BeautifulSoup(text, "html.parser")

    links = [x.get("href", "") for x in soup.find_all("link", href=True) if "blog-unified.css" in x.get("href", "")]
    if len(links) != 1 or VERSION not in links[0]:
        errors.append(f"{rel}: expected one V47 blog stylesheet link, got {links}")

    hubs = soup.select(".kb-resource-hub")
    ctas = soup.select(".kb-blog-cta, section.cta")
    stats["resources"] += len(hubs)
    stats["ctas"] += len(ctas)
    stats["visuals"] += len(soup.select("figure.kb-figure--graphic"))
    if len(hubs) != 1:
        errors.append(f"{rel}: resource hub count={len(hubs)}")
    if len(ctas) != 1:
        errors.append(f"{rel}: CTA count={len(ctas)}")
    if soup.select_one(".kb-resource-lead"):
        errors.append(f"{rel}: obsolete resource lead box remains")

    for ref in soup.select("aside.refs, div.refs, section.refs"):
        stats["sources"] += 1
        if "kb-source-block" not in ref.get("class", []):
            errors.append(f"{rel}: source block missing kb-source-block")

    for table in soup.select("table.kb-content-table"):
        stats["tables"] += 1
        cols = table.get("data-kb-cols", "")
        shell = table.find_parent(class_="kb-table-shell")
        if not shell:
            errors.append(f"{rel}: table missing kb-table-shell wrapper")
            continue
        if cols and f"kb-cols-{cols}" not in shell.get("class", []):
            errors.append(f"{rel}: table cols={cols} but wrapper classes={shell.get('class', [])}")

# Aggregate totals are intentionally not hard-coded. New posts/tables/visuals are
# expected to increase these counts. Structural invariants are validated per post
# above, which keeps QA strict without making every legitimate new article fail.
if stats["resources"] != stats["posts"]:
    errors.append(f"resource hub total must match posts: {stats['resources']} != {stats['posts']}")
if stats["ctas"] != stats["posts"]:
    errors.append(f"CTA total must match posts: {stats['ctas']} != {stats['posts']}")

if errors:
    print("V47 DESIGN QA FAIL")
    for e in errors:
        print(f"- {e}")
    sys.exit(1)

print("V47 DESIGN QA PASS")
print(f"- posts: {stats['posts']}")
print(f"- tables: {stats['tables']} (standard shells + column classes)")
print(f"- source blocks: {stats['sources']}")
print(f"- resource hubs / CTA: {stats['resources']} / {stats['ctas']}")
print(f"- VISUAL GUIDE: {stats['visuals']}")
print(f"- stylesheet cache key: {VERSION}")
