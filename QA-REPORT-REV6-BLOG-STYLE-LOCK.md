# KBRIDGE REV6 Blog Style Lock QA

Date: 2026-08-26
Base: REV5 ENTERPRISE OPTIMIZED

## Architecture changes
- Added `assets/css/pages/blog-components.css` for reusable blog components.
- Added `assets/css/pages/blog-style-lock.css` as the canonical final stylesheet.
- Added `assets/blog-style-lock.js` to keep the lock stylesheet last even when CSS is injected dynamically.
- Added `blog/posts/_template/post-template.html` as the only master template for future posts.
- Added `tools/validate-blog-style.py` to block new per-post CSS, `<style>` and inline `style=` usage.
- Added `.github/workflows/blog-style-guard.yml` to run the validator on blog-related pushes/pull requests.
- Added `BLOG-POSTING-RULES.md` with publishing rules.

## Existing posts
- 22 published post HTML files updated with `data-kb-blog-template="locked-v1"`.
- 22 published posts load `blog-components.css` and `blog-style-lock.css`.
- `blog-style-lock.css` is the final stylesheet on all 22 posts.
- Existing legacy page CSS/embedded style blocks are preserved only for old custom components and are marked with `kbridge:legacy-style=true`.
- Core header, hero, typography, body width, images, tables, references and CTA are locked by the canonical stylesheet.

## Functional/link fix
- Replaced obsolete `https://www.kbexpress.kr/warehouse.html` blog footer links with `https://www.kbexpress.kr/warehouse-inquiry.html`.

## Validation
- Blog style policy: PASS, 0 blocking issues.
- Published blog HTML local CSS/JS/image references checked: 334, missing 0.
- Published posts with lock stylesheet not last: 0.
- Master template forbidden constructs: style tags 0, inline style attributes 0, per-post CSS 0.
- `blog-components.css` CSS parse errors: 0.
- `blog-style-lock.css` CSS parse errors: 0.
- `blog-style-lock.js` JavaScript syntax check: PASS.

## Future post rule
Copy `blog/posts/_template/post-template.html` to the target category folder and replace content/SEO placeholders only. Do not create a new per-post stylesheet. Reusable visual components belong in `blog-components.css`.
