#!/usr/bin/env python3
"""Normalize blog table markup without changing article content.

Adds a shared class and a column-count data attribute to every table in
blog/posts so the global blog stylesheet can render tables consistently.
The transformation is idempotent and intentionally does not rewrite the
surrounding HTML.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / "blog" / "posts"

TABLE_RE = re.compile(r"<table\b[^>]*>.*?</table>", re.I | re.S)
OPEN_RE = re.compile(r"^<table\b[^>]*>", re.I | re.S)
ROW_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.I | re.S)
CELL_RE = re.compile(r"<(?:th|td)\b", re.I)
CLASS_RE = re.compile(r'class\s*=\s*(["\'])(.*?)\1', re.I | re.S)
DATA_RE = re.compile(r'\sdata-kb-cols\s*=\s*(["\']).*?\1', re.I | re.S)


def normalize_opening(open_tag: str, cols: int) -> str:
    m = CLASS_RE.search(open_tag)
    if m:
        classes = m.group(2).split()
        if "kb-content-table" not in classes:
            classes.append("kb-content-table")
        new_class = f'class={m.group(1)}{" ".join(classes)}{m.group(1)}'
        open_tag = open_tag[:m.start()] + new_class + open_tag[m.end():]
    else:
        open_tag = open_tag[:-1] + ' class="kb-content-table">'

    open_tag = DATA_RE.sub("", open_tag)
    open_tag = open_tag[:-1] + f' data-kb-cols="{max(cols, 1)}">'
    return open_tag


def normalize_block(block: str) -> str:
    om = OPEN_RE.match(block)
    if not om:
        return block
    row = ROW_RE.search(block)
    cols = len(CELL_RE.findall(row.group(1))) if row else 1
    new_open = normalize_opening(om.group(0), cols)
    return new_open + block[om.end():]


def main() -> None:
    changed = 0
    tables = 0
    for path in sorted(POSTS.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        tables += len(TABLE_RE.findall(text))
        updated = TABLE_RE.sub(lambda m: normalize_block(m.group(0)), text)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            changed += 1
    print(f"normalized blog tables: pages_changed={changed}, tables={tables}")


if __name__ == "__main__":
    main()
