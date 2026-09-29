# K-BRIDGE 네이버 접근불가 URL 대응 수정 보고서

- 기준 패키지: `KBDGFW-main(7).zip`
- 수정일: 2026-09-29
- 목적: 네이버 서치어드바이저에 남아 있는 과거 URL의 400/접근불가 상태를 정적 호환 페이지로 해소하고, 향후 자동화가 해당 URL을 다시 색인 대상으로 등록하지 못하도록 방지

## 적용한 호환 URL

1. `/services.html`
   - `noindex,follow`
   - canonical: `https://www.kbexpress.kr/`
   - 현재 서비스 영역 `https://www.kbexpress.kr/#services`로 자동 이동

2. `/blog/search.html?q=...`
   - `noindex,follow`
   - canonical: `https://www.kbexpress.kr/blog/`
   - 기존 `q` 검색어와 유효한 `category` 값을 현재 `/blog/` 검색으로 전달
   - `assets/blog.js`가 `?q=`를 읽고 검색창/검색 결과에 반영하도록 수정

3. `/blog/posts/insight/index.html`
   - `noindex,follow`
   - `blog-published=false`
   - canonical: `https://www.kbexpress.kr/blog/posts/insight/arctic.html`
   - 정상 북극항로 글로 자동 이동

## 자동화 재발 방지

- noindex 호환 페이지를 블로그 공통 쉘/SEO/에디토리얼/관련자료 자동화에서 제외
- 디자인·사이트 QA에서도 noindex 호환 페이지를 일반 포스팅으로 오인하지 않도록 수정
- `scripts/legacy-url-map.json` 추가
- `scripts/audit-legacy-urls.py` 추가
- GitHub Actions에 Legacy URL QA 단계 추가
- 신규 글 생성기가 폐기 URL 예약 경로를 덮어쓰지 못하도록 차단
- smoke test의 RSS 50건 경계 계산에서 noindex/legacy 파일을 제외하도록 보정

## 최종 QA

- `audit-blog-system.py`: PASS
- `audit-design-v47.py`: PASS
- `audit-site.py`: PASS
- `audit-indexing.py`: PASS
  - HTML 66 / indexable 62 / sitemap 62
  - blog manifest 36 / RSS 36
  - orphan 0
- `audit-legacy-urls.py`: PASS
  - 호환 페이지 3개
  - noindex/follow + canonical + 이동 처리 정상
  - sitemap/RSS/blog manifest 폐기 URL 0건
  - 현재 HTML 내부링크의 폐기 URL 0건
  - legacy 검색 q 전달 정상
- `smoke-test-blog-automation.py`: PASS
  - 5개 카테고리 + raw upload 회귀검수
  - RSS 51개 경계 / RSS 50개 제한 정상
  - 2회 전체 파이프라인 멱등성 정상

## 참고

GitHub Pages는 일반 웹서버처럼 `.htaccess` 기반의 서버 측 301을 사용할 수 없으므로, 알려진 과거 URL에는 정적 호환 페이지를 두고 `noindex,follow + canonical + client redirect` 방식으로 대응했습니다. 해당 URL은 sitemap/RSS/blog manifest에 포함하지 않습니다.
