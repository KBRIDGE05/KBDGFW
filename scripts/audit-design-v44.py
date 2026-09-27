#!/usr/bin/env python3
"""Structural QA for the KBRIDGE V44 full editorial blog design."""
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
POSTS = sorted((ROOT / "blog" / "posts").glob("*/*.html"))
VERSION = "20260927-blog-design-v44"
errors=[]
counts={"visual":0,"photo":0,"tables":0,"takeaways":0,"resource":0,"cta":0}

def fail(msg): errors.append(msg)

for p in POSTS:
    rel=p.relative_to(ROOT).as_posix()
    src=p.read_text(encoding="utf-8")
    soup=BeautifulSoup(src,"html.parser")
    if VERSION not in src: fail(f"{rel}: V44 stylesheet version missing")
    if not soup.body or "kb-blog-post" not in (soup.body.get("class") or []): fail(f"{rel}: kb-blog-post body class missing")
    if len(soup.select("h1")) != 1: fail(f"{rel}: h1 count {len(soup.select('h1'))}")
    if len(soup.select(".toc,.pipe-toc")) != 1: fail(f"{rel}: toc count {len(soup.select('.toc,.pipe-toc'))}")
    if not soup.select_one(".quick-summary,.summary,.pipe-summary"): fail(f"{rel}: summary missing")
    if len(soup.select('.kb-resource-hub[data-kb-auto="v44"]')) != 1: fail(f"{rel}: V44 resource hub mismatch")
    if not soup.select_one("section.cta,.kb-blog-cta"): fail(f"{rel}: CTA missing")
    for fig in soup.select("figure.kb-figure--graphic"):
        if not fig.select_one(".kb-figure-head .kb-figure-kicker") or not fig.select_one(".kb-figure-head .kb-figure-title"):
            fail(f"{rel}: malformed VISUAL GUIDE")
    counts["visual"] += len(soup.select("figure.kb-figure--graphic"))
    counts["photo"] += len(soup.select("figure.kb-figure--photo"))
    counts["tables"] += len(soup.select("table.kb-content-table"))
    counts["takeaways"] += len(soup.select(".kb-takeaways"))
    counts["resource"] += len(soup.select('.kb-resource-hub[data-kb-auto="v44"]'))
    counts["cta"] += len(soup.select("section.cta,.kb-blog-cta"))

css=(ROOT/"assets/css/pages/blog-unified.css").read_text(encoding="utf-8")
if "V44 — KBRIDGE FULL EDITORIAL DESIGN SYSTEM" not in css: fail("blog-unified.css: V44 design block missing")

if errors:
    print("V44 DESIGN QA FAIL")
    for e in errors: print("-",e)
    raise SystemExit(1)
print("V44 DESIGN QA PASS")
print(f"- posts: {len(POSTS)}")
print(f"- VISUAL GUIDE: {counts['visual']}")
print(f"- FIELD CASE photos: {counts['photo']}")
print(f"- tables: {counts['tables']}")
print(f"- KEY TAKEAWAYS: {counts['takeaways']}")
print(f"- resource hubs: {counts['resource']}")
print(f"- CTA: {counts['cta']}")
