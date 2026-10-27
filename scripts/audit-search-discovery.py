#!/usr/bin/env python3
"""K-BRIDGE blog discovery regression checks (no external network calls).

Run after `node scripts/build-blog-posts.mjs` in GitHub Actions.
Does not infer whether Naver has indexed a URL; it verifies that the website
actually publishes and internally discovers all its public blog posts.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

from bs4 import BeautifulSoup

HOST = 'https://www.kbexpress.kr'
CATEGORIES = {'info', 'news', 'service', 'insight', 'glossary'}
LEGACY_REDIRECTS = {'/services.html', '/blog/search.html'}


def url_for(root: Path, path: Path) -> str:
    return HOST + '/' + quote(path.relative_to(root).as_posix(), safe='/._-~')


def get_meta(soup, name: str) -> str:
    tag = soup.find('meta', attrs={'name': re.compile('^'+re.escape(name)+'$', re.I)})
    return str(tag.get('content', '')).lower() if tag else ''


def main(root: Path) -> int:
    errors, warnings = [], []
    root = root.resolve()
    posts = sorted(p for p in (root / 'blog/posts').glob('*/*.html') if p.parent.name in CATEGORIES)
    public = {}
    for post in posts:
        rel = post.relative_to(root).as_posix()
        soup = BeautifulSoup(post.read_text('utf-8'), 'html.parser')
        directives = ' '.join(get_meta(soup, x) for x in ('robots','naverbot','yeti'))
        if 'noindex' in directives:
            continue
        url = url_for(root, post)
        public[url] = rel
        can = soup.find('link', rel=lambda x: x and 'canonical' in x)
        canonical = can.get('href', '') if can else ''
        if canonical != url:
            errors.append(f'canonical 오류: {rel} expected={url}, found={canonical}')
        if not soup.find('h1'):
            errors.append(f'H1 누락: {rel}')
        if not soup.find('article'):
            warnings.append(f'article 엘리먼트 확인 필요: {rel}')

    try:
        manifest = json.loads((root/'assets/blog-posts.json').read_text('utf-8'))
        if not isinstance(manifest, list): raise ValueError('not an array')
    except (ValueError, OSError) as exc:
        errors.append(f'블로그 목록 JSON 파싱 오류: {exc}')
        manifest = []
    published = [x for x in manifest if x.get('published') is not False]
    manifest_urls = [x.get('url','') for x in published]

    try:
        feed = ET.parse(root/'rss.xml').getroot()
        rss_urls = [item.findtext('link','').strip() for item in feed.findall('./channel/item')]
    except (ValueError, ET.ParseError, OSError) as exc:
        errors.append(f'RSS XML 파싱 오류: {exc}')
        rss_urls=[]
    try:
        site = ET.parse(root/'sitemap.xml').getroot()
        locs = [el.text.strip() for el in site.findall('.//{*}loc') if el.text]
    except (ET.ParseError, OSError) as exc:
        errors.append(f'사이트맵 XML 파싱 오류: {exc}')
        locs=[]
    sitemap_post_urls = [u for u in locs if u.startswith(HOST+'/blog/posts/')]
    try:
        blog_index = BeautifulSoup((root/'blog/index.html').read_text('utf-8'),'html.parser')
        static_links = [a.get('href','') for a in blog_index.find_all('a',href=True)]
        linked_urls = {u for u in static_links if u.startswith(HOST+'/blog/posts/')}
    except OSError as exc:
        errors.append(f'블로그 목록 HTML 누락: {exc}')
        linked_urls=set()

    expected=set(public)
    feeds=[('manifest', manifest_urls),('rss',rss_urls),('sitemap',sitemap_post_urls)]
    for name,values in feeds:
        counter=Counter(values)
        dups=[u for u,n in counter.items() if n>1]
        if dups: errors.append(f'{name} 중복 URL {len(dups)}개: {dups[:3]}')
        missing=expected-set(values)
        extra=set(values)-expected
        if missing: errors.append(f'{name} 공개글 누락 {len(missing)}개: {sorted(missing)[:4]}')
        if extra: errors.append(f'{name} 비공개/구주소/미등록 URL {len(extra)}개: {sorted(extra)[:4]}')

    missing_links=expected-linked_urls
    if missing_links: errors.append(f'블로그 HTML 목록 링크에서 빠진 공개 글 {len(missing_links)}개: {sorted(missing_links)[:4]}')
    for url in locs:
        if urlparse(url).path in LEGACY_REDIRECTS:
            errors.append(f'사이트맵에 구주소 등록: {url}')
        if not url.startswith(HOST+'/') and url!=HOST+'/':
            errors.append(f'대표 도메인 불일치: {url}')
    for name in ('robots.txt','CNAME'):
        if not (root/name).is_file():errors.append(f'{name} 누락')
    robots=(root/'robots.txt').read_text('utf-8') if (root/'robots.txt').exists() else ''
    if 'Sitemap: '+HOST+'/sitemap.xml' not in robots:
        errors.append('robots.txt 에 사이트맵 URL 누락')
    if re.search(r'(?im)^Disallow:\s*/\s*$',robots):
        errors.append('robots.txt 에 전체 경로 차단 규칙 발견')
    cname=(root/'CNAME').read_text('utf-8').strip() if (root/'CNAME').exists() else ''
    if cname!='www.kbexpress.kr': errors.append('CNAME 불일치: '+cname)
    # Internal HTML links to obsolete URLs should be flagged, even when old pages
    # are kept as compatibility stubs. Legacy HTML by itself is not a bug.
    old_href=[]
    for page in [root/'index.html',root/'blog/index.html'] + posts:
        if not page.is_file():continue
        source=page.read_text('utf-8')
        for href in re.findall(r'<a\b[^>]*\bhref=[\"\']([^\"\']+)',source,re.I):
            if urlparse(href).path in LEGACY_REDIRECTS:
                old_href.append(f'{page.relative_to(root)} -> {href}')
    if old_href: warnings.append('구주소를 향한 내부 링크: '+str(old_href[:8]))

    print(f'SEARCH DISCOVERY: posts={len(posts)} / public={len(expected)} / manifest={len(manifest_urls)} / RSS={len(rss_urls)} / sitemap posts={len(sitemap_post_urls)} / linked={len(linked_urls)}')
    for msg in warnings: print('WARN:',msg)
    if errors:
        print(f'FAIL: {len(errors)}개')
        for msg in errors: print('ERROR:',msg)
        return 1
    print('PASS: 공개 블로그 URL의 목록·RSS·사이트맵·정규 URL·링크 일치')
    print('NOTE: 이는 실제 네이버 수집·색인 여부 또는 외부 서버의 HTTP 응답을 확인하는 검사가 아닙니다.')
    return 0

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
    args=parser.parse_args()
    sys.exit(main(args.root))
