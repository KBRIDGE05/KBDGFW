#!/usr/bin/env python3
"""Convert redundant simple bitmap infographics into responsive HTML visuals.

Only a conservative pattern is converted:
- a blog section already contains a structured HTML block (process cards, key-point
  cards, a comparison table, or a checklist), and
- the next sibling is a graphic figure that repeats that structured information.

The authored HTML remains the source of truth. Complex standalone graphics and all
field photography are preserved. The script is idempotent because it writes a file
only when at least one actual conversion occurs.
"""
from __future__ import annotations

import re
from pathlib import Path
from bs4 import BeautifulSoup, Tag

ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / "blog" / "posts"
CATEGORIES = {"info", "service", "news", "insight", "glossary"}
MAIN_RE = re.compile(r"(<main\b[\s\S]*?</main>)", re.I)

SPECS = [
    (".flow, .service-flow, .process-list, .flow-strip, .pipe-flow", "process", "PROCESS"),
    (".briefs", "points", "KEY POINTS"),
    (".news-list", "points", "KEY POINTS"),
    (".table-wrap, .doc-table-wrap, .table-card, .market-table-wrap, .scope-table-wrap, .pipe-table-wrap", "comparison", "COMPARISON"),
    ("ol.checklist", "process", "PROCESS"),
    ("ul.checklist, .pipe-check-grid, .check-grid", "checklist", "CHECKLIST"),
    (".service-points, .field-grid, .fact-grid, .compare-grid, .alliance-grid, .term-grid, .type-grid", "points", "KEY POINTS"),
]


def clean_title(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return re.sub(r"^\s*\d+[.)]\s*", "", text) or "한눈에 보기"


def is_simple_graphic(node: Tag | None) -> bool:
    if not isinstance(node, Tag) or node.name != "figure":
        return False
    if "kb-figure--graphic" not in node.get("class", []):
        return False
    img = node.find("img")
    if not img:
        return False
    src = (img.get("src") or "").lower().split("?", 1)[0]
    return "visual_" in src or "infographic" in src


def candidate(section: Tag):
    for selector, kind, label in SPECS:
        for node in section.select(selector):
            if node.find_parent("section") is section and not node.find_parent(class_="kb-html-visual"):
                return node, kind, label
    return None


def numbered_briefs(node: Tag) -> bool:
    children = [x for x in node.find_all(recursive=False) if isinstance(x, Tag)]
    hits = 0
    for child in children:
        lead = child.find(["strong", "h3", "h4"])
        text = (lead or child).get_text(" ", strip=True)
        if re.match(r"^(?:[①②③④⑤⑥⑦⑧⑨⑩]|\d{1,2}[.)])", text):
            hits += 1
    return bool(children) and hits >= max(2, (len(children) + 1) // 2)


def refine_semantics(block: Tag, kind: str, label: str) -> tuple[str, str]:
    table = block.find("table") if isinstance(block, Tag) else None
    if table:
        headers = [th.get_text(" ", strip=True) for th in table.find_all("th")]
        first = headers[0] if headers else ""
        joined = " ".join(headers)
        if re.search(r"단계|순서|STEP", first, re.I):
            return "process", "PROCESS"
        if re.search(r"변화|지수|운임|수치|날짜|주간|202[0-9]|가격|금액", joined):
            return "data", "DATA"
        return "comparison", "COMPARISON"
    return kind, label


def wrap_module(soup: BeautifulSoup, section: Tag, block: Tag, kind: str, label: str) -> None:
    kind, label = refine_semantics(block, kind, label)
    if kind == "points" and "briefs" in block.get("class", []) and numbered_briefs(block):
        kind, label = "process", "PROCESS"

    h2 = section.find("h2")
    title = clean_title(h2.get_text(" ", strip=True) if h2 else "한눈에 보기")

    wrapper = soup.new_tag("div", attrs={"class": ["kb-html-visual", f"kb-html-visual--{kind}"], "data-kb-ui": "html-visual"})
    head = soup.new_tag("div", attrs={"class": "kb-html-visual-head"})
    kicker = soup.new_tag("span", attrs={"class": "kb-html-visual-kicker"})
    kicker.string = label
    title_node = soup.new_tag("strong", attrs={"class": "kb-html-visual-title"})
    title_node.string = title
    head.extend([kicker, title_node])
    body = soup.new_tag("div", attrs={"class": "kb-html-visual-body"})

    block.insert_before(wrapper)
    block.extract()
    body.append(block)
    wrapper.extend([head, body])


def upgrade(path: Path) -> int:
    source = path.read_text(encoding="utf-8")
    match = MAIN_RE.search(source)
    if not match:
        return 0

    soup = BeautifulSoup(match.group(1), "html.parser")
    count = 0
    for section in list(soup.select("section.section, section.pipe-section")):
        sibling = section.find_next_sibling()
        if not is_simple_graphic(sibling):
            continue
        found = candidate(section)
        if not found:
            continue
        block, kind, label = found
        wrap_module(soup, section, block, kind, label)
        sibling.decompose()
        count += 1

    if not count:
        return 0

    updated = source[: match.start()] + str(soup) + source[match.end() :]
    path.write_text(updated, encoding="utf-8", newline="\n")
    return count


def main() -> None:
    changed = 0
    conversions = 0
    for path in sorted(POSTS.glob("*/*.html")):
        if path.parent.name not in CATEGORIES:
            continue
        n = upgrade(path)
        if n:
            changed += 1
            conversions += n
    print(f"HTML 시각자료 변환 완료: {changed}개 파일 / {conversions}개 모듈")


if __name__ == "__main__":
    main()
