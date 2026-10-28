#!/usr/bin/env python3
"""Sitewide URL contract: prevent recurring query-duplicate blog pages.

This deliberately checks *authored HTML* rather than only generated manifest/RSS.
A site's sitemap can be perfect while its navigation still exposes hundreds of
near-duplicate category URLs to Naver and other web crawlers.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlsplit
import re
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://www.kbexpress.kr'
CATEGORIES = {'info', 'service', 'news', 'insight', 'glossary'}


def main() -> None:
    errors: list[str] = []
    titles = defaultdict(list)
    descriptions = defaultdict(list)
    canonical_urls = defaultdict(list)
    indexed_count = 0
    hash_category_links = 0
    html_count = 0
    for page in sorted(ROOT.rglob('*.html')):
        if '.git' in page.parts:
            continue
        html_count += 1
        rel = page.relative_to(ROOT).as_posix()
        source = page.read_text('utf-8')
        doc = BeautifulSoup(source, 'html.parser')
        robots = ' '.join(str(meta.get('content', '')) for meta in doc.select('meta[name=robots],meta[name=naverbot],meta[name=yeti]')).lower()
        noindex = 'noindex' in robots
        if not noindex:
            indexed_count += 1
            title = doc.title.get_text(' ', strip=True) if doc.title else ''
            description = doc.find('meta', attrs={'name': 'description'})
            desc = str(description.get('content', '')).strip() if description else ''
            canonical = doc.find('link', rel=lambda x: x and 'canonical' in x)
            link = str(canonical.get('href', '')).strip() if canonical else ''
            if not title or not desc or not link:
                errors.append(f'{rel}: title / description / canonical missing')
            else:
                titles[title].append(rel)
                descriptions[desc].append(rel)
                canonical_urls[link].append(rel)
        # Also find explicit category parameters in static links. These are the
        # root cause of Naver duplicate-title reports on /blog/?category=...
        # and /blog/index.html?category=... even if canonical points at /blog/.
        for anchor in doc.select('a[href]'):
            href = str(anchor.get('href', '')).strip()
            uri = urlsplit(urljoin(SITE + '/' + rel, href))
            if uri.hostname not in {'www.kbexpress.kr', 'kbexpress.kr'}:
                continue
            if uri.path.rstrip('/') == '/blog/index.html':
                errors.append(f'{rel}: internal link sends users to redundant /blog/index.html: {href}')
            if uri.path.rstrip('/') == '/blog' and 'category' in parse_qs(uri.query):
                errors.append(f'{rel}: crawlable category query URL: {href}')
            if uri.path.rstrip('/') == '/blog' and uri.fragment.startswith('category='):
                params = parse_qs(uri.fragment, keep_blank_values=True)
                selected = params.get('category', [''])[0]
                if selected not in CATEGORIES:
                    errors.append(f'{rel}: invalid fragment category: {href}')
                else:
                    hash_category_links += 1
        if rel == 'blog/index.html':
            can = doc.find('link', rel=lambda x: x and 'canonical' in x)
            if not can or can.get('href') != SITE + '/blog/':
                errors.append('blog/index.html must canonicalize to /blog/')
            js_path = ROOT/'assets/blog.js'
            js = js_path.read_text('utf-8') if js_path.exists() else ''
            if 'location.hash' not in js or 'syncFilterUrl' not in js or 'hashchange' not in js:
                errors.append('blog.js does not implement stable fragment category selection')
    # Distinct indexable HTML pages must not claim an identical title or
    # description. Variations of a single page (query/fragment) share one HTML.
    for label, mapping in [('title', titles), ('description', descriptions)]:
        for value, paths in mapping.items():
            if len(paths) > 1:
                errors.append(f'duplicate indexable {label}: {paths} value={value[:85]}')
    for url, paths in canonical_urls.items():
        if len(paths) > 1:
            errors.append(f'multiple indexable HTML files point to canonical {url}: {paths}')
    # Never let V22's single-use workflow be restarted to patch only ten links.
    if (ROOT/'.github/workflows/kbridge-blog-link-cleanup-v22.yml').exists():
        errors.append('obsolete V22 one-off patch workflow is still installed')
    # Generation templates and navigation normalization cannot reintroduce
    # legacy links. Match path plus query, not distinct SEO canonical URLs.
    source = (ROOT/'scripts/enforce-blog-shell.py').read_text('utf-8')
    if 'blog/index.html?category=' in source or 'blog/?category=' in source:
        errors.append('enforce-blog-shell.py would regenerate crawlable query URLs')
    print(f'URL CONTRACT: HTML={html_count}, indexable={indexed_count}, fragment category links={hash_category_links}')
    if errors:
        print(f'URL CONTRACT FAIL: {len(errors)}')
        for e in errors[:100]:
            print(' -', e)
        raise SystemExit(1)
    print('URL CONTRACT PASS: all authored navigation/canonical/title/description and template links')

if __name__ == '__main__':
    main()
