# KBRIDGE 블로그 새 글 작성 규칙 (REV6)

## 새 글 생성 방법
1. `blog/posts/_template/post-template.html`을 해당 카테고리 폴더로 복사합니다.
2. `{{...}}` 자리의 콘텐츠와 SEO 정보만 교체합니다.
3. 새 글에 `<style>`, `style="..."`, `blog-posts-글이름.css`를 추가하지 않습니다.
4. 새 디자인 컴포넌트가 필요하면 개별 CSS를 만들지 말고 `assets/css/pages/blog-components.css`에 재사용 가능한 클래스만 추가합니다.
5. `assets/css/pages/blog-style-lock.css`는 항상 마지막 스타일시트로 둡니다.
6. 업로드 전 `python tools/validate-blog-style.py`를 실행합니다.

## 고정 CSS 순서
1. `kbridge-design-system.css`
2. `blog-unified.css`
3. `blog-components.css`
4. `blog-style-lock.css` (항상 마지막)

`blog-style-lock.js`는 동적으로 CSS가 추가되더라도 잠금 CSS를 스타일 목록의 마지막으로 되돌립니다.

## 기존 글
기존 글의 전용 CSS/inline `<style>`은 콘텐츠별 특수 구성 호환 때문에 `kbridge:legacy-style=true`로 표시합니다. 하지만 공통 글자 크기, Hero, 본문 폭, 이미지, 표, 참고자료, CTA, 헤더는 마지막의 `blog-style-lock.css`가 통일합니다.
