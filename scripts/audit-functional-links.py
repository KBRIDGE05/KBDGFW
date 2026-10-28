#!/usr/bin/env python3
"""Independent functional-link contract: confirm blog CTAs reach live quote modes.

HTML validators can report success for existing index.html while #contact and
#quote do nothing. This test prevents that regression in new/updated articles.
"""
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'index.html'
HOME = BeautifulSoup(INDEX.read_text('utf-8'), 'html.parser')
SCRIPTS = [str(x.get('src', '')) for x in HOME.select('script[src]')]
ERRORS = []

if not HOME.select_one('#services'):
    ERRORS.append('index.html: #services target is absent')
if not any('quote-entry.js' in x for x in SCRIPTS):
    ERRORS.append('index.html: quote-entry.js is absent')
if not all(HOME.select_one('#'+id_) for id_ in ('formalDialog','seaDialog','expressDialog')):
    ERRORS.append('index.html: quote dialogs missing')
quote_entry=(ROOT/'assets/quote-entry.js').read_text('utf-8')
if 'new URLSearchParams(location.search).get("quote")' not in quote_entry:
    ERRORS.append('assets/quote-entry.js: URL parameter handler missing')

checked=0
for page in sorted((ROOT/'blog/posts').glob('*/*.html')):
    rel=page.relative_to(ROOT).as_posix()
    html=BeautifulSoup(page.read_text('utf-8'), 'html.parser')
    for a in html.select('a[href]'):
        href=str(a.get('href',''))
        url=urlparse(href)
        if url.netloc not in ('', 'www.kbexpress.kr', 'kbexpress.kr'):
            continue
        if not url.path.endswith('index.html') or (url.netloc and url.path != '/index.html'):
            continue
        checked+=1
        if url.fragment in ('quote','contact'):
            ERRORS.append(f'{rel}: orphan home hash {href}')
        elif url.fragment=='services' and 'quote' in parse_qs(url.query):
            mode=parse_qs(url.query)['quote'][0]
            if mode not in ('formal','sea','lcl','air','express'):
                ERRORS.append(f'{rel}: unsupported quote mode {href}')
rss_text=(ROOT/'rss.xml').read_text('utf-8')
for stale in ('https://www.kbexpress.kr/index.html#quote', 'https://www.kbexpress.kr/index.html#contact'):
    if stale in rss_text:
        ERRORS.append(f'rss.xml: stale quote/contact link in syndicated article content: {stale}')
if ERRORS:
    print('FUNCTIONAL LINK CONTRACT FAIL:',len(ERRORS))
    for error in ERRORS[:100]:print(' -',error)
    raise SystemExit(1)
print(f'FUNCTIONAL LINK CONTRACT PASS: {checked} blog-to-home links checked, orphan quote/contact hashes=0')
