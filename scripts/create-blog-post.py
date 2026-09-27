#!/usr/bin/env python3
"""Create a new KBRIDGE blog post from the V42 category templates."""
from __future__ import annotations
import argparse
import re
from datetime import date
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
TEMPLATES=ROOT/"scripts"/"blog-templates"
CATEGORIES={"info","service","news","insight","glossary"}


def slug_ok(value:str)->bool:
    return bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*",value))


def main():
    ap=argparse.ArgumentParser(description="KBRIDGE Blog System V42 post creator")
    ap.add_argument("--category",required=True,choices=sorted(CATEGORIES))
    ap.add_argument("--slug",required=True,help="파일명(.html 제외), 영문/숫자/-/_ 권장")
    ap.add_argument("--title",required=True)
    ap.add_argument("--summary",required=True)
    ap.add_argument("--keywords",default="KBRIDGE, 국제물류, 수출입")
    ap.add_argument("--date",default=date.today().isoformat())
    ap.add_argument("--force",action="store_true")
    args=ap.parse_args()
    if not slug_ok(args.slug): raise SystemExit("slug는 영문/숫자/점/하이픈/언더스코어만 사용하세요.")
    tmpl=(TEMPLATES/f"{args.category}.html.tmpl").read_text("utf-8")
    vals={"TITLE":args.title,"SUMMARY":args.summary,"KEYWORDS":args.keywords,"DATE":args.date}
    for k,v in vals.items(): tmpl=tmpl.replace("{{"+k+"}}",v)
    out=ROOT/"blog"/"posts"/args.category/f"{args.slug}.html"
    if out.exists() and not args.force: raise SystemExit(f"이미 존재합니다: {out.relative_to(ROOT)}")
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(tmpl,"utf-8",newline="\n")
    print(out.relative_to(ROOT))
    print("다음 단계: 글 내용을 작성한 뒤 git push하면 SEO/쉘/관련자료/QA가 자동 적용됩니다.")

if __name__=="__main__": main()
