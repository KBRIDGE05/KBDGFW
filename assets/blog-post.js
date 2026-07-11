(() => {
  const menuBtn=document.getElementById('menuBtn');
  const mobileNav=document.getElementById('mobileNav');
  const closeMenu=()=>{mobileNav?.classList.remove('open');menuBtn?.setAttribute('aria-expanded','false')};
  menuBtn?.addEventListener('click',()=>{const open=mobileNav?.classList.toggle('open');menuBtn.setAttribute('aria-expanded',String(Boolean(open)))});
  mobileNav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
  const topBtn=document.getElementById('topBtn');
  const syncTop=()=>topBtn?.classList.toggle('show',window.scrollY>360);
  window.addEventListener('scroll',syncTop,{passive:true});syncTop();
  topBtn?.addEventListener('click',()=>{window.scrollTo({top:0,left:0,behavior:'auto'});document.documentElement.scrollTop=0;document.body.scrollTop=0});
})();

(() => {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || '';
  const titleEl = document.getElementById('articleTitle');
  const metaEl = document.getElementById('articleMeta');
  const leadEl = document.getElementById('articleLead');
  const heroEl = document.getElementById('articleImage');
  const bodyEl = document.getElementById('articleBody');
  const errorEl = document.getElementById('articleError');
  const labels = { info: '물류 정보', service: '물류 서비스', news: '물류 뉴스', insight: '물류 인사이트', glossary: '물류 용어집' };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  const safeUrl = value => {
    const url = String(value || '').trim();
    if (/^(https?:\/\/|mailto:|tel:|\/|\.\/|\.\.\/|#)/i.test(url)) return url;
    return '#';
  };

  const inline = text => esc(text)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `<img src="${esc(safeUrl(url))}" alt="${esc(alt)}" loading="lazy" decoding="async">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  function markdownToHtml(markdown) {
    const lines = String(markdown || '').replace(/\r/g, '').split('\n');
    const output = [];
    let paragraph = [];
    let listType = null;
    let listItems = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      output.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!listType) return;
      output.push(`<${listType}>${listItems.map(item => `<li>${inline(item)}</li>`).join('')}</${listType}>`);
      listType = null;
      listItems = [];
    };

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        flushList();
        return;
      }
      const heading = trimmed.match(/^(#{2,3})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        const level = heading[1].length;
        output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        return;
      }
      if (/^---+$/.test(trimmed)) {
        flushParagraph();
        flushList();
        output.push('<hr>');
        return;
      }
      const unordered = trimmed.match(/^[-*]\s+(.+)$/);
      const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
      if (unordered || ordered) {
        flushParagraph();
        const nextType = unordered ? 'ul' : 'ol';
        if (listType && listType !== nextType) flushList();
        listType = nextType;
        listItems.push((unordered || ordered)[1]);
        return;
      }
      const quote = trimmed.match(/^>\s?(.+)$/);
      if (quote) {
        flushParagraph();
        flushList();
        output.push(`<blockquote>${inline(quote[1])}</blockquote>`);
        return;
      }
      paragraph.push(trimmed);
    });
    flushParagraph();
    flushList();
    return output.join('');
  }

  const showError = message => {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    }
    if (bodyEl) bodyEl.hidden = true;
  };

  if (!slug) {
    showError('요청한 블로그 글을 찾을 수 없습니다.');
    return;
  }

  fetch('../assets/blog-posts.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('블로그 데이터를 불러오지 못했습니다.')))
    .then(posts => {
      const post = (Array.isArray(posts) ? posts : []).find(item =>
        item && item.slug === slug && item.published !== false
      );
      if (!post) throw new Error('요청한 블로그 글이 존재하지 않습니다.');

      document.title = `${post.title} - KBRIDGE`;
      titleEl.textContent = post.title;
      { const detailDate = post.date ? post.date.replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$1.$2.$3') : ''; const detailLabel = labels[post.category] || post.categoryLabel || '물류 정보'; metaEl.textContent = detailDate ? `${detailLabel} · ${detailDate}` : detailLabel; }
      leadEl.textContent = post.summary || '';

      if (post.thumbnail) {
        heroEl.src = /^https?:\/\//i.test(post.thumbnail) ? post.thumbnail : '../' + post.thumbnail.replace(/^\/+/, '');
        heroEl.alt = post.title;
        heroEl.loading = 'eager';
        heroEl.decoding = 'async';
        heroEl.fetchPriority = 'high';
        heroEl.closest('.article-cover')?.removeAttribute('hidden');
      }

      const contentPath = post.content || `blog/posts/${post.slug}.md`;
      return fetch(`../${contentPath.replace(/^\/+/, '')}`, { cache: 'no-cache' });
    })
    .then(r => r.ok ? r.text() : Promise.reject(new Error('본문 파일을 불러오지 못했습니다.')))
    .then(markdown => {
      bodyEl.innerHTML = markdownToHtml(markdown);
      bodyEl.querySelectorAll('img').forEach((img, index) => {
        img.loading = index === 0 ? 'eager' : 'lazy';
        img.decoding = 'async';
      });
      bodyEl.hidden = false;
      if (errorEl) errorEl.hidden = true;
    })
    .catch(error => {
      console.error(error);
      showError(error.message);
    });
})();
