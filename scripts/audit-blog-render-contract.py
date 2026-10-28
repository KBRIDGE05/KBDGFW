#!/usr/bin/env python3
"""Catch blog styling regressions that HTML/SEO validation cannot see.

Covers all currently published posts, including non-editorial-variant articles.
The browser companion test checks computed row alignment at desktop/mobile sizes.
"""
from pathlib import Path
import re
from lxml import html

ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / 'blog' / 'posts'
CSS = ROOT / 'assets/css/pages/blog-editorial.css'
VERSION = '20261029-layout-r6'


def run():
    errors = []
    count = 0
    rows = 0
    for post in sorted(POSTS.glob('*/*.html')):
        source = post.read_text('utf-8')
        if 'kb-blog-post' not in source:
            continue
        count += 1
        name = post.relative_to(ROOT).as_posix()
        dom = html.fromstring(source)
        main = dom.xpath('//main')
        if len(main) != 1 or main[0].get('id') != 'main':
            errors.append(f'{name}: main#main missing')
        if len(dom.xpath('//*[@id="main"]')) != 1:
            errors.append(f'{name}: duplicate/missing #main')
        links = dom.xpath('//link[contains(@href,"blog-editorial.css")]')
        if len(links) != 1 or VERSION not in links[0].get('href', ''):
            errors.append(f'{name}: missing R6 shared style/cache key')
        if 'enterprise-motion.js?v=20261029-blog-layout-r6' not in source:
            errors.append(f'{name}: outdated motion cache key')
        for row in dom.xpath('//article[contains(concat(" ",normalize-space(@class)," ")," news-item ")]'):
            rows += 1
            if len(row.xpath('./div[contains(concat(" ",normalize-space(@class)," ")," news-num ")]')) != 1:
                errors.append(f'{name}: numbered row lacks a number')
            if not row.xpath('./div[last()]/h3|./div[last()]/h4'):
                errors.append(f'{name}: numbered row lacks a headline')
    css = CSS.read_text('utf-8')
    for token in ('KBRIDGE blog layout contract R6', 'news-list > article.news-item', 'clip-path:none!important', 'h2::before'):
        if token not in css:
            errors.append(f'shared CSS contract missing: {token}')
    normalized = (ROOT/'scripts/enforce-blog-shell.py').read_text('utf-8')
    if 'source = ensure_main_anchor(source)' not in normalized or VERSION not in normalized:
        errors.append('publishing workflow cannot preserve the new layout contract')
    workflow = (ROOT/'.github/workflows/update-blog-posts.yml').read_text('utf-8')
    if 'scripts/audit-blog-render-contract.py' not in workflow:
        errors.append('publishing workflow has no layout regression gate')
    if errors:
        raise SystemExit('BLOG RENDER CONTRACT FAILED\n' + '\n'.join('- '+e for e in errors))
    print(f'BLOG RENDER CONTRACT PASS: {count} published pages; {rows} numbered rows; cache, main-anchor and CI guard verified')


if __name__ == '__main__':
    run()
