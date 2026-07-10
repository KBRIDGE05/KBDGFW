(() => {
  'use strict';

  const cfg = window.KBRIDGE_CONFIG || {};
  const owner = String(cfg.blogRepositoryOwner || 'KBRIDGE05').trim();
  const repo = String(cfg.blogRepositoryName || 'KBDGFW').trim();
  const branch = String(cfg.blogRepositoryBranch || 'main').trim();
  const postsRoot = String(cfg.blogPostsRoot || 'blog/posts').replace(/^\/+|\/+$/g, '');
  const cacheMinutes = Math.max(0, Number(cfg.blogFeedCacheMinutes || 2));
  const cacheKey = `kbridgeBlogHtmlFeed:v2:${owner}/${repo}@${branch}`;
  const categories = ['info', 'service', 'news', 'insight', 'glossary'];
  const labels = {
    info: '물류 정보',
    service: '물류 서비스',
    news: '물류 뉴스',
    insight: '물류 인사이트',
    glossary: '물류 용어집'
  };

  const scriptUrl = document.currentScript?.src || new URL('assets/blog-feed.js', location.href).href;
  const siteRoot = new URL('../', scriptUrl);
  let memoryCache = null;

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

  const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
  const fileSlug = path => decodeURIComponent(path.split('/').pop().replace(/\.html?$/i, ''));

  const resolveResource = (value, pageUrl) => {
    const raw = String(value || '').trim();
    if (!raw) return new URL('assets/hero-port.webp', siteRoot).href;
    try { return new URL(raw, pageUrl).href; }
    catch (_) { return new URL('assets/hero-port.webp', siteRoot).href; }
  };

  const dateFromFilename = path => {
    const match = decodeURIComponent(path).match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  };

  const normalizeDate = value => {
    const raw = cleanText(value);
    if (!raw) return '';
    const direct = raw.match(/^(20\d{2})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
    if (direct) return `${direct[1]}-${String(direct[2]).padStart(2, '0')}-${String(direct[3]).padStart(2, '0')}`;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return raw.slice(0, 10);
  };

  const uploadDateCache = new Map();
  const uploadDateFromGithub = async path => {
    if (!owner || !repo || !branch || !path) return '';
    if (uploadDateCache.has(path)) return uploadDateCache.get(path);
    let value = '';
    try {
      const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}&per_page=1`;
      const response = await fetch(api, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
      if (response.ok) {
        const commits = await response.json();
        const commitDate = Array.isArray(commits) ? commits[0]?.commit?.committer?.date || commits[0]?.commit?.author?.date : '';
        value = normalizeDate(commitDate);
      }
    } catch (_) {}
    uploadDateCache.set(path, value);
    return value;
  };

  const parsePost = async path => {
    const relativePath = path.replace(/^blog\//, '');
    const pageUrl = new URL(relativePath, new URL('blog/', siteRoot)).href;
    const response = await fetch(`${pageUrl}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`포스팅 응답 오류 ${response.status}: ${path}`);
    const lastModifiedDate = normalizeDate(response.headers.get('last-modified') || '');
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const pathParts = path.split('/');
    const category = pathParts[pathParts.indexOf('posts') + 1] || 'info';
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
      doc.querySelector('main p, article p, .article-body p, p')?.textContent ||
      ''
    );

    const metaDate = normalizeDate(
      readMeta(doc, ['blog-date', 'article:published_time', 'date']) ||
      doc.querySelector('time[datetime]')?.getAttribute('datetime') ||
      dateFromFilename(path)
    );
    const date = metaDate || await uploadDateFromGithub(path) || lastModifiedDate;

    const thumbnailRaw = readMeta(doc, ['blog-thumbnail', 'og:image', 'twitter:image']);
    const keywordsRaw = readMeta(doc, ['keywords', 'blog-keywords']);

    return {
      slug: fileSlug(path),
      category: categories.includes(category) ? category : 'info',
      categoryLabel: labels[category] || labels.info,
      title,
      summary,
      date,
      thumbnail: resolveResource(thumbnailRaw, pageUrl),
      keywords: keywordsRaw ? keywordsRaw.split(',').map(v => v.trim()).filter(Boolean) : [],
      url: pageUrl,
      source: 'html-folder',
      published: true
    };
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

  const loadFolderPosts = async () => {
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const response = await fetch(apiUrl, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) throw new Error(`GitHub 폴더 목록 응답 오류 (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload.tree)) throw new Error('GitHub 폴더 목록 형식 오류');

    const prefix = `${postsRoot}/`;
    const paths = payload.tree
      .filter(item => item?.type === 'blob' && typeof item.path === 'string')
      .map(item => item.path)
      .filter(path => path.startsWith(prefix))
      .filter(path => /\.html?$/i.test(path))
      .filter(path => {
        const rest = path.slice(prefix.length);
        const parts = rest.split('/');
        return parts.length >= 2 && categories.includes(parts[0]) && !parts.at(-1).startsWith('_');
      });

    return mapLimit(paths, 8, parsePost);
  };

  const normalizeLegacyPost = post => {
    if (!post || post.published === false || !post.title) return null;
    const category = categories.includes(post.category) ? post.category : 'info';
    const url = post.url
      ? new URL(String(post.url).replace(/^\/+/, ''), siteRoot).href
      : new URL(`blog/post.html?slug=${encodeURIComponent(post.slug || '')}`, siteRoot).href;
    const thumb = post.thumbnail
      ? new URL(String(post.thumbnail).replace(/^\/+/, ''), siteRoot).href
      : new URL('assets/hero-port.webp', siteRoot).href;
    return {
      ...post,
      category,
      categoryLabel: labels[category],
      url,
      thumbnail: thumb,
      source: 'legacy-json'
    };
  };

  const loadLegacyPosts = async () => {
    const response = await fetch(new URL(`assets/blog-posts.json?v=${Date.now()}`, siteRoot), { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return (Array.isArray(data) ? data : []).map(normalizeLegacyPost).filter(Boolean);
  };

  const readSessionCache = () => {
    if (!cacheMinutes) return null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
      if (!saved || !Array.isArray(saved.posts) || !saved.savedAt) return null;
      if (Date.now() - saved.savedAt > cacheMinutes * 60_000) return null;
      return saved.posts;
    } catch (_) { return null; }
  };

  const writeSessionCache = posts => {
    if (!cacheMinutes) return;
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), posts })); }
    catch (_) {}
  };

  const sortPosts = posts => posts.sort((a, b) => {
    const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
    return dateCompare || String(a.title || '').localeCompare(String(b.title || ''), 'ko');
  });

  const mergePosts = (folderPosts, legacyPosts) => {
    const seen = new Set();
    return sortPosts([...folderPosts, ...legacyPosts].filter(post => {
      const key = post.url || `${post.category}:${post.slug}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }));
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

    let folderPosts = [];
    let legacyPosts = [];
    try { folderPosts = await loadFolderPosts(); }
    catch (error) { console.warn('[KBRIDGE BLOG] 폴더 자동 목록 불러오기 실패:', error); }
    try { legacyPosts = await loadLegacyPosts(); }
    catch (error) { console.warn('[KBRIDGE BLOG] 기존 목록 불러오기 실패:', error); }

    const posts = mergePosts(folderPosts, legacyPosts);
    memoryCache = posts;
    writeSessionCache(posts);
    return posts;
  };

  window.KBRIDGE_BLOG = Object.freeze({ loadPosts, labels, categories, siteRoot: siteRoot.href });
})();
