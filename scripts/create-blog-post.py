#!/usr/bin/env python3
"""Create a new KBRIDGE blog post from the V42 category templates."""
from __future__ import annotations
import argparse
import html
import json
import re
from datetime import date
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
TEMPLATES=ROOT/"scripts"/"blog-templates"
CATEGORIES={"info","service","news","insight","glossary"}
SEO_TITLE_MAX=40
SEO_DESCRIPTION_MAX=80


def slug_ok(value:str)->bool:
    return bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*",value))


def tags_html(raw: str) -> str:
    seen=[]
    for item in raw.split(','):
        value=re.sub(r"\s+", "", item.strip().lstrip('#'))
        if value and value.lower() not in {x.lower() for x in seen}:
            seen.append(value)
    if not any(x.lower()=="kbridge" for x in seen):
        seen.append("KBRIDGE")
    return "".join(f'<span class="tag">#{html.escape(x)}</span>' for x in seen[:12])


def normalize_seo_title(raw: str) -> str:
    value=re.sub(r"\s+", " ", raw.strip())
    # Keep the site's single brand separator convention.
    value=re.sub(r"\s*[|/-]\s*(?:KBRIDGE|케이브릿지)(?:\s.*)?$", "", value, flags=re.I).strip()
    return f"{value} / KBRIDGE"


def validate_seo(seo_title: str, seo_description: str) -> None:
    if len(seo_title) > SEO_TITLE_MAX:
        raise SystemExit(
            f"SEO title이 {len(seo_title)}자로 {SEO_TITLE_MAX}자를 초과합니다. "
            "--seo-title에 핵심 검색어만 남긴 짧은 제목을 입력하세요."
        )
    if len(seo_description) > SEO_DESCRIPTION_MAX:
        raise SystemExit(
            f"SEO description이 {len(seo_description)}자로 {SEO_DESCRIPTION_MAX}자를 초과합니다. "
            "--seo-description에 80자 이하 요약문을 입력하세요."
        )


def main():
    ap=argparse.ArgumentParser(description="KBRIDGE Blog System V42 post creator")
    ap.add_argument("--category",required=True,choices=sorted(CATEGORIES))
    ap.add_argument("--slug",required=True,help="파일명(.html 제외), 영문/숫자/-/_ 권장")
    ap.add_argument("--title",required=True,help="본문 H1/카드에 쓰는 전체 제목")
    ap.add_argument("--summary",required=True,help="본문에 쓰는 전체 요약")
    ap.add_argument("--seo-title",default="",help="검색용 제목. / KBRIDGE는 자동 정규화, 최종 40자 이하")
    ap.add_argument("--seo-description",default="",help="검색용 설명문, 80자 이하")
    ap.add_argument("--keywords",default="KBRIDGE, 국제물류, 수출입")
    ap.add_argument("--date",default=date.today().isoformat())
    ap.add_argument("--force",action="store_true")
    args=ap.parse_args()
    if not slug_ok(args.slug): raise SystemExit("slug는 영문/숫자/점/하이픈/언더스코어만 사용하세요.")

    seo_title=normalize_seo_title(args.seo_title or args.title)
    seo_description=re.sub(r"\s+", " ", (args.seo_description or args.summary).strip())
    validate_seo(seo_title, seo_description)

    tmpl=(TEMPLATES/f"{args.category}.html.tmpl").read_text("utf-8")
    vals={
        "TITLE":args.title,
        "SUMMARY":args.summary,
        "SEO_TITLE":seo_title,
        "SEO_DESCRIPTION":seo_description,
        "KEYWORDS":args.keywords,
        "DATE":args.date,
        "TAGS_HTML":tags_html(args.keywords),
    }
    for k,v in vals.items(): tmpl=tmpl.replace("{{"+k+"}}",v)
    out=ROOT/"blog"/"posts"/args.category/f"{args.slug}.html"
    legacy_map=ROOT/"scripts"/"legacy-url-map.json"
    if legacy_map.exists():
        legacy_files={str(row.get("file", "")).strip() for row in json.loads(legacy_map.read_text("utf-8"))}
        rel=out.relative_to(ROOT).as_posix()
        if rel in legacy_files:
            raise SystemExit(f"폐기 URL 호환용 예약 경로라 신규 글로 사용할 수 없습니다: {rel}")
    if out.exists() and not args.force: raise SystemExit(f"이미 존재합니다: {out.relative_to(ROOT)}")
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(tmpl,"utf-8",newline="\n")
    print(out.relative_to(ROOT))
    print(f"SEO title {len(seo_title)}/{SEO_TITLE_MAX}자 · description {len(seo_description)}/{SEO_DESCRIPTION_MAX}자")
    print("다음 단계: 글 내용을 작성한 뒤 git push하면 SEO/쉘/관련자료/QA가 자동 적용됩니다.")

if __name__=="__main__": main()
