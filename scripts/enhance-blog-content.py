#!/usr/bin/env python3
"""Apply the KBRIDGE editorial reading system to blog article content.

The script is intentionally idempotent and uses only Python's standard library.
It does not rewrite authored copy. It adds presentation hooks around existing
content: figure framing/captions, section-lead classes, and a recap block built
from the article's own summary points or section headings.
"""
from __future__ import annotations

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POSTS_ROOT = ROOT / "blog" / "posts"
CATEGORIES = {"info", "service", "news", "insight", "glossary"}

FIGURE_RE = re.compile(r"<figure\b(?P<attrs>[^>]*)>(?P<body>[\s\S]*?)</figure>", re.I)
IMG_RE = re.compile(r"<img\b(?P<attrs>[^>]*)>", re.I)
CLASS_RE = re.compile(r"\bclass\s*=\s*([\"'])(?P<value>.*?)\1", re.I | re.S)
ATTR_RE_TEMPLATE = r"\b{name}\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))"
SECTION_RE = re.compile(r"<section\b(?P<attrs>[^>]*)>(?P<body>[\s\S]*?)</section>", re.I)
H2_RE = re.compile(r"<h2\b[^>]*>(?P<body>[\s\S]*?)</h2>", re.I)
P_AFTER_H2_RE = re.compile(r"(?P<h2><h2\b[^>]*>[\s\S]*?</h2>\s*)(?P<p><p\b(?P<attrs>[^>]*)>)", re.I)
SUMMARY_RE = re.compile(
    r"<section\b[^>]*class=[\"'][^\"']*(?:quick-summary|pipe-summary|\bsummary\b)[^\"']*[\"'][^>]*>(?P<body>[\s\S]*?)</section>",
    re.I,
)
SUMMARY_ITEM_RE = re.compile(
    r"<(?:div|li)\b[^>]*class=[\"'][^\"']*(?:summary-point|pipe-key)[^\"']*[\"'][^>]*>(?P<body>[\s\S]*?)</(?:div|li)>",
    re.I,
)
FAQ_SECTION_RE = re.compile(r"<section\b[^>]*(?:id=[\"']faq[\"']|class=[\"'][^\"']*faq[^\"']*[\"'])[^>]*>", re.I)
CTA_SECTION_RE = re.compile(r"<section\b[^>]*class=[\"'][^\"']*(?:\bcta\b|kb-blog-cta)[^\"']*[\"'][^>]*>", re.I)
TAKEAWAYS_RE = re.compile(r"class=[\"'][^\"']*kb-takeaways[^\"']*[\"']", re.I)


def strip_tags(value: str) -> str:
    value = re.sub(r"<script\b[\s\S]*?</script>", " ", value or "", flags=re.I)
    value = re.sub(r"<style\b[\s\S]*?</style>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    return html.unescape(re.sub(r"\s+", " ", value)).strip()


def attr_value(attrs: str, name: str) -> str:
    m = re.search(ATTR_RE_TEMPLATE.format(name=re.escape(name)), attrs, re.I)
    if not m:
        return ""
    return html.unescape(next(g for g in m.groups() if g is not None)).strip()


def add_class(attrs: str, *new_classes: str) -> str:
    m = CLASS_RE.search(attrs)
    if m:
        classes = m.group("value").split()
        for cls in new_classes:
            if cls and cls not in classes:
                classes.append(cls)
        quote = m.group(1)
        repl = f'class={quote}{" ".join(classes)}{quote}'
        return attrs[:m.start()] + repl + attrs[m.end():]
    return attrs.rstrip() + f' class="{" ".join(c for c in new_classes if c)}"'


def clean_visual_text(text: str) -> str:
    text = strip_tags(text)
    text = re.sub(r"\s*(?:인포그래픽|썸네일)\s*$", "", text, flags=re.I)
    text = re.sub(r"^(?:KBRIDGE|케이브릿지)\s*", "", text, flags=re.I)
    return text.strip(" ·-|:")


def previous_heading(source: str, pos: int) -> str:
    region = source[:pos]
    matches = list(H2_RE.finditer(region))
    if not matches:
        return "핵심 내용을 한눈에 보기"
    text = clean_visual_text(matches[-1].group("body"))
    text = re.sub(r"^\s*\d+[.)]?\s*", "", text)
    return text or "핵심 내용을 한눈에 보기"


def enhance_figures(source: str) -> str:
    out: list[str] = []
    cursor = 0
    for m in FIGURE_RE.finditer(source):
        out.append(source[cursor:m.start()])
        attrs = m.group("attrs")
        body = m.group("body")
        classes = set((CLASS_RE.search(attrs).group("value").split() if CLASS_RE.search(attrs) else []))
        img = IMG_RE.search(body)
        if not img:
            out.append(m.group(0)); cursor = m.end(); continue
        src = attr_value(img.group("attrs"), "src").split("?", 1)[0].lower()
        alt = clean_visual_text(attr_value(img.group("attrs"), "alt"))
        is_cover = bool(classes & {"cover", "cover-thumbnail", "pipe-cover"}) or "thumbnail_" in src
        if is_cover:
            out.append(m.group(0)); cursor = m.end(); continue

        is_graphic = (
            "visual_" in src
            or "infographic" in src
            or bool(classes & {"body-visual", "visual", "figure"})
        )
        kind = "kb-figure--graphic" if is_graphic else "kb-figure--photo"
        attrs = add_class(attrs, "kb-figure", kind)

        if is_graphic and "kb-figure-head" not in body:
            title = previous_heading(source, m.start())
            head = (
                '<div class="kb-figure-head">'
                '<span class="kb-figure-kicker">VISUAL GUIDE</span>'
                f'<strong class="kb-figure-title">{html.escape(title)}</strong>'
                '</div>'
            )
            body = head + body

        if not re.search(r"<figcaption\b", body, re.I) and alt:
            label = "읽는 포인트" if is_graphic else "현장 설명"
            body += f'<figcaption><strong>{label}</strong>{html.escape(alt)}</figcaption>'

        out.append(f"<figure{attrs}>{body}</figure>")
        cursor = m.end()
    out.append(source[cursor:])
    return "".join(out)


def mark_section_leads(source: str) -> str:
    def section_repl(sm: re.Match[str]) -> str:
        attrs, body = sm.group("attrs"), sm.group("body")
        cls_match = CLASS_RE.search(attrs)
        classes = set(cls_match.group("value").split()) if cls_match else set()
        if not ("section" in classes or "pipe-section" in classes):
            return sm.group(0)
        if "kb-section-lead" in body:
            return sm.group(0)

        def p_repl(pm: re.Match[str]) -> str:
            p_attrs = pm.group("attrs")
            existing = CLASS_RE.search(p_attrs)
            p_classes = set(existing.group("value").split()) if existing else set()
            if p_classes & {"note", "warning", "warn", "data-note", "pipe-note", "editor-note"}:
                return pm.group(0)
            return pm.group("h2") + f"<p{add_class(p_attrs, 'kb-section-lead')}>"

        new_body, count = P_AFTER_H2_RE.subn(p_repl, body, count=1)
        return f"<section{attrs}>{new_body}</section>" if count else sm.group(0)

    return SECTION_RE.sub(section_repl, source)


def takeaway_items(source: str) -> list[str]:
    items: list[str] = []
    sm = SUMMARY_RE.search(source)
    if sm:
        for item_m in SUMMARY_ITEM_RE.finditer(sm.group("body")):
            text = strip_tags(item_m.group("body"))
            if text and text not in items:
                items.append(text)
        if len(items) < 3:
            summary_text = strip_tags(sm.group("body"))
            for sent in re.split(r"(?<=[.!?다요])\s+", summary_text):
                sent = sent.strip()
                if 18 <= len(sent) <= 130 and sent not in items:
                    items.append(sent)
                if len(items) >= 5:
                    break
    if len(items) < 3:
        for h in H2_RE.finditer(source):
            text = clean_visual_text(h.group("body"))
            if not text:
                continue
            if any(word in text for word in ("자주 묻", "FAQ", "문의", "체크리스트")):
                continue
            text = re.sub(r"^\s*\d+[.)]?\s*", "", text)
            if text not in items:
                items.append(text)
            if len(items) >= 5:
                break
    return items[:6]


def add_takeaways(source: str) -> str:
    if TAKEAWAYS_RE.search(source):
        return source
    items = takeaway_items(source)
    if not items:
        return source
    lis = "".join(f"<li>{html.escape(item)}</li>" for item in items)
    block = (
        '<section class="kb-takeaways" aria-label="이 글에서 기억할 것">'
        '<p class="kb-takeaways-kicker">KEY TAKEAWAYS</p>'
        '<h2>이 글에서 기억할 것</h2>'
        f'<ol>{lis}</ol>'
        '</section>\n'
    )
    faq = FAQ_SECTION_RE.search(source)
    cta = CTA_SECTION_RE.search(source)
    pos = faq.start() if faq else (cta.start() if cta else -1)
    if pos < 0:
        return source
    return source[:pos] + block + source[pos:]


def enhance(source: str) -> str:
    source = enhance_figures(source)
    source = mark_section_leads(source)
    source = add_takeaways(source)
    return source.replace("\r\n", "\n")


def main() -> None:
    changed: list[str] = []
    for path in sorted(POSTS_ROOT.glob("*/*.html")):
        if path.parent.name not in CATEGORIES:
            continue
        original = path.read_text(encoding="utf-8")
        updated = enhance(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8", newline="\n")
            changed.append(path.relative_to(ROOT).as_posix())
    print(f"블로그 본문 에디토리얼 구조 적용 완료: {len(changed)}개 파일 변경")
    for item in changed:
        print(f"- {item}")


if __name__ == "__main__":
    main()
