#!/usr/bin/env python3
"""Regression checks for every published KBRIDGE editorial article.

Optional: --baseline original.zip ensures article markup and all SEO metadata
remain byte-for-byte unchanged apart from the shared CSS cache revision.
"""
from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path
import re
import zipfile
from urllib.parse import unquote, urlsplit

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / "blog" / "posts"
EDITORIAL_CSS = ROOT / "assets" / "css" / "pages" / "blog-editorial.css"
STYLE_VERSION = "20261018-editorial-r2"
CATEGORIES = {"info", "service", "news", "insight", "glossary"}
KINDS = {
    "briefing", "case", "document", "calculation", "dictionary", "network",
    "route", "process", "journey", "comparison", "compliance", "lookup",
    "systems", "analysis", "market",
}


def class_xpath(name: str) -> str:
    return f"contains(concat(' ',normalize-space(@class),' '),' {name} ')"


def relative_names(page: Path) -> str:
    return page.relative_to(ROOT).as_posix()


def css_blocks_balance(css: str) -> bool:
    """Cheap unmatched-brace guard that excludes strings and comments."""
    scrubbed = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    scrubbed = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', "''", scrubbed)
    depth = 0
    for char in scrubbed:
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def audit(baseline: Path | None) -> None:
    errors: list[str] = []
    counts: Counter[str] = Counter()
    variants: Counter[str] = Counter()
    pages = sorted(page for page in POSTS.glob("*/*.html") if page.parent.name in CATEGORIES)
    zip_archive = zipfile.ZipFile(baseline) if baseline else None

    try:
        for page in pages:
            rel = relative_names(page)
            source = page.read_text("utf-8")
            dom = html.fromstring(source)
            bodies = dom.xpath(f"//body[{class_xpath('kb-editorialized')}]")
            if not bodies:
                # Draft/noindex pages are not part of the 44 published posts.
                continue
            counts["articles"] += 1
            body = bodies[0]
            variant = body.get("data-kb-editorial-kind", "")
            variants[variant] += 1
            if variant not in KINDS:
                errors.append(f"{rel}: unknown topic layout {variant}")

            links = dom.xpath("//link[@href and contains(@href,'blog-editorial.css')]")
            if len(links) != 1 or STYLE_VERSION not in links[0].get("href", ""):
                errors.append(f"{rel}: missing/duplicate r2 editorial stylesheet")

            leads = dom.xpath(f"//section[{class_xpath('kb-editorial-lead')}]")
            if len(leads) != 1:
                errors.append(f"{rel}: expected one field note, got {len(leads)}")
            else:
                lead = leads[0]
                for cls in ("kb-editorial-label", "kb-editorial-index", "kb-editorial-answer"):
                    fields = lead.xpath(f".//*[{class_xpath(cls)}]")
                    if len(fields) != 1 or not "".join(fields[0].itertext()).strip():
                        errors.append(f"{rel}: field note {cls} empty/duplicate")
                jumps = lead.xpath(f".//a[{class_xpath('kb-editorial-jump')}]")
                ids = set(dom.xpath("//*[@id]/@id"))
                if len(jumps) != 1 or jumps[0].get("href", "")[1:] not in ids:
                    errors.append(f"{rel}: field note action has invalid target")

            for table in dom.xpath("//table"):
                counts["tables"] += 1
                if not table.xpath(f"ancestor::*[{class_xpath('kb-table-shell')}]"):
                    errors.append(f"{rel}: table missing horizontal-scroll container")
                try:
                    cols = int(table.get("data-kb-cols", "0"))
                except ValueError:
                    cols = 0
                if cols < 2 or cols > 6:
                    errors.append(f"{rel}: invalid column metadata {cols}")
                for row in table.xpath(".//tr"):
                    cells = row.xpath("./th|./td")
                    try:
                        actual = sum(int(cell.get("colspan", "1")) for cell in cells)
                    except ValueError:
                        actual = -1
                    if actual != cols:
                        errors.append(f"{rel}: table row {actual} cells, metadata {cols}")

            counts["checklists"] += len(dom.xpath(
                f"//ul[{class_xpath('checklist')}]|//ol[{class_xpath('checklist')}]|//div[{class_xpath('checklist')}]|//*[{class_xpath('pipe-check-grid')}]"
            ))

            for body_content in dom.xpath(f"//div[{class_xpath('article-body')}]"):
                stray_ui = body_content.xpath(".//mark|.//input[@type='checkbox']")
                if stray_ui:
                    errors.append(f"{rel}: unexpected inline highlights/checkbox controls")
                for node in body_content.xpath(".//text()"):
                    value = node.strip()
                    if value.startswith(("|---", "###", "**")) or any(
                        glyph in value for glyph in ("☐", "☑", "✅", "□")
                    ):
                        errors.append(f"{rel}: leftover markdown/checkmark text")
                ids = set(dom.xpath("//*[@id]/@id"))
                for anchor in body_content.xpath(".//a[starts-with(@href,'#')]"):
                    if anchor.get("href", "")[1:] not in ids:
                        errors.append(f"{rel}: broken article anchor {anchor.get('href')}")
                for image in body_content.xpath(".//img[@src]"):
                    uri = urlsplit(image.get("src", ""))
                    if uri.scheme or uri.netloc or uri.path.startswith("/"):
                        continue
                    counts["images"] += 1
                    if not (page.parent / unquote(uri.path)).is_file():
                        errors.append(f"{rel}: missing article image {image.get('src')}")

            if zip_archive is not None:
                name = "KBDGFW-main/" + rel
                try:
                    original = zip_archive.read(name).decode("utf-8")
                except KeyError:
                    errors.append(f"{rel}: not found in baseline archive")
                else:
                    restored = source.replace(STYLE_VERSION, "20261018-editorial-r1")
                    # apply_patch may add a terminal newline to files which
                    # originally ended immediately after </html>.
                    if restored.rstrip("\r\n") != original.rstrip("\r\n"):
                        errors.append(f"{rel}: article, SEO or script changed beyond CSS link")

        css = EDITORIAL_CSS.read_text("utf-8")
        if not css_blocks_balance(css):
            errors.append("editorial CSS contains unbalanced blocks")
        for sentinel in (
            "Editorial readability r2", "--kb-ed-paper", "#2458b5",
            "h2::before", "list-style: disc outside!important",
            ".kb-table-shell", "-webkit-text-fill-color", "@media (max-width: 760px)",
        ):
            if sentinel not in css:
                errors.append(f"editorial CSS missing expected readability rule: {sentinel}")

        if counts["articles"] != 44:
            errors.append(f"published articles: expected 44, got {counts['articles']}")
        if set(variants) != KINDS:
            errors.append(f"topic types differ: {set(variants) ^ KINDS}")
        if counts["tables"] < 59 or counts["checklists"] < 68:
            errors.append("tables/checklists appear to have been removed")
        if errors:
            print(f"EDITORIAL QA FAIL: {len(errors)} issues")
            for item in errors:
                print(" -", item)
            raise SystemExit(1)
        print("EDITORIAL QA PASS")
        print(f"- {counts['articles']} posts; {len(variants)} themed layouts")
        print(f"- {counts['tables']} tables with complete rows and scroll containers")
        print(f"- {counts['checklists']} preserved checklists")
        print(f"- {counts['images']} article images; all files and anchor targets resolve")
        print("- every field-note label, answer and link target verified; no stray markdown/checkbox marks")
        print("- CSS syntax, readability rules and cache version verified")
        if baseline:
            print("- 44 article sources and SEO metadata unchanged except for CSS cache revision")
    finally:
        if zip_archive:
            zip_archive.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path)
    args = parser.parse_args()
    audit(args.baseline)
