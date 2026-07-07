(() => {
  const grid = document.getElementById('homeBlogGrid');
  const empty = document.getElementById('homeBlogEmpty');
  if (!grid) return;

  const labels = window.KBRIDGE_BLOG?.labels || {
    info: '물류 정보', service: '물류 서비스', news: '물류 뉴스', insight: '물류 인사이트', glossary: '물류 용어집'
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const displayDate = value => {
    const raw = String(value || '');
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}.${m[2]}.${m[3]}` : (raw || '날짜 미입력');
  };

  const loader = window.KBRIDGE_BLOG?.loadPosts;
  (loader ? loader() : Promise.resolve([]))
    .then(data => {
      const posts = (Array.isArray(data) ? data : [])
        .filter(post => post && post.published !== false && post.title && post.url)
        .slice(0, 3);

      grid.innerHTML = posts.map(post => {
        const label = labels[post.category] || post.categoryLabel || labels.info;
        const href = post.url;
        const thumb = post.thumbnail || 'assets/hero-port.webp';
        return `<article class="blog-card">
          <a class="blog-thumb" href="${esc(href)}" aria-label="${esc(post.title)} 글 보기">
            <img src="${esc(thumb)}" alt="${esc(post.title)}" loading="lazy">
          </a>
          <div class="blog-body">
            <div class="blog-meta">${esc(displayDate(post.date))} · ${esc(label)}</div>
            <h3>${esc(post.title)}</h3>
            <p>${esc(post.summary || '')}</p>
            <a href="${esc(href)}">자세히 보기 →</a>
          </div>
        </article>`;
      }).join('');

      if (empty) empty.hidden = posts.length > 0;
    })
    .catch(error => {
      console.error(error);
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
    });
})();
