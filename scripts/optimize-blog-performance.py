#!/usr/bin/env python3
"""Safe blog performance normalization.

- Keeps authored content/design intact.
- Makes below-the-fold blog images lazy and async.
- Adds intrinsic width/height for local images when missing to reduce CLS.
- Keeps social/SEO images untouched in meta tags.
"""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

try:
    from PIL import Image
except Exception:  # Optional: lazy-loading optimization still works without Pillow.
    Image = None

ROOT = Path(__file__).resolve().parents[1]
POSTS_ROOT = ROOT / "blog" / "posts"
IMG_RE = re.compile(r"<img\b[^>]*>", re.I)
ATTR_RE = re.compile(r"([^\s=/>]+)\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"'=<>`]+))")


def attrs(tag: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in ATTR_RE.finditer(tag):
        out[m.group(1).lower()] = next((g for g in m.groups()[1:] if g is not None), "")
    return out


def set_attr(tag: str, name: str, value: str) -> str:
    pattern = re.compile(rf"\s+{re.escape(name)}\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
    tag = pattern.sub("", tag)
    return tag[:-1].rstrip() + f' {name}="{value}">'


def del_attr(tag: str, name: str) -> str:
    pattern = re.compile(rf"\s+{re.escape(name)}\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
    return pattern.sub("", tag)


def local_image(page: Path, src: str) -> Path | None:
    raw = src.split("?", 1)[0].split("#", 1)[0].strip()
    if not raw or raw.startswith(("data:", "http://", "https://", "//")):
        return None
    raw = unquote(urlsplit(raw).path)
    candidate = (ROOT / raw.lstrip("/")) if raw.startswith("/") else (page.parent / raw)
    try:
        candidate = candidate.resolve()
        candidate.relative_to(ROOT.resolve())
    except Exception:
        return None
    return candidate if candidate.is_file() else None


def image_dimensions(path: Path) -> tuple[int, int] | None:
    if Image is None:
        return None
    try:
        with Image.open(path) as im:
            return int(im.width), int(im.height)
    except Exception:
        return None


def optimize_page(page: Path, *, blog_post: bool) -> bool:
    original = page.read_text("utf-8")

    def repl(match: re.Match[str]) -> str:
        tag = match.group(0)
        a = attrs(tag)
        src = a.get("src") or a.get("data-src") or ""
        if not src:
            return tag

        # Intrinsic dimensions prevent layout shift without changing rendered CSS size.
        if not (a.get("width") and a.get("height")):
            local = local_image(page, src)
            dims = image_dimensions(local) if local else None
            if dims:
                tag = set_attr(tag, "width", str(dims[0]))
                tag = set_attr(tag, "height", str(dims[1]))

        tag = set_attr(tag, "decoding", "async")

        if blog_post:
            # Blog article images are below the title/summary. The source thumbnail remains
            # available to OG/JSON-LD but does not need to compete with above-the-fold text.
            tag = set_attr(tag, "loading", "lazy")
            tag = del_attr(tag, "fetchpriority")
        return tag

    updated = IMG_RE.sub(repl, original).replace("\r\n", "\n")
    if updated != original:
        page.write_text(updated, "utf-8", newline="\n")
        return True
    return False


def main() -> None:
    changed = []
    for page in sorted(ROOT.rglob("*.html")):
        if ".git" in page.parts:
            continue
        blog_post = POSTS_ROOT in page.parents and page.parent.parent == POSTS_ROOT
        if optimize_page(page, blog_post=blog_post):
            changed.append(page.relative_to(ROOT).as_posix())
    print(f"이미지 로딩/CLS 안전 최적화 완료: {len(changed)}개 HTML 변경")
    for rel in changed:
        print(f"- {rel}")


if __name__ == "__main__":
    main()
