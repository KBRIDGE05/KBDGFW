(() => {
  'use strict';

  const cfg = window.KBRIDGE_CONFIG || {};
  const owner = String(cfg.blogRepositoryOwner || 'KBRIDGE05').trim();
  const repo = String(cfg.blogRepositoryName || 'KBDGFW').trim();
  const branch = String(cfg.blogRepositoryBranch || 'main').trim();
  const postsRoot = String(cfg.blogPostsRoot || 'blog/posts').replace(/^\/+|\/+$/g, '');
  const cacheMinutes = Math.max(1, Number(cfg.blogFeedCacheMinutes || 30));
  const allowRuntimeScan = cfg.blogAllowRuntimeScan !== false;
  const scriptUrl = document.currentScript?.src || new URL('assets/blog-feed.js', location.href).href;
  const siteRoot = new URL('../', scriptUrl);
  const cacheKey = `kbridgeBlogManifest:v4:${owner}/${repo}@${branch}:${postsRoot}`;
  const categories = ['info', 'service', 'news', 'insight', 'glossary'];
  const labels = {
    info: '물류 정보',
    service: '물류 서비스',
    news: '물류 뉴스',
    insight: '물류 인사이트',
    glossary: '물류 용어집'
  };
  let memoryCache = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
  const fileSlug = path => decodeURIComponent(String(path || '').split('/').pop().replace(/\.html?$/i, ''));
  const uniq = values => [...new Set(values.filter(Boolean))];

  const normalizeDate = value => {
    const raw = cleanText(value);
    if (!raw) return '';
    const direct = raw.match(/^(20\d{2})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/);
    if (direct) return `${direct[1]}-${String(direct[2]).padStart(2, '0')}-${String(direct[3]).padStart(2, '0')}`;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }
    return raw.slice(0, 10);
  };

  const dateFromFilename = path => {
    const match = decodeURIComponent(String(path || '')).match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  };

  const normalizePath = value => String(value || '').trim().replace(/^\/+/, '');
  const absoluteUrl = (value, fallback = 'assets/hero-port.webp') => {
    const raw = normalizePath(value || fallback);
    try { return new URL(raw, siteRoot).href; }
    catch (_) { return new URL(fallback, siteRoot).href; }
  };

  const readMeta = (doc, names) => {
    for (const name of names) {
      const selector = name.includes(':')
        ? `meta[property="${name}"],meta[name="${name}"]`
        : `meta[name="${name}"],meta[property="${name}"]`;
      const value = doc.querySelector(selector)?.getAttribute('content')?.trim();
      if (value) return value;
    }
    return '';
  };

  const normalizePost = post => {
    if (!post || post.published === false || !post.title) return null;
    const category = categories.includes(post.category) ? post.category : 'info';
    const slug = post.slug || fileSlug(post.url || post.content || post.title);
    const url = post.url
      ? absoluteUrl(post.url)
      : absoluteUrl(`blog/posts/${category}/${slug}.html`);
    const thumbnail = post.thumbnail ? absoluteUrl(post.thumbnail) : absoluteUrl('assets/hero-port.webp');
    const date = normalizeDate(post.date || post.publishedAt || post.createdAt || post.updatedAt || dateFromFilename(post.url || slug));
    const keywords = Array.isArray(post.keywords)
      ? post.keywords.map(cleanText).filter(Boolean)
      : String(post.keywords || '').split(',').map(cleanText).filter(Boolean);
    return {
      slug,
      category,
      categoryLabel: labels[category],
      title: cleanText(post.title),
      summary: cleanText(post.summary || post.description || ''),
      date,
      thumbnail,
      keywords,
      url,
      content: post.content || '',
      published: true,
      source: post.source || 'manifest'
    };
  };

  const sortPosts = posts => posts.sort((a, b) => {
    const byDate = String(b.date || '').localeCompare(String(a.date || ''));
    return byDate || String(a.title || '').localeCompare(String(b.title || ''), 'ko');
  });

  const readSessionCache = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
      if (!saved || !Array.isArray(saved.posts) || !saved.savedAt) return null;
      if (Date.now() - saved.savedAt > cacheMinutes * 60_000) return null;
      return saved.posts;
    } catch (_) { return null; }
  };

  const writeSessionCache = posts => {
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), posts })); }
    catch (_) {}
  };

  const loadManifestPosts = async () => {
    const response = await fetch(new URL('assets/blog-posts.json', siteRoot), { cache: 'no-cache' });
    if (!response.ok) return [];
    const payload = await response.json();
    const rawPosts = Array.isArray(payload) ? payload : (Array.isArray(payload.posts) ? payload.posts : []);
    return sortPosts(rawPosts.map(normalizePost).filter(Boolean));
  };

  const parseHtmlPost = async path => {
    const relativePath = path.replace(/^blog\//, '');
    const pageUrl = new URL(relativePath, new URL('blog/', siteRoot)).href;
    const response = await fetch(pageUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`포스팅 응답 오류 ${response.status}: ${path}`);
    const lastModifiedDate = normalizeDate(response.headers.get('last-modified') || '');
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const parts = path.split('/');
    const category = parts[parts.indexOf('posts') + 1] || 'info';
    const publishedValue = readMeta(doc, ['blog-published', 'article:published']);
    if (/^(false|no|n|0|비공개)$/i.test(publishedValue)) return null;
    const title = cleanText(
      readMeta(doc, ['blog-title', 'og:title', 'twitter:title']) ||
      doc.querySelector('title')?.textContent ||
      doc.querySelector('h1')?.textContent ||
      fileSlug(path)
    ).replace(/\s*[-|]\s*KBRIDGE.*$/i, '');
    const summary = cleanText(
      readMeta(doc, ['blog-summary', 'description', 'og:description', 'twitter:description']) ||
      doc.querySelector('main p, article p, .article-body p, p')?.textContent || ''
    );
    const date = normalizeDate(
      readMeta(doc, ['blog-date', 'article:published_time', 'date']) ||
      doc.querySelector('time[datetime]')?.getAttribute('datetime') ||
      dateFromFilename(path) ||
      lastModifiedDate
    );
    const thumbnailRaw = readMeta(doc, ['blog-thumbnail', 'og:image', 'twitter:image']);
    const keywordsRaw = readMeta(doc, ['keywords', 'blog-keywords']);
    return normalizePost({
      slug: fileSlug(path),
      category,
      title,
      summary,
      date,
      thumbnail: thumbnailRaw ? new URL(thumbnailRaw, pageUrl).href : 'assets/hero-port.webp',
      keywords: keywordsRaw,
      url: pageUrl,
      source: 'runtime-scan'
    });
  };

  const mapLimit = async (items, limit, mapper) => {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try { results[index] = await mapper(items[index], index); }
        catch (error) {
          console.warn('[KBRIDGE BLOG] HTML 포스팅 분석 제외:', items[index], error);
          results[index] = null;
        }
      }
    });
    await Promise.all(workers);
    return results.filter(Boolean);
  };

  const loadRuntimePosts = async () => {
    if (!allowRuntimeScan || !owner || !repo || !branch) return [];
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const response = await fetch(apiUrl, { cache: 'no-cache', headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(`GitHub 폴더 목록 응답 오류 (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload.tree)) return [];
    const prefix = `${postsRoot}/`;
    const paths = payload.tree
      .filter(item => item?.type === 'blob' && typeof item.path === 'string')
      .map(item => item.path)
      .filter(path => path.startsWith(prefix) && /\.html?$/i.test(path))
      .filter(path => {
        const parts = path.slice(prefix.length).split('/');
        return parts.length >= 2 && categories.includes(parts[0]) && !parts.at(-1).startsWith('_');
      });
    return sortPosts(await mapLimit(paths, 6, parseHtmlPost));
  };

  const loadPosts = async ({ force = false } = {}) => {
    if (!force && memoryCache) return memoryCache;
    if (!force) {
      const saved = readSessionCache();
      if (saved) {
        memoryCache = saved;
        return saved;
      }
    }

    let posts = [];
    try { posts = await loadManifestPosts(); }
    catch (error) { console.warn('[KBRIDGE BLOG] 정적 목록 불러오기 실패:', error); }

    if (!posts.length) {
      try { posts = await loadRuntimePosts(); }
      catch (error) { console.warn('[KBRIDGE BLOG] 런타임 폴더 스캔 실패:', error); }
    }

    memoryCache = sortPosts(uniq(posts.map(post => post.url)).map(url => posts.find(post => post.url === url)).filter(Boolean));
    writeSessionCache(memoryCache);
    return memoryCache;
  };

  const prefetched = new Set();
  const prefetch = href => {
    if (!href || prefetched.has(href)) return;
    prefetched.add(href);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    document.head.appendChild(link);
  };

  window.KBRIDGE_BLOG = Object.freeze({
    loadPosts,
    labels,
    categories,
    siteRoot: siteRoot.href,
    prefetch
  });
})();
