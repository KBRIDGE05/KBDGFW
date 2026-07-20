# KBRIDGE CSS architecture v17

- `assets/css/kbridge-design-system.css`: site-wide design layer loaded last on every page.
- `assets/css/pages/*.css`: one page-specific layout/function stylesheet per HTML page.
- All HTML `<style>` blocks were removed.
- All generated CSS uses cascade layers (`page` then `design`) and contains no `!important`.
- Subpage hero photos and `assets/hero/` were removed. The main page hero remains unchanged.
- Tool JavaScript and form submission scripts were not changed.


## v12 adjustments
- Unified every subpage hero to the load-planner navy-to-teal gradient.
- Kept the main-page hero unchanged.
- Removed the freight-index search/filter strip and moved the dashboard anchor to the market summary.
- Changed the quote-comparison and warehouse card-section backgrounds from gray to white.


## v13 unified visual and motion update

- Shared navy, blue and cyan visual palette across every page
- Animated image-free subpage hero with moving gradient, grid and glow layers
- Unified card, table, input, button, CTA, footer and status component styling
- Scroll reveal with staggered motion and reduced-motion accessibility support
- Header scroll state and page reading progress indicator
- Hover lift, icon movement and button light sweep on fine-pointer devices
- Existing calculation, search, upload and inquiry JavaScript was not changed
- No page-level inline style blocks or new `!important` declarations were added


## v14 가독성 보정
- 본문·보조문구·테두리 대비 강화
- 입력창과 비활성 탭의 경계 명확화
- 안전운임 플렉시백 컨테이너 항목을 설명+선택 2열 구조로 재배치


## v15 updates
- 안전운임 안내사항을 보조 안내 크기로 축소하고 읽기 쉬운 불릿 구조로 정리
- FAQ를 표/카드 그리드 대신 구분선 기반 단일 아코디언 흐름으로 통일
- 블로그 FAQ와 견적/창고 FAQ를 native details/summary 구조로 통합
- 전체 페이지의 스크롤 등장 애니메이션을 rise/left/right/scale/line 규칙으로 통일
- 헤더, 히어로, 카드 그룹, FAQ에 일관된 진입 및 인터랙션 적용


## v16 수정
- FAQ details 클릭 동작을 공통 site-chrome에서 확정적으로 제어
- FAQ를 스크롤 clip-path 애니메이션 대상에서 제외해 펼침 영역 잘림 방지
- FAQ 영역 content-visibility 강제 해제로 펼침 높이 갱신 안정화
- 전체 파일 선택 버튼 및 커스텀 업로드 버튼 글자색을 흰색으로 통일


## v17 optimization and audit
- Mobile layout and touch-target rules consolidated in the common design layer.
- Exact duplicate page CSS files consolidated into three shared page-type stylesheets.
- Duplicate load-planner JavaScript extracted into one deferred shared file.
- Unreferenced helper/icon files removed conservatively.
- Below-fold images/iframes use lazy loading and local images include intrinsic dimensions.
- Large OG PNG files palette-optimized without changing paths or dimensions.
- Sitemap rebuilt from canonical, indexable HTML pages; canonical duplicate aliases remain functional but use noindex.
- Naver/Yeti robots directives, robots.txt, canonical URLs, sitemap and ownership file retained.

## v18 blog CTA visibility fix
- Audited all 11 static blog post HTML files under `blog/posts/`.
- Added the shared `kb-blog-cta` marker to every post CTA.
- Protected CTA headings and lead paragraphs from article-body text-color overrides.
- Standardized CTA contrast: white headings, high-contrast light descriptions, white buttons with navy labels.
- Added mobile single-column CTA buttons below 560px.
- Updated the shared design stylesheet cache version on all 38 HTML pages.
- Verified CTA computed colors on all posts and confirmed zero mobile horizontal-overflow issues.


## v19 Naver crawl audit (2026-07-21)
- Fixed 3 broken internal links: `/warehouse.html` → `/warehouse-inquiry.html`.
- Removed non-document SVG `<title>` from the home page.
- Split generated-download `<title>` markup in `safe-rate.html` so crawlers do not count it as a second page title.
- Converted `vessel-tracking.html` from a canonical/noindex alias into a distinct self-canonical indexable AIS tracking page.
- Added `vessel-tracking.html` to `sitemap.xml`.
