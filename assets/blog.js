(() => {
  const menuBtn = document.getElementById('menuBtn');
  const mobileNav = document.getElementById('mobileNav');
  menuBtn?.addEventListener('click', () => {
    const open = mobileNav?.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(Boolean(open)));
  });
  const closeMenu = () => {
    mobileNav?.classList.remove('open');
    menuBtn?.setAttribute('aria-expanded', 'false');
  };
  mobileNav?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));

  const topBtn = document.getElementById('topBtn');
  const syncTop = () => topBtn?.classList.toggle('show', window.scrollY > 360);
  window.addEventListener('scroll', syncTop, { passive: true });
  syncTop();
  topBtn?.addEventListener('click', () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));

  const grid = document.getElementById('blogGrid');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('resultCount');
  const search = document.getElementById('blogSearch');
  const tabs = [...document.querySelectorAll('[data-category]')];
  const labels = window.KBRIDGE_BLOG?.labels || {
    info: '물류 정보', service: '물류 서비스', news: '물류 뉴스', insight: '물류 인사이트', glossary: '물류 용어집'
  };
  const validCategories = new Set(['all', 'info', 'service', 'news', 'insight', 'glossary']);
  const requestedCategory = new URLSearchParams(location.search).get('category') || 'all';
  let posts = [];
  let category = validCategories.has(requestedCategory) ? requestedCategory : 'all';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  const displayDate = value => {
    const raw = String(value || '');
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}.${m[2]}.${m[3]}` : (raw || '날짜 미입력');
  };

  const cardHtml = post => {
    const label = labels[post.category] || post.categoryLabel || labels.info;
    const href = post.url || '#';
    const thumb = post.thumbnail || '../assets/hero-port.webp';
    const searchText = [label, post.title, post.summary, ...(post.keywords || [])].join(' ');
    return `<article class="post-card" data-category="${esc(post.category)}" data-search="${esc(searchText)}">
      <a class="post-thumb" href="${esc(href)}">
        <img src="${esc(thumb)}" alt="${esc(post.title)}" loading="lazy">
      </a>
      <div class="post-body">
        <div class="post-meta"><span>${esc(label)}</span>${esc(displayDate(post.date))}</div>
        <h2>${esc(post.title)}</h2>
        <p>${esc(post.summary || '')}</p>
        <a class="post-link" href="${esc(href)}">자세히 보기 →</a>
      </div>
    </article>`;
  };

  const syncTabs = () => tabs.forEach(btn => btn.classList.toggle('active', (btn.dataset.category || 'all') === category));

  const updateCategoryUrl = () => {
    const url = new URL(location.href);
    if (category === 'all') url.searchParams.delete('category');
    else url.searchParams.set('category', category);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  };

  const render = () => {
    const q = (search?.value || '').trim().toLowerCase();
    const filtered = posts.filter(post => {
      const label = labels[post.category] || post.categoryLabel || '';
      const haystack = [label, post.title, post.summary, ...(post.keywords || [])].join(' ').toLowerCase();
      return (category === 'all' || post.category === category) && (!q || haystack.includes(q));
    });

    if (grid) grid.innerHTML = filtered.map(cardHtml).join('');
    if (count) count.textContent = `총 ${filtered.length}건`;

    if (empty) {
      const noPublishedPosts = posts.length === 0;
      empty.innerHTML = noPublishedPosts
        ? '<strong>등록된 블로그 글이 없습니다.</strong>'
        : '<strong>검색 결과가 없습니다.</strong><br>다른 키워드나 카테고리를 선택해 주세요.';
      empty.classList.toggle('show', filtered.length === 0);
    }
  };

  tabs.forEach(btn => btn.addEventListener('click', () => {
    category = btn.dataset.category || 'all';
    syncTabs();
    updateCategoryUrl();
    render();
  }));
  search?.addEventListener('input', render);
  syncTabs();

  const loader = window.KBRIDGE_BLOG?.loadPosts;
  (loader ? loader() : Promise.resolve([]))
    .then(data => {
      posts = (Array.isArray(data) ? data : []).filter(post => post && post.published !== false && post.title && post.url);
      render();
    })
    .catch(error => {
      console.error(error);
      posts = [];
      render();
    });
})();
