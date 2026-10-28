# K-BRIDGE V23 설치 안내

**GitHub 적용:** 전체 파일을 업로드하더라도 GitHub에서는 기존 파일의 삭제가 자동으로 일어나지 않을 수 있습니다. 반드시 `.github/workflows/kbridge-blog-link-cleanup-v22.yml`을 제거하세요. 삭제는 URL 감사의 필수 조건입니다.

1. 현재 GitHub `main` ZIP으로 별도 백업합니다.
2. `V23_PATCH` ZIP을 압축 해제하여 동일한 상대경로로 파일들을 업로드합니다. 43주차 글·최근 변경 파일을 보존하기 위해 현재 저장소 기준 패치 적용을 우선합니다.
3. `.github/workflows/kbridge-blog-link-cleanup-v22.yml`을 GitHub에서 삭제합니다.
4. 파일 변경을 커밋하고 Actions의 `KBRIDGE Blog SEO Automation` 성공 여부를 확인합니다.
5. GitHub Pages 배포 성공 후 블로그 전체목록과 `/#category=news`, `/#q=20FT`, 43주차 뉴스, 안전운임 조회를 확인합니다.

경고: V23 전체 ZIP은 사용자가 첨부한 `KBDGFW-main(4).zip` 시점의 완전한 스냅샷입니다. 이후 GitHub에 별도로 추가한 새 게시글이 있다면 전체 ZIP을 무조건 덮어쓰지 마세요.
Cloudflare 301/DNS/SSL, robots.txt, sitemap 설정은 별도 변경할 필요 없습니다. `sitemap.xml`은 블로그 생성기가 메타데이터를 기준으로 재생성하는 파일이며 76개 URL 등록 상태를 유지합니다.
