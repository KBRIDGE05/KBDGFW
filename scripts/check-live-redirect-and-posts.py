#!/usr/bin/env python3
"""Run only AFTER edge/server HTTP 301 redirects have been activated.
Checks redirects plus 200/canonical/robots of every published URL in sitemap.
No search provider access, no privileged credentials needed.
"""
from __future__ import annotations
import argparse, concurrent.futures, html, re, sys, xml.etree.ElementTree as ET
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse, parse_qs
from urllib.request import Request, build_opener, HTTPRedirectHandler

HOST='https://www.kbexpress.kr'
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None
OPENER=build_opener(NoRedirect)

def request(url: str, timeout: int=12):
    req=Request(url,headers={'User-Agent':'KBRIDGE-SEO-QA/1.0 (+manual authorized test)','Accept':'text/html,application/xml;q=0.9,*/*;q=0.2'})
    try:
        with OPENER.open(req,timeout=timeout) as r:
            return r.status,dict(r.headers),r.read(4_000_000).decode('utf-8','replace')
    except HTTPError as e:
        return e.code,dict(e.headers),e.read(500_000).decode('utf-8','replace')

def main(root: Path) -> int:
    failures=[]
    cases=[
        ('/services.html',HOST+'/#services',False),
        ('/blog/search.html?q=20FT',HOST+'/blog/',True),
        ('/blog/search.html?q=20FT&category=info',HOST+'/blog/',True),
    ]
    for path,target,preserve_query in cases:
        try:
            status,headers,_=request(HOST+path)
            loc=urljoin(HOST,headers.get('Location',headers.get('location','')))
            good=(status==301 and loc.split('?')[0]==target.split('?')[0])
            if preserve_query and good:
                original=parse_qs(urlparse(path).query)
                actual=parse_qs(urlparse(loc).query)
                good=all(actual.get(k)==v for k,v in original.items())
            print(f'301 CHECK {path}: status={status} Location={loc} {"PASS" if good else "FAIL"}')
            if not good: failures.append(f'HTTP 301 설정 미적용/오류: {path} -> {status}, {loc}')
        except (OSError,URLError) as exc: failures.append(f'HTTP 테스트 접속 실패 {path}: {exc}')
    try:
        sitemap=ET.parse(root/'sitemap.xml').getroot()
        posts=[n.text.strip() for n in sitemap.findall('.//{*}loc') if n.text and '/blog/posts/' in n.text]
    except (ET.ParseError,OSError) as exc:
        print('사이트맵 실패',exc);return 1
    print(f'LIVE POST TEST: sitemap blog URLs={len(posts)}')
    def test_post(url):
        try:
            status,headers,body=request(url)
            can=re.search(r'<link\b(?=[^>]*\brel=[\"\']canonical[\"\'])[^>]*\bhref=[\"\']([^\"\']+)',body,re.I)
            if not can:
                can=re.search(r'<link\b(?=[^>]*\bhref=[\"\'][^\"\']+)[^>]*\brel=[\"\']canonical[\"\'][^>]*>',body,re.I)
                canonical='[check manually]' if can else ''
            else: canonical=html.unescape(can.group(1))
            robots_tags=re.findall(r'<meta\b[^>]*\bname=[\"\'](?:robots|naverbot|yeti)[\"\'][^>]*>',body,re.I)
            noindex=any('noindex' in x.lower() for x in robots_tags)
            valid=status==200 and canonical==url and not noindex and '<h1' in body.lower()
            return (url,valid,status,canonical,noindex)
        except (OSError,URLError) as exc: return (url,False,0,str(exc),False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(test_post,posts))
    for url,valid,status,canonical,noindex in results:
        if not valid:failures.append(f'POST ERROR: status={status}, canonical={canonical}, noindex={noindex}: {url}')
    print(f'LIVE POST RESULT {sum(x[1] for x in results)}/{len(posts)} PASS')
    if failures:
        print(f'FAIL {len(failures)}')
        for msg in failures: print('-',msg)
        return 1
    print('PASS: 서버 301 + 전체 블로그 URL HTTP/HTML 검사')
    print('NOTE: HTTP 200 확인이 네이버의 색인/검색 순위를 보장하는 것은 아닙니다.')
    return 0
if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
    sys.exit(main(p.parse_args().root.resolve()))
