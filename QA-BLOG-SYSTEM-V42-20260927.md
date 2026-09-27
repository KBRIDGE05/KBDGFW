# KBRIDGE Blog System V42 QA Report

검수일: 2026-09-27
기준 패키지: V41 SEO/PERFORMANCE FINAL

## 적용 내용

- 카테고리별 신규 포스팅 템플릿 5종
- 신규 포스팅 생성기 `scripts/create-blog-post.py`
- 본문 공통 컴포넌트 작성 기준 문서화
- 관련 글 자동 추천: 포스팅당 3개
- 관련 KBRIDGE 물류도구 자동 추천: 포스팅당 최대 2개
- 카테고리별 NEXT STEP 문구
- `data-kb-blog-category` 자동 훅
- Blog System 구조 QA 추가
- 기존 SEO/성능 QA와 GitHub Actions 연결

## 기존 포스팅 적용 결과

- 전체 포스팅: 34개
- V42 관련자료 허브: 34/34
- 관련 글 카드: 3개 × 34글
- 물류도구 카드: 31글은 2개, 3글은 1개
- VISUAL GUIDE 구조 검사: 132개 정상
- 표 공통 구조 검사: 44개 정상
- 핵심요약: 각 글 1개
- 목차: 각 글 1개, 깨진 앵커 0
- CTA: 각 글 1개
- KEY TAKEAWAYS: 각 글 1개
- 중복 ID: 0

## SEO / 리소스 QA

- HTML 페이지: 61개
- 블로그 SEO 검사: 34개
- 로컬 리소스 참조: 4,179개
- canonical: 정상
- robots / naverbot / yeti: 정상
- OG / Twitter: 정상
- Article JSON-LD: 정상
- sitemap / RSS / blog manifest: 정상
- 블로그 이미지 lazy + async decoding: 정상

## 코드 QA

- Python scripts: `py_compile` 통과
- JavaScript / MJS: `node --check` 통과
- CSS 중괄호 균형: 통과
- GitHub Actions YAML 파싱: 통과

## 자동화 안정성

전체 블로그 자동화 순서를 두 번 연속 실행한 후 34개 포스팅, blog index, manifest, sitemap, RSS의 SHA-256을 비교했습니다.

- 2회차 결과 변화: 0
- Workflow idempotency: PASS

즉, 자동화 스크립트가 서로 결과를 다시 뒤집거나 반복적으로 HTML을 변경하지 않습니다.

## 신규 포스팅 템플릿 검수

별도 복제본에서 다음 명령으로 테스트 포스트를 생성했습니다.

```bash
python scripts/create-blog-post.py \
  --category info \
  --slug v42-template-test \
  --title "V42 신규 포스팅 자동화 테스트" \
  --summary "신규 글 자동화 테스트" \
  --keywords "테스트, 물류정보, KBRIDGE"
```

자동화 전체 순서 실행 후:

- H1: 1
- 핵심 요약: 1
- 목차: 1
- KEY TAKEAWAYS: 1
- 관련자료 허브: 1
- CTA: 1
- 관련글: 3
- canonical / OG / JSON-LD / sitemap / RSS / manifest: 정상
- Blog System QA: PASS
- 전체 Site QA: PASS

## 운영 원칙

V42의 관련 글/도구 블록은 이미지가 없는 텍스트 카드입니다. 따라서 신규 이미지 요청과 LCP 경쟁을 늘리지 않습니다. 기존 작성자가 만든 메인 CTA 문구는 덮어쓰지 않으며, NEXT STEP 안내와 관련 물류도구만 자동 생성합니다.
