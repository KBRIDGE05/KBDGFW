#!/usr/bin/env python3
"""Structural QA for the KBRIDGE Blog System V42."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote, urlsplit
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
POSTS=ROOT/"blog"/"posts"
CATEGORIES={"info","service","news","insight","glossary"}
errors=[]


def fail(msg): errors.append(msg)


def local_target(page:Path, href:str):
    u=urlsplit(href)
    if u.scheme or u.netloc:
        if u.netloc not in {"www.kbexpress.kr","kbexpress.kr"}: return None
        path=unquote(u.path)
        return ROOT/path.lstrip("/")
    path=unquote(u.path)
    if not path or path.startswith("#"): return None
    return (ROOT/path.lstrip("/")) if path.startswith("/") else (page.parent/path)


def main():
    count=0; figures=0; tables=0; resources=0
    for page in sorted(POSTS.glob("*/*.html")):
        if page.parent.name not in CATEGORIES: continue
        count+=1
        rel=page.relative_to(ROOT).as_posix()
        soup=BeautifulSoup(page.read_text("utf-8",errors="ignore"),"html.parser")
        ids=[str(x.get("id")) for x in soup.find_all(id=True)]
        dup={x for x in ids if ids.count(x)>1}
        if dup: fail(f"{rel}: 중복 id {sorted(dup)}")
        if len(soup.find_all("h1"))!=1: fail(f"{rel}: h1 구조 이상")
        if len(soup.select(".quick-summary,.pipe-summary,.summary"))!=1: fail(f"{rel}: 핵심 요약은 정확히 1개여야 함")
        tocs=soup.select(".toc,.pipe-toc")
        if len(tocs)!=1: fail(f"{rel}: 목차 개수 {len(tocs)}")
        else:
            for a in tocs[0].find_all("a",href=True):
                href=a["href"]
                if href.startswith("#") and href[1:] not in ids: fail(f"{rel}: 깨진 목차 링크 {href}")
        if len(soup.select("section.cta,.kb-blog-cta"))!=1: fail(f"{rel}: CTA 개수 이상")
        if len(soup.select(".kb-takeaways"))!=1: fail(f"{rel}: KEY TAKEAWAYS 개수 이상")
        hubs=soup.select(".kb-resource-hub[data-kb-auto='v42']")
        if len(hubs)!=1: fail(f"{rel}: V42 관련자료 허브 개수 {len(hubs)}")
        else:
            resources+=1
            cards=hubs[0].select(".kb-resource-card")
            if len(cards)<2: fail(f"{rel}: 관련자료 카드가 너무 적음")
            for a in hubs[0].find_all("a",href=True):
                target=local_target(page,a["href"])
                if target is not None:
                    if target.is_dir(): target=target/"index.html"
                    if not target.resolve().exists(): fail(f"{rel}: 관련자료 링크 누락 {a['href']}")
        cat=soup.body.get("data-kb-blog-category") if soup.body else None
        if cat != page.parent.name: fail(f"{rel}: data-kb-blog-category 불일치")
        for fig in soup.select("figure.kb-figure--graphic"):
            figures+=1
            if len(fig.select(":scope > .kb-figure-head"))!=1: fail(f"{rel}: VISUAL GUIDE 헤더 구조 이상")
            if len(fig.select(":scope > .kb-figure-head > .kb-figure-kicker"))!=1: fail(f"{rel}: VISUAL GUIDE 라벨 구조 이상")
            if len(fig.select(":scope > .kb-figure-head > .kb-figure-title"))!=1: fail(f"{rel}: VISUAL GUIDE 제목 구조 이상")
        for table in soup.find_all("table"):
            tables+=1
            if "kb-content-table" not in (table.get("class") or []): fail(f"{rel}: 표 공통 클래스 누락")
            if not table.get("data-kb-cols"): fail(f"{rel}: 표 열수 메타 누락")
    if errors:
        print(f"BLOG SYSTEM QA FAIL: {len(errors)}개")
        for e in errors: print("-",e)
        raise SystemExit(1)
    print("BLOG SYSTEM QA PASS")
    print(f"- 포스팅: {count}개")
    print(f"- V42 관련자료 허브: {resources}개")
    print(f"- VISUAL GUIDE 구조 검사: {figures}개")
    print(f"- 표 공통 구조 검사: {tables}개")
    print("- 핵심요약/목차/CTA/KEY TAKEAWAYS/중복 ID/내부링크: 정상")

if __name__=="__main__": main()
