#!/usr/bin/env python3
"""KBRIDGE blog style guard.
New posts must use the locked common template and must not define per-post CSS.
Legacy posts are allowed only when explicitly marked kbridge:legacy-style=true.
"""
from pathlib import Path
import re, sys
ROOT=Path(__file__).resolve().parents[1]
POSTS=ROOT/'blog'/'posts'
errors=[]; warnings=[]; checked=0
for p in sorted(POSTS.rglob('*.html')):
    if any(part.startswith('_') for part in p.relative_to(POSTS).parts):
        continue
    checked+=1
    t=p.read_text(encoding='utf-8',errors='ignore')
    rel=p.relative_to(ROOT).as_posix()
    legacy=bool(re.search(r'<meta[^>]+name=["\']kbridge:legacy-style["\'][^>]+content=["\']true["\']',t,re.I))
    if 'data-kb-blog-template="locked-v1"' not in t and "data-kb-blog-template='locked-v1'" not in t:
        errors.append(f'{rel}: body data-kb-blog-template="locked-v1" missing')
    if 'blog-style-lock.css' not in t or 'data-kb-blog-style-lock' not in t:
        errors.append(f'{rel}: canonical blog-style-lock.css missing')
    if 'blog-components.css' not in t:
        errors.append(f'{rel}: shared blog-components.css missing')
    if 'blog-style-lock.js' not in t:
        errors.append(f'{rel}: blog-style-lock.js missing')
    style_tags=len(re.findall(r'<style\b',t,re.I))
    inline_attrs=len(re.findall(r'\sstyle\s*=\s*["\']',t,re.I))
    per_css=re.findall(r'href=["\'][^"\']*blog-posts-[^"\']+\.css[^"\']*["\']',t,re.I)
    if style_tags or inline_attrs or per_css:
        msg=f'{rel}: legacy styling found (style tags={style_tags}, inline={inline_attrs}, per-post-css={len(per_css)})'
        if legacy: warnings.append(msg)
        else: errors.append(msg+'; move reusable rules to blog-components.css')
    # Lock must occur after every stylesheet/style tag in source order.
    lock_pos=t.rfind('blog-style-lock.css')
    last_css=max([m.start() for m in re.finditer(r'<(?:link\b[^>]*rel=["\'][^"\']*stylesheet|style\b)',t,re.I)] or [-1])
    if lock_pos < last_css:
        errors.append(f'{rel}: blog-style-lock.css is not the final style source')
print(f'Checked {checked} published blog HTML files')
for w in warnings: print('WARN:',w)
if errors:
    for e in errors: print('ERROR:',e)
    print(f'FAILED: {len(errors)} blocking issue(s)')
    sys.exit(1)
print(f'PASS: 0 blocking issues, {len(warnings)} legacy warning(s)')
