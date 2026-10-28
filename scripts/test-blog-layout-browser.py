#!/usr/bin/env python3
"""Optional real-browser visual geometry check for all published KBRIDGE posts.

Requires python-playwright and a Chromium browser. No site deployment or network
access is required: inject the same local CSS files in document order.
Usage: python scripts/test-blog-layout-browser.py
"""
from pathlib import Path
import json
import re
import os
import sys
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
POSTS = sorted(p for p in (ROOT / 'blog/posts').glob('*/*.html')
               if 'kb-blog-post' in p.read_text('utf-8'))
WIDTHS = [int(x) for x in os.getenv("KBRIDGE_WIDTHS","390,1440").split(",")]
LIMIT = int(os.getenv("KBRIDGE_LIMIT", "0"))
OFFSET = int(os.getenv("KBRIDGE_OFFSET", "0"))
POSTS = POSTS[OFFSET:OFFSET+LIMIT] if LIMIT else POSTS[OFFSET:]
CSS_LINK_RE = re.compile(r'<link\b(?=[^>]*\brel=["\']stylesheet["\'])[^>]*\bhref=["\']([^"\']+)', re.I)
ROW_JS = r'''() => {
  const values = [];
  document.querySelectorAll('article.news-item').forEach(row => {
    const num=row.querySelector(':scope > .news-num');
    const heading=row.querySelector(':scope > div:last-child > h3, :scope > div:last-child > h4');
    if (!num || !heading) { values.push({error:'missing number/heading'}); return; }
    const a=num.getBoundingClientRect(), b=heading.getBoundingClientRect();
    values.push({delta:Math.round((a.y-b.y)*100)/100, xGap:Math.round(b.x-a.x),
      display:getComputedStyle(row).display, margin:getComputedStyle(heading).marginTop,
      pseudo:getComputedStyle(heading,'::before').content});
  });
  const headers=[...document.querySelectorAll('.article-body > section.section > h2,.article-body > section.pipe-section > h2')]
    .map(h => getComputedStyle(h,'::before').content);
  return {rows:values, headings:headers, styles:document.styleSheets.length,
    bodyClass:document.body.className, mainId:document.querySelector('main')?.id};
}'''


def run():
    failures = []
    total_rows = 0
    with sync_playwright() as tool:
        browser = tool.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        for width in WIDTHS:
            page = browser.new_page(viewport={'width':width,'height':900})
            page.route("**/*", lambda route: route.abort())
            for path in POSTS:
                if os.getenv("KBRIDGE_TRACE"):
                    print(f"TEST {width} {path.name}",file=sys.stderr,flush=True)
                name = path.relative_to(ROOT).as_posix()
                src = path.read_text('utf-8')
                try:
                    # Static render check: remove links/scripts/images that would make
                    # about:blank fetch blocked external resources (and hang on load).
                    stylesheet_links = CSS_LINK_RE.findall(src)
                    clean = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', src, flags=re.I)
                    clean = re.sub(r'<link\b[^>]*>', '', clean, flags=re.I)
                    clean = re.sub(r'(<img\b[^>]*?)\bsrc=[\"\'][^\"\']*[\"\']',
                                   r'\1src="data:image/gif;base64,R0lGODlhAQABAAAAACw="', clean, flags=re.I)
                    clean = re.sub(r'\s+srcset=[\"\'][^\"\']*[\"\']', '', clean, flags=re.I)
                    page.set_content(clean,wait_until='domcontentloaded',timeout=20000)
                    css_count = 0
                    for href in stylesheet_links:
                        css=(path.parent / href.split('?')[0]).resolve()
                        if not css.is_file():
                            failures.append(f'{name} {width}px: missing CSS {href}'); continue
                        page.add_style_tag(content=css.read_text('utf-8'))
                        css_count += 1
                    res=page.evaluate(ROW_JS)
                    if res['styles'] < css_count or res['mainId'] != 'main':
                        failures.append(f'{name} {width}px: CSS/main missing')
                    for i,row in enumerate(res['rows'],1):
                        total_rows += 1
                        if row.get('error') or row.get('display') != 'grid' or abs(row.get('delta',99)) > 1.2 or row.get('pseudo') not in ('none','normal'):
                            failures.append(f'{name} {width}px row {i}: {row}')
                    for i,content in enumerate(res['headings'],1):
                        if content not in ('none', 'normal'):
                            failures.append(f'{name} {width}px heading {i} unexpected decoration: {content}')
                except Exception as exc:
                    failures.append(f'{name} {width}px failed to load: {exc}')
            page.close()
        browser.close()
    result={"pages":len(POSTS),"widths":WIDTHS,"numbered_rows_checked":total_rows,"failures":failures}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if failures:
        raise SystemExit(1)

if __name__=='__main__':
    run()
