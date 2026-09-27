# KBRIDGE V41 SEO · 기능 · 성능 검수 보고서

검수일: 2026-09-26
기준: KBDGFW V40 전체 패키지 → V41 안전 최적화

## 1. 블로그 자동 SEO

- 블로그 포스팅: 34개
- 신규/수정 포스팅 GitHub Actions 자동화:
  1. 공통 블로그 shell 정규화
  2. canonical / robots / naverbot / yeti / OG / Twitter / Article JSON-LD 정규화
  3. 콘텐츠·표 구조 정규화
  4. 이미지 로딩/CLS 안전 최적화
  5. 블로그 목록 / manifest / sitemap.xml / rss.xml 생성
  6. 자동 QA 통과 후 커밋
  7. Pages 배포 대기 후 Naver IndexNow 전송
- 신규 테스트 포스팅을 임시 생성하여 위 전체 파이프라인을 실행한 결과 canonical, robots, OG, Twitter, Article JSON-LD, sitemap, RSS, manifest, 블로그 목록 반영이 모두 통과함.
- `customs inspection.html` 공백 파일명의 canonical / og:url / sitemap URL을 `%20` 정규 URL로 자동 인코딩하도록 수정함.
- 실제 검색 크롤러에서 KBRIDGE 블로그 메인 및 여러 개별 포스팅이 검색 노출되는 상태를 확인함.

> 주의: 자동화는 검색엔진에 색인 가능한 상태와 IndexNow 제출을 보장하지만, 검색엔진의 최종 색인 여부·순위·반영 시점은 검색엔진이 결정함.

## 2. 자동 QA

새 `scripts/audit-site.py`를 GitHub Blog SEO Automation에 연결함. QA 실패 시 생성 SEO 파일을 커밋하기 전에 workflow가 실패하도록 구성함.

최종 결과:
- HTML 페이지: 61개
- 블로그 SEO 페이지: 34개
- 로컬 HTML/CSS/JS/이미지/링크 참조 검사: 4,114개
- 누락 로컬 경로: 0개
- canonical / robots / Naver bot / OG / Twitter / Article JSON-LD / sitemap / RSS / manifest: 통과
- JavaScript 구문: 49개 파일, 오류 0
- Python 구문: 9개 스크립트, 오류 0
- CSS 파싱: 33개 파일, 오류 0
- GitHub Actions YAML: 6개, 오류 0
- sitemap.xml / rss.xml XML 파싱: 정상

## 3. 로딩 최적화

기능·디자인을 바꾸지 않는 범위만 적용함.

- 전체 이미지 decoding=async: 246/246
- 블로그 본문 이미지 loading=lazy: 기존 174/208 → 208/208
- 이미지 intrinsic width/height: 기존 241/246 → 245/246
- 외부/동적 이미지처럼 사전에 크기를 확정할 수 없는 항목은 강제값을 넣지 않음.
- 숨겨진/본문 썸네일과 아래쪽 인포그래픽이 초기 텍스트 렌더링과 네트워크 우선순위를 경쟁하지 않도록 정리함.
- 블로그 manifest JSON을 compact 형식으로 생성하도록 변경: 35,362 bytes → 약 29,634 bytes (약 16% 감소).

## 4. 용량 최적화 원칙

- 기존 WEBP/PNG/JPG를 전수 확인했으며, 이미 압축된 이미지가 대부분이라 무손실 재압축의 실질 이득이 거의 없었음.
- 인포그래픽의 글자 선명도와 OG 이미지 품질을 떨어뜨릴 수 있는 일괄 손실 재압축은 적용하지 않음.
- 사용 중인 안전운임 데이터 chunk, PDF 엔진, 위험물 데이터처럼 기능에 필요한 대용량 파일은 삭제·축소하지 않음.
- 불필요한 Python `__pycache__`는 최종 패키지에서 제거함.

## 5. 결론

V41은 UI나 계산 로직을 변경하는 버전이 아니라, SEO 자동화 검증·실패 방지 QA·URL 정규화·이미지 로딩 및 CLS·manifest 전송량을 안전하게 개선한 버전임.
