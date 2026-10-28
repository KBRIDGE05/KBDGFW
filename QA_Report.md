# K-BRIDGE 웹사이트 전체 구조 개편 및 검수 보고서 (V23)

검수 기준 원본: `KBDGFW-main(4).zip` (사용자가 제공한 실제 729개 ZIP 항목)
작성일: 2026-10-28 · **GitHub 운영 반영 전 로컬 검사 결과**

## 1. 진단한 근본 원인

1. 블로그 `/blog/`, `/blog/index.html` 및 `?category=...` 주소가 모두 동일한 목록 HTML과 `<title>`, description을 노출했습니다. V22는 블로그 목록의 10개 링크만 변경했지만, **전체 사이트에는 75개 HTML에 총 892개의 쿼리 기반 카테고리 링크**가 남아 있었습니다. 기존 canonical만으로 네이버 중복 진단을 즉시 없앨 수 없었습니다.
2. 자동 블로그 헤더 생성기 `scripts/enforce-blog-shell.py`가 구형 주소를 다시 만들어 새 글 업로드 때 재발할 구조였습니다.
3. 사용 중인 `assets/blog.js`가 탭/검색 전환마다 URL query를 갱신해 같은 페이지의 수집 URL을 추가했습니다. URL만 fragment로 바꾸면 같은 페이지 내 카테고리 메뉴 클릭이 갱신되지 않는 문제도 함께 확인했습니다.
4. 메인 GitHub Actions 검수에서 실제 `scripts/audit-editorial-readability.py`가 빠져 있었습니다. 원본의 최근 3개 글에서 현장 안내 블록 누락·형식 오류 6건이 검출됐습니다.
5. SEO 정규화의 자동 메타 블록 교체 과정에서 기존 `article:modified_time`이 사라지고 과거 날짜로 역행할 위험이 있었습니다. 원본 `logisys.html`의 2026-10-25 수정일이 실행 과정에서 2026-09-29로 되돌아가는 현상을 재현했습니다.
6. 이미 사용된 V22 일회성 수정 워크플로가 남아 있어 재실행·검사 혼선 위험이 있었습니다.

## 2. 실제 수정 범위

- 기존 URL 쿼리 링크 전면 정리: 모든 HTML의 카테고리 링크를 동일한 `/blog/#category=...` 표현으로 통일. 현재 카테고리 링크 총 **892개**, 자동 UI 스크립트는 변경된 fragment를 읽어 목록을 갱신합니다. 기존 `?category=...` 및 `?q=20FT` 유입 주소는 계속 인식하고 브라우저 표시 주소를 단일 형식으로 정규화합니다.
- 중복된 `/blog/index.html` 로컬 내부 링크도 `/blog/`로 정규화. 기존 Cloudflare 301 규칙 세 건은 변경하지 않습니다.
- 공통 블로그 헤더 생성기를 같은 규칙으로 수정하고, 수동 업로드 글의 예전 카테고리 링크도 정규화합니다.
- 수입화물 진행정보 조회, 11월 안전운임 비교, 43주차 뉴스에 각각 주제에 맞는 고유 FIELD NOTE를 추가하고 편집 유형을 올바르게 분류했습니다. 일반 블로그 본문과 운임 계산기 기능은 유지했습니다.
- 블로그 JS 캐시 버전을 갱신해 Cloudflare 브라우저 캐시에 구버전 스크립트가 남지 않도록 했습니다.
- 수정일 역행을 방지하도록 SEO 정규화를 수정하고 원래 글 수정일을 보존했습니다.
- 메인 GitHub Actions에서 편집 가독성·사이트 전체 URL 계약·브라우저 동작 회귀검사를 반드시 실행하도록 수정했습니다.
- 이전 V22 일회성 워크플로는 최종 전체 배포본에서 삭제했습니다. **증분 패치 적용 시에도 아래 파일을 GitHub에서 별도로 삭제해야 합니다:** `.github/workflows/kbridge-blog-link-cleanup-v22.yml`.

## 3. 검수 항목과 결과

| 검사 | 결과 |
|---|---|
| ZIP 원본 분석 | 729개 항목, CRC 검사 정상 |
| 전체 웹사이트 HTML | 80개, 색인 대상 76개 |
| 전체 공개 블로그 | 48개 (별도 구주소 호환용/비색인 1개) |
| RSS / 매니페스트 / 사이트맵 | 48 / 48 / 76 URL 일치 |
| 내부 참조 | 5,185개 경로 감사 PASS |
| 중복 indexable HTML title/description/canonical | 0개 중복 / PASS |
| 사이트 전체 블로그 구형 쿼리 내부 링크 | 0개 / PASS |
| 일반 자동화 감사 9종 | 전부 PASS |
| JS 전체 / Python 전체 문법 | PASS (테스트 로그 참조) |
| GitHub Actions YAML 파싱 | 기존 6개 PASS |
| 브라우저 상태 테스트 (Node VM) | 5가지 진입·카테고리 탭·검색·동일 화면 hashchange PASS |
| 실제 신규 글 생성 회귀 | 5개 카테고리+수동업로드, 54개 글 전체 생성 흐름 PASS |
| 공개 글 125개까지 확장, 삭제 후 124개 | RSS·사이트맵·비공개 제외 PASS |
| 자동화 파이프라인 재실행 | 2회 실행 후 변경 0 / PASS |
| 최신 3개 글 반응형 FIELD NOTE | 360/390/1440px, 가로 오버플로 0 / PASS (격리 렌더) |
| 의도적으로 구형 `?category=` 링크 추가 | URL 감사가 실패를 정상적으로 검출 / PASS |
| 기존 48개 글 최종 수정일 원본 대조 | 전부 일치 / PASS |

**검증 한계:** 로컬 검사는 실제 GitHub Actions 실행, Cloudflare 운영 사이트의 모든 외부 API, 네이버·구글 실시간 수집/색인 또는 검색 순위까지 증명하지 않습니다. Chromium의 외부 사이트 직접 탐색은 실행 환경에서 차단되어, 새 FIELD NOTE 반응형 검사는 실제 프로젝트 CSS를 사용한 격리 렌더입니다. 과거 네이버 서치어드바이저 진단은 재수집·통계 갱신 전까지 남을 수 있습니다.

## 4. 정확한 변경 범위

- 기존 파일 수정: **83개**
- 신규 파일: **2개**
- 기존 파일 삭제: **1개**
- 총 패치 업로드 파일: **85개**

### 신규 파일
- `scripts/audit-url-contract.py`
- `scripts/test-blog-filter.cjs`

### 삭제 파일
- `.github/workflows/kbridge-blog-link-cleanup-v22.yml`

### 수정 파일
- `.github/workflows/update-blog-posts.yml`
- `assets/blog.js`
- `blog/index.html`
- `blog/post.html`
- `blog/posts/glossary/alliance.html`
- `blog/posts/glossary/amazon-fba-entry-guide.html`
- `blog/posts/glossary/azsl.html`
- `blog/posts/glossary/canal.html`
- `blog/posts/glossary/coldchain.html`
- `blog/posts/glossary/container.html`
- `blog/posts/glossary/csbs.html`
- `blog/posts/glossary/customs.html`
- `blog/posts/glossary/export.html`
- `blog/posts/glossary/hscode.html`
- `blog/posts/glossary/index.html`
- `blog/posts/glossary/lgsys.html`
- `blog/posts/glossary/logisys.html`
- `blog/posts/info/air-cw.html`
- `blog/posts/info/ci.html`
- `blog/posts/info/customs inspection.html`
- `blog/posts/info/delay.html`
- `blog/posts/info/import-cargo.html`
- `blog/posts/info/pi.html`
- `blog/posts/info/pl.html`
- `blog/posts/info/safe-rate-nov2026.html`
- `blog/posts/info/vf.html`
- `blog/posts/info/wharfage.html`
- `blog/posts/insight/arctic.html`
- `blog/posts/insight/asia-port-congestion.html`
- `blog/posts/insight/cuimport.html`
- `blog/posts/insight/duty.html`
- `blog/posts/insight/redsea.html`
- `blog/posts/news/28wnews.html`
- `blog/posts/news/29news.html`
- `blog/posts/news/30news.html`
- `blog/posts/news/31news.html`
- `blog/posts/news/32news.html`
- `blog/posts/news/33news.html`
- `blog/posts/news/34news.html`
- `blog/posts/news/35news.html`
- `blog/posts/news/36news.html`
- `blog/posts/news/37news.html`
- `blog/posts/news/38news.html`
- `blog/posts/news/39news.html`
- `blog/posts/news/40news.html`
- `blog/posts/news/41news.html`
- `blog/posts/news/42news.html`
- `blog/posts/news/43news.html`
- `blog/posts/service/ess-import-logistics-gimcheon.html`
- `blog/posts/service/heavy.html`
- `blog/posts/service/pipe.html`
- `blog/posts/service/solar.html`
- `cbm-calculator.html`
- `convenience.html`
- `copyright-policy.html`
- `customs-exchange-rate.html`
- `dangerous-goods.html`
- `domestic.html`
- `duty-calculator.html`
- `food-export-check.html`
- `freight-index.html`
- `holiday-calendar.html`
- `hs-code-search.html`
- `incoterms-guide.html`
- `index.html`
- `lcl-storage.html`
- `load-planner.html`
- `privacy-policy.html`
- `quote-comparison.html`
- `requirements.txt`
- `rss.xml`
- `safe-rate.html`
- `scripts/audit-legacy-urls.py`
- `scripts/enforce-blog-shell.py`
- `scripts/normalize-blog-posts.py`
- `scripts/smoke-test-blog-automation.py`
- `simple-calculator.html`
- `surcharge.html`
- `terminal-info.html`
- `vehicle-spec.html`
- `vessel-location.html`
- `vessel-tracking.html`
- `warehouse-inquiry.html`


## 5. 배포 권장 순서

1. **현재 GitHub `main` 브랜치의 ZIP 백업을 별도 저장**하고, 기존 Cloudflare DNS·SSL·301 설정은 그대로 둡니다.
2. 최신 GitHub 저장소가 사용자 첨부 원본과 동일한지 확인합니다. 새 글이 이후 추가됐다면 전체 ZIP을 무조건 덮어쓰지 않고 증분 파일만 적용합니다.
3. 증분 ZIP의 경로 구조를 유지해 해당 파일만 업로드/덮어씁니다. 구버전 V22 일회성 workflow `.github/workflows/kbridge-blog-link-cleanup-v22.yml`은 GitHub에서 직접 삭제합니다. **삭제하지 않으면 새로운 URL 계약 검사에서 실패하도록 설계했습니다.**
4. GitHub Actions에서 `KBRIDGE Blog SEO Automation`이 **완료/Success**인지 확인한 뒤 GitHub Pages 배포 결과를 확인합니다.
5. 홈페이지, 블로그 전체목록, `/#category=news`, `/#category=info`, `/#q=20FT`, 최근 3개 글, 안전운임 계산기를 실사용 브라우저에서 확인합니다.
6. 네이버 서치어드바이저에서 인덱싱·수집 통계를 다시 확인하되, 즉시 반영되지 않는 이전 진단은 시간을 두고 추이를 판단합니다.

## 6. 롤백

GitHub에서 이번 변경 커밋을 Revert하거나 작업 전 보관한 원본 파일들로 되돌릴 수 있습니다. **Cloudflare 설정을 롤백할 필요는 없습니다.** 단, 이번 해시 상태 링크 수정만 일부 파일에 적용하고 JS를 적용하지 않으면 카테고리 메뉴 기능이 달라질 수 있으므로 관련 파일을 함께 적용해야 합니다.
