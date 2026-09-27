# KBRIDGE Blog System V42

V42는 기존 블로그 디자인을 다시 바꾸는 버전이 아니라 **새 글을 같은 품질로 반복 생산하기 위한 운영 시스템**입니다.

## 1. 신규 글 생성

카테고리별 기본 구조를 자동으로 생성합니다.

```bash
python scripts/create-blog-post.py \
  --category glossary \
  --slug sample-post \
  --title "샘플 물류 용어" \
  --summary "고객이 가장 먼저 알아야 할 핵심 설명입니다." \
  --keywords "물류용어, 수출입, KBRIDGE"
```

지원 카테고리:
- `info`: 문제 → 확인 방법 → 실무 포인트 → 체크리스트 → FAQ
- `service`: 고객 상황 → 수행 방식 → 프로세스 → 실제 사례 → 견적 체크 → FAQ
- `news`: 해상 → 항공 → 통관·정책 → 실무 대응
- `insight`: 이슈 → 원인 → 영향 → 대응 → FAQ
- `glossary`: 정의 → 비교 → 실무 적용 → 체크리스트 → FAQ

생성 후 본문만 작성해 push하면 GitHub Actions가 공통 Header/Footer, SEO, 표, VISUAL GUIDE, 관련글, 물류도구, sitemap/RSS/IndexNow, QA를 자동 적용합니다.

## 2. 공통 본문 컴포넌트

새 글에서는 아래 기존 클래스를 우선 사용합니다.

- 핵심 요약: `.quick-summary`
- 목차: `.toc`
- 본문 파트: `.section`
- 파트 첫 답변: H2 바로 아래 첫 `<p>` → 자동으로 `.kb-section-lead`
- 표: 일반 `<table>` 사용 → 자동으로 `.kb-content-table` 규격 적용
- 체크리스트: `.checklist`
- FAQ: `.faq`, `.faq-item`
- 시각자료: `<figure>` + 이미지 → 자동으로 `VISUAL GUIDE` 구조 정규화
- 글 마지막 요약: `.kb-takeaways` → 자동 생성
- 관련 자료/도구: `.kb-resource-hub` → 자동 생성
- 상담 CTA: `.cta.kb-blog-cta`

## 3. 관련 글 자동화

`scripts/enrich-blog-system.py`가 각 글의 제목·키워드·태그·소제목을 비교해 **같은 카테고리에서 관련도가 높은 글 최대 3개**를 선택합니다. 같은 카테고리에 충분한 글이 없을 때만 다른 카테고리에서 보완합니다.

관련글은 텍스트 카드 방식이라 추가 이미지 요청이 없고 페이지 로딩 부담이 작습니다.

## 4. KBRIDGE 물류도구 자동 연결

본문 주제를 분석해 최대 2개의 관련 도구를 노출합니다. 예:

- 관세/과세가격 → 관부가세 계산기, 관세청 고시환율
- HS CODE → HS CODE 조회
- CBM/컨테이너/적입 → CBM 계산기, 적입·배차 시뮬레이터
- AIS/선박 위치 → 실시간 선박 위치, 선박 추적
- 위험물/ESS/배터리 → 위험물 정보 조회
- Incoterms/FOB/CIF/DDP → 인코텀즈 가이드
- LCL/CFS → LCL 창고료
- 운임/SCFI/BDI → 운임지수

도구 매핑은 `scripts/blog-system-config.json`에서 관리합니다.

## 5. 카테고리별 전환 문구

관련자료 영역의 안내문은 카테고리별로 자동 적용합니다. 실제 글의 메인 CTA 문구는 작성자가 정한 내용을 유지하므로 기존 서비스/브랜딩 문구를 덮어쓰지 않습니다.

## 6. 자동 QA

기존 `scripts/audit-site.py`와 별도로 `scripts/audit-blog-system.py`가 다음을 검사합니다.

- H1 1개
- 핵심 요약 1개
- 목차 1개 및 깨진 앵커 0개
- CTA 1개
- KEY TAKEAWAYS 1개
- V42 관련자료 허브 1개
- 관련글/도구 로컬 링크 존재 여부
- 중복 ID 여부
- VISUAL GUIDE 헤더/라벨/제목 구조
- 모든 표의 공통 클래스와 열 수 메타데이터
- 카테고리 데이터 훅

하나라도 실패하면 GitHub Actions가 자동 커밋 전에 중단됩니다.

## 7. 배포 순서

1. 공통 블로그 쉘 정규화
2. canonical/OG/JSON-LD/Naver SEO 정규화
3. 쉘 최종 고정
4. 본문 에디토리얼 구조 보강
5. 표 규격화
6. 관련 물류도구/관련글 생성
7. 이미지 lazy/CLS 최적화
8. 블로그 목록/sitemap/RSS 생성
9. Blog System QA
10. 전체 SEO/리소스 QA
11. 자동 커밋
12. Pages 배포 후 Naver IndexNow 알림

이 순서를 바꾸지 않는 것이 안전합니다.
