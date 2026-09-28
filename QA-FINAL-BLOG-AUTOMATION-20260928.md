# KBRIDGE 최종 블로그/SEO 자동화 검수 보고서

- 검수일: 2026-09-28
- 기준 원본: 사용자 업로드 `KBDGFW-main.zip`
- 검수 대상: 최종 보강 패키지 전체
- 목적: 신규 블로그 포스팅의 공통 디자인/SEO/색인 파일 자동 적용과 회귀 오류 방지

## 1. 재검수에서 실제 발견한 문제와 수정 결과

1. **신규 글 Footer 자동 적용 누락**
   - 기존 35개 글은 Footer가 있었지만 신규 템플릿 글은 자동화 후에도 Footer가 생기지 않았음.
   - `enforce-blog-shell.py`가 공통 Header/Mobile/Footer/CSS/JS를 모두 정규화하도록 수정.
   - 기존 블로그 Footer도 하나의 canonical Footer로 통일.

2. **신규 글 발행일 오기입**
   - 템플릿의 화면상 날짜가 `2026-09-28`이어도 SEO `article:published_time`이 기본값 `2026-07-18`로 들어가는 결함 확인.
   - 모든 템플릿에 `kbridge:date` 메타를 추가.
   - 커스텀 업로드 글은 화면의 `article-meta` 날짜 또는 Git 이력을 fallback으로 사용하도록 수정.

3. **51번째 블로그 글부터 자동 배포 실패 가능**
   - RSS는 최신 50개만 생성하지만 기존 검증기는 모든 포스트가 RSS에 있어야 한다고 검사했음.
   - RSS는 최신 50개만 검증하고, 전체 URL은 sitemap에서 검증하도록 수정.
   - 실제 51개 포스트 회귀 테스트 통과.

4. **GitHub Actions Python 의존성 설치 누락**
   - QA 스크립트가 BeautifulSoup을 사용하지만 `requirements.txt` 설치 단계가 없었음.
   - `pip` cache + `python -m pip install -r requirements.txt` 단계 추가.

5. **첫 자동화 이후 다음 실행에서 파일이 한 번 더 바뀌는 문제**
   - 신규 글의 auto SEO block 앞 줄바꿈이 첫/두 번째 실행에서 달라지는 현상 확인.
   - shell 정규화 경계를 고정해 첫 실행부터 최종 byte 결과가 안정되도록 수정.
   - 전체 파이프라인 2회 연속 실행 후 변경 파일 0개 확인.

6. **SEO title 구분자 불일치**
   - 블로그 SEO title의 브랜드 구분자는 `/` 규칙으로 정규화.
   - 신규 템플릿 및 수동 업로드의 `| KBRIDGE`도 `/ KBRIDGE`로 자동 보정.

7. **FAQ/태그 누락 가능성**
   - 모든 신규 템플릿에 FAQ 및 tags scaffold 적용.
   - 임의 HTML 업로드에 FAQ/태그가 없어도 기존 요약/keywords로 자동 보완.
   - 현재 35개 포스트 모두 FAQ/태그 존재 확인.

8. **정적 페이지 sitemap 잔존/누락 가능성**
   - 기존 sitemap block만 재사용하던 구조를 실제 현재 파일과 재조정하도록 수정.
   - 새 정적 HTML 추가 → sitemap 자동 추가, 파일 삭제 → sitemap 자동 제거 테스트 통과.

9. **IndexNow 및 배포 확인**
   - IndexNow 3회 실패 시 workflow 오류 종료 유지.
   - 고정 `sleep 75` 대신 `deploy-version.txt` 실제 배포 확인 후 IndexNow 실행.
   - 수동 `all_site` 실행 시 sitemap 전체 URL 통지 가능.

## 2. 현재 패키지 정적 QA

- BLOG SYSTEM QA: PASS
- V47 DESIGN QA: PASS
- SEO/local resource QA: PASS
- INDEXING QA: PASS
- HTML: 62개
- 실제 indexable URL: 61개
- sitemap URL: 61개
- 블로그 포스트: 35개
- blog manifest: 35개
- RSS: 35개 (50개 미만이므로 전체 포함)
- 고립 내부링크 URL: 0개
- 로컬 리소스 참조 검사: 4,255개 정상
- canonical/robots/naverbot/yeti/OG/Twitter/Article JSON-LD: 정상
- 공통 Header/Footer/Mobile/CSS/JS: 35/35 정상
- FAQ: 35/35 정상
- tags: 35/35 정상
- 공통 Footer 변형 수: 1개 (완전 통일)
- 블로그 SEO title `/` 규칙 위반: 0개
- 39news: manifest/sitemap/RSS 모두 등록

## 3. 미래 신규 포스팅 실제 회귀 테스트

실제 작업 디렉터리 복사본에서 자동화 파이프라인을 실행함.

### 카테고리 템플릿 5종
- info
- service
- news
- insight
- glossary

각 신규 글에 대해 다음을 확인:

- 공통 Header 자동 적용
- 모바일 메뉴 자동 적용
- canonical Footer 자동 적용
- `blog-unified.css` 자동 적용
- `site-chrome.js` 자동 적용
- body category 자동 적용
- canonical 생성
- robots/naverbot/yeti 생성
- 발행일 보존
- `/ KBRIDGE` title 규칙
- FAQ 존재
- tags 존재
- KEY TAKEAWAYS 생성
- 관련자료 허브 생성
- CTA 유지
- blog-posts.json 등록
- blog/index.html 등록
- sitemap 등록
- RSS 등록

### 임의 수동 업로드 HTML 테스트

템플릿을 사용하지 않고 아래 결함을 의도적으로 가진 신규 HTML을 추가한 뒤 파이프라인 실행:

- `| KBRIDGE` title
- canonical 없음
- Header 없음
- Footer 없음
- 모바일 메뉴 없음
- 공통 CSS 없음
- FAQ 없음
- tags 없음
- SEO 날짜 메타 없음
- 화면에 작성일만 존재

결과: 위 항목 모두 자동 보정 후 QA PASS.

### 51번째 포스트 경계 테스트

- 테스트 manifest: 51개
- RSS: 최신 50개
- sitemap: 전체 포스트 포함
- 빌드/검증: PASS

### 멱등성 테스트

전체 자동화 파이프라인을 완전히 종료한 뒤 동일 파이프라인을 다시 실행.

- 최종 변경 파일: **0개**
- 불필요한 bot commit 반복 가능성: 제거 확인

## 4. GitHub Actions 회귀 방지 장치

workflow에 다음 release gate가 존재함:

1. Python dependencies 설치
2. canonical blog shell 정규화
3. SEO 정규화
4. editorial/표/관련자료/이미지 최적화
5. manifest/blog index/sitemap/RSS 생성
6. BLOG SYSTEM QA
7. V47 DESIGN QA
8. SEO/local resource QA
9. INDEXING QA
10. **미래 신규 글 회귀 smoke test**
11. deploy marker 기록
12. generated files commit/push
13. 실제 GitHub Pages marker 확인
14. IndexNow 통지

따라서 신규 포스트가 구조를 깨뜨리거나 향후 50건 RSS 경계 문제가 재발하면 배포 자동화 단계에서 실패하도록 구성함.

## 5. 남아 있는 비차단 권고 사항

현재 indexable 페이지 중:

- title 40자 초과: 29개
- description 80자 초과: 25개

이는 **색인 차단 오류가 아니며 현재 QA에서는 경고로만 기록**한다. 기존 검색 문구를 임의로 축약해 의미/키워드를 훼손하지 않기 위해 이번 안정화 작업에서는 수정하지 않았다. 필요하면 별도 SEO snippet 최적화 작업으로 각 문서를 사람이 검토하면서 축약하는 것이 안전하다.

## 최종 판정

현재 파일 기준으로 신규 블로그 글의 공통 Shell, 디자인 클래스, SEO, 발행일, FAQ, tags, manifest, blog index, sitemap, RSS가 자동 적용되는 것을 실제 생성/수동 업로드/51개 경계/2회 반복 실행 테스트로 확인했다.

패키지 내부 정적·자동화 QA 결과는 PASS이며, 실제 네이버의 최종 색인 여부 자체는 검색엔진의 판단이므로 패키지가 강제할 수 없지만 네이버가 수집/재색인하는 데 필요한 사이트 측 구조와 통지 자동화는 검증 완료 상태다.
