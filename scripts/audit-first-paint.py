#!/usr/bin/env python3
"""First-paint regression test for home guide + floating controls."""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1]
main = (ROOT / 'index.html').read_text(encoding='utf-8')
chrome = (ROOT / 'assets/site-chrome.js').read_text(encoding='utf-8')
floater = (ROOT / 'assets/kbridge-floating-actions-v13.js').read_text(encoding='utf-8')
assert '<link rel="stylesheet" href="assets/css/interactive-guide.css?' in main, 'Guide stylesheet not parser-discovered'
assert '<section id="kbix-guide"' in main, 'Guide HTML missing from initial markup'
assert main.index('interactive-guide.css') < main.index('</head>'), 'Guide CSS not in head'
assert main.index('id="kbix-guide"') < main.index('class="navy-strip"'), 'Guide wrong DOM order'
assert 'document.head.appendChild(style)' not in chrome, 'Dynamic guide CSS returned'
assert "if (!section)" in chrome and "section.dataset.kbixReady = 'true'" in chrome
assert "container.style.display = 'none'" in floater, 'Unstyled floating controls may flash'
assert "cssReady.then" in floater, 'Floating controls shown before CSS ready'
assert "kbridge-floating-actions-v13.js?v=20261029-r8-first-paint" in chrome
html_files=list(ROOT.rglob('*.html'))
for f in html_files:
    src=f.read_text(encoding='utf-8')
    if 'site-chrome.js?v=' in src:
        assert 'site-chrome.js?v=20261029-r8-first-paint' in src, str(f)
print(f'PASS first-paint regression: {len(html_files)} HTML files, static guide CSS and markup, delayed floating controls')
