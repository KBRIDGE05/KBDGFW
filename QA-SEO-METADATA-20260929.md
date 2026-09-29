# K-BRIDGE SEO Metadata QA — 2026-09-29

## 수정 범위
- 기준 패키지: `KBDGFW-main_NAVER_ACCESS_FIX_20260929.zip`
- 기존 길이 경고: **55건**
  - `<title>` 40자 초과: **29건**
  - `<meta name="description">` 80자 초과: **26건**
  - 영향 파일: **30개**
- 수정 후 길이 경고: **0건**

## 적용 원칙
- 검색용 `<title>`은 **40자 이하**로 축약하되 핵심 검색어와 `/ KBRIDGE` 브랜드 구분자를 유지했습니다.
- 검색용 description은 **80자 이하**로 정리했습니다.
- 본문 `<h1>`과 본문 내용은 변경하지 않았습니다. 기존 66개 HTML의 H1 비교 결과 변경 **0건**입니다.
- 블로그 포스트는 SEO title/description과 `og:title`, `og:description`, `twitter:title`, `twitter:description`, Article JSON-LD headline/description이 같은 검색용 메타데이터를 사용하도록 정규화했습니다.
- 기존 블로그 카드/목록 제목은 H1을 계속 원본으로 사용하므로 표시용 제목과 검색용 제목을 분리했습니다.

## 재발 방지
1. `create-blog-post.py`
   - `--seo-title`, `--seo-description` 옵션 추가
   - SEO title 40자 초과 또는 description 80자 초과 시 파일 생성을 중단
   - 검색용 제목의 `/ KBRIDGE` 구분자를 자동 정규화
2. 카테고리 템플릿
   - 본문 `{{TITLE}}`/`{{SUMMARY}}`와 검색용 `{{SEO_TITLE}}`/`{{SEO_DESCRIPTION}}` 분리
3. `normalize-blog-posts.py`
   - 검색용 title/description을 OG/Twitter/Article JSON-LD에도 동기화
4. `audit-indexing.py`
   - 길이 초과를 단순 WARN이 아니라 **QA FAIL** 조건으로 변경
   - 블로그의 OG/Twitter title/description 불일치도 **QA FAIL** 처리

## 실제 QA 실행 결과
- BLOG SYSTEM QA: **PASS**
- V47 DESIGN QA: **PASS**
- SITE QA: **PASS**
- INDEXING QA: **PASS**
  - HTML 66
  - indexable 62
  - sitemap 62
  - blog manifest 36
  - RSS 36
  - orphan pages 0
  - title/description length warnings 0
- LEGACY URL QA: **PASS**
- FUTURE BLOG AUTOMATION SMOKE: **PASS**
  - 5개 카테고리 + 수동 HTML 업로드 회귀검수
  - RSS 51번째 글 경계검수
  - 2회 전체 파이프라인 실행 idempotent

## 참고
이번 작업은 검색 메타데이터 최적화이며, 기존 본문 H1·본문 구성·공통 디자인·CTA·내부 링크 구조는 유지했습니다.
