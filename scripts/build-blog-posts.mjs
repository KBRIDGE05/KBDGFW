#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const SITE_URL = 'https://www.kbexpress.kr';
const SITE_HOST = 'www.kbexpress.kr';
const INDEXNOW_KEY = '736f09a19bf4a21e9a05a8bfe60a60c4';
const INDEXNOW_ENDPOINT = 'https://searchadvisor.naver.com/indexnow';
const RSS_LIMIT = 50;

const categories = ['info', 'service', 'news', 'insight', 'glossary'];
const labels = {
  info: '물류 정보',
  service: '물류 서비스',
  news: '물류 뉴스',
  insight: '물류 인사이트',
  glossary: '물류 용어집'
};

const postsRoot = path.join(root, 'blog', 'posts');
const manifestPath = path.join(root, 'assets', 'blog-posts.json');
const sitemapPath = path.join(root, 'sitemap.xml');
const rssPath = path.join(root, 'rss.xml');
const blogIndexPath = path.join(root, 'blog', 'index.html');

const normalizeSlashes = value => String(value || '').split(path.sep).join('/');
const decodeHtml = value => String(value || '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

const stripTags = value => decodeHtml(String(value || ''))
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const xmlEscape = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const htmlEscape = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const cdata = value => String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>');
const todayKst = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const normalizeDate = value => {
  const raw = stripTags(value);
  if (!raw) return '';
  const direct = raw.match(/(20\d{2})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/);
  if (direct) return `${direct[1]}-${String(direct[2]).padStart(2, '0')}-${String(direct[3]).padStart(2, '0')}`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw.slice(0, 10);
};

const dateFromFilename = value => {
  const match = decodeURIComponent(String(value || '')).match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
};

const gitDate = (relativePath, format = '%cI') => {
  try {
    return execFileSync('git', ['log', '-1', `--format=${format}`, '--', relativePath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
};

const walk = dir => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!/\.html?$/i.test(entry.name) || entry.name.startsWith('_')) return [];
    return [full];
  });
};

const parseAttributes = tag => {
  const attrs = {};
  const attrRe = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = attrRe.exec(tag))) {
    attrs[String(match[1] || '').toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '').trim();
  }
  return attrs;
};

const allMeta = html => {
  const result = new Map();
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    const key = String(attrs.name || attrs.property || '').toLowerCase();
    if (key && attrs.content && !result.has(key)) result.set(key, attrs.content);
  }
  return result;
};

const metaValue = (meta, names) => {
  for (const name of names) {
    const value = meta.get(String(name).toLowerCase());
    if (value) return value;
  }
  return '';
};

const tagText = (html, tag) => {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? stripTags(match[1]) : '';
};

const containerHtml = html => {
  for (const tag of ['article', 'main']) {
    const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (match) return match[1];
  }
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return body ? body[1] : html;
};

const cleanArticleHtml = html => String(html || '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<(script|style|noscript|svg|nav|header|footer|form)\b[\s\S]*?<\/\1>/gi, '')
  .replace(/\s(on\w+|nonce|integrity)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
  .trim();

const firstParagraph = html => {
  const match = containerHtml(html).match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  return match ? stripTags(match[1]) : '';
};

const parseJsonLd = html => {
  const candidates = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  const flatten = value => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(flatten);
    if (typeof value !== 'object') return;
    candidates.push(value);
    if (Array.isArray(value['@graph'])) value['@graph'].forEach(flatten);
  };
  while ((match = re.exec(html))) {
    try { flatten(JSON.parse(decodeHtml(match[1]).trim())); } catch { /* malformed JSON-LD is ignored */ }
  }
  return candidates.find(item => {
    const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
    return types.some(type => /^(BlogPosting|Article|NewsArticle)$/i.test(String(type || '')));
  }) || candidates[0] || {};
};

const jsonLdImage = value => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return jsonLdImage(value[0]);
  if (typeof value === 'object') return value.url || value.contentUrl || '';
  return '';
};

const firstContentImage = html => {
  const content = containerHtml(html);
  const tags = content.match(/<img\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    const src = attrs.src || attrs['data-src'] || attrs['data-lazy-src'];
    if (!src || /^data:/i.test(src)) continue;
    const text = `${src} ${attrs.alt || ''}`.toLowerCase();
    if (/logo|icon|favicon|avatar/.test(text)) continue;
    return src;
  }
  return '';
};

const absoluteUrl = (value, pageUrl = `${SITE_URL}/`) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^data:|^javascript:/i.test(raw)) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  try { return new URL(raw, pageUrl).href; } catch { return ''; }
};

const absolutizeArticleLinks = (html, pageUrl) => cleanArticleHtml(html).replace(
  /\b(href|src|poster)\s*=\s*(["'])(.*?)\2/gi,
  (full, attr, quote, value) => {
    const absolute = absoluteUrl(value, pageUrl);
    return absolute ? `${attr}=${quote}${absolute}${quote}` : full;
  }
);

const isPublished = (html, meta) => {
  const published = metaValue(meta, ['blog-published', 'article:published']);
  if (/^(false|no|n|0|비공개|draft)$/i.test(published)) return false;
  const robots = metaValue(meta, ['robots', 'naverbot', 'yeti']);
  return !/(^|[,\s])noindex([,\s]|$)/i.test(robots);
};

const parsePost = file => {
  const relative = normalizeSlashes(path.relative(root, file));
  const parts = relative.split('/');
  const detectedCategory = parts[0] === 'blog' && parts[1] === 'posts' ? parts[2] : '';
  if (!categories.includes(detectedCategory)) return null;

  const category = detectedCategory;
  const slug = path.basename(file).replace(/\.html?$/i, '');
  const html = fs.readFileSync(file, 'utf8');
  const meta = allMeta(html);
  if (!isPublished(html, meta)) return null;

  const jsonLd = parseJsonLd(html);
  const url = `${SITE_URL}/${relative}`;
  // The visible article H1 is the single source of truth for card/list titles.
  // This makes a title edit propagate automatically to the home page, blog page, sitemap and RSS.
  const title = stripTags(
    tagText(html, 'h1') ||
    metaValue(meta, ['kbridge:title', 'blog-title', 'og:title', 'twitter:title']) ||
    jsonLd.headline || jsonLd.name ||
    tagText(html, 'title') || slug
  ).replace(/\s*[-|]\s*KBRIDGE.*$/i, '').trim();

  const summary = stripTags(
    metaValue(meta, ['blog-summary', 'description', 'og:description', 'twitter:description']) ||
    jsonLd.description || firstParagraph(html)
  );

  const date = normalizeDate(
    metaValue(meta, ['blog-date', 'article:published_time', 'date']) ||
    jsonLd.datePublished || dateFromFilename(relative) ||
    gitDate(relative, '%aI') || todayKst()
  );

  const modified = normalizeDate(
    metaValue(meta, ['article:modified_time', 'last-modified']) ||
    jsonLd.dateModified || gitDate(relative, '%cI') || date
  ) || date;

  const thumbnailRaw =
    metaValue(meta, ['blog-thumbnail', 'og:image', 'twitter:image']) ||
    jsonLdImage(jsonLd.image) || firstContentImage(html) || '/assets/hero-port.webp';
  const thumbnail = absoluteUrl(thumbnailRaw, url) || `${SITE_URL}/assets/hero-port.webp`;

  const keywordsRaw = metaValue(meta, ['blog-keywords', 'keywords']);
  const keywords = keywordsRaw.split(',').map(stripTags).filter(Boolean);
  const articleHtml = absolutizeArticleLinks(containerHtml(html), url);

  const warnings = [];
  if (!metaValue(meta, ['description', 'og:description', 'blog-summary'])) warnings.push('description 메타태그 없음');
  if (!metaValue(meta, ['og:image', 'blog-thumbnail', 'twitter:image']) && !jsonLdImage(jsonLd.image)) warnings.push('대표 이미지 메타태그 없음');
  if (!html.match(/<link\b[^>]*rel=["']canonical["']/i)) warnings.push('canonical 링크 없음');
  if (!tagText(html, 'h1')) warnings.push('h1 제목 없음');

  return {
    slug,
    category,
    categoryLabel: labels[category],
    title,
    summary,
    date,
    modified,
    thumbnail,
    keywords,
    url,
    content: articleHtml,
    published: true,
    source: 'generated-html',
    relativePath: relative,
    warnings
  };
};

const readPosts = () => walk(postsRoot)
  .map(parsePost)
  .filter(Boolean)
  .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.title || '').localeCompare(String(b.title || ''), 'ko'));

const writeManifest = posts => {
  const payload = posts.map(({ content, relativePath, warnings, modified, ...post }) => ({ ...post, modified }));
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const formatCardDate = value => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : String(value || '');
};

const staticPostCard = (post, index) => {
  const label = post.categoryLabel || labels[post.category] || labels.info;
  const date = formatCardDate(post.date);
  const meta = date
    ? `<span>${htmlEscape(label)}</span><span>${htmlEscape(date)}</span>`
    : `<span>${htmlEscape(label)}</span>`;
  return `<!-- KBRIDGE_STATIC_POST ${htmlEscape(post.relativePath)} -->
<article class="post-card" data-category="${htmlEscape(post.category)}" data-search="${htmlEscape([label, post.title, post.summary, ...(post.keywords || [])].join(' '))}">
  <a class="post-thumb" href="${htmlEscape(post.url)}">
    <img src="${htmlEscape(post.thumbnail)}" alt="${htmlEscape(post.title)}" width="1000" height="1000" loading="${index < 2 ? 'eager' : 'lazy'}" decoding="async"${index === 0 ? ' fetchpriority="high"' : ''}>
  </a>
  <div class="post-body">
    <div class="post-meta">${meta}</div>
    <h2>${htmlEscape(post.title)}</h2>
    <p>${htmlEscape(post.summary || '')}</p>
    <a class="post-link" href="${htmlEscape(post.url)}">자세히 보기 →</a>
  </div>
</article>`;
};

const writeBlogIndex = posts => {
  if (!fs.existsSync(blogIndexPath)) return;
  let html = fs.readFileSync(blogIndexPath, 'utf8');
  const cards = posts.map(staticPostCard).join('');
  const marked = `<!-- KBRIDGE_STATIC_POSTS_START -->${cards}<!-- KBRIDGE_STATIC_POSTS_END -->`;

  if (/<!-- KBRIDGE_STATIC_POSTS_START -->[\s\S]*?<!-- KBRIDGE_STATIC_POSTS_END -->/i.test(html)) {
    html = html.replace(/<!-- KBRIDGE_STATIC_POSTS_START -->[\s\S]*?<!-- KBRIDGE_STATIC_POSTS_END -->/i, marked);
  } else {
    html = html.replace(
      /(<div\b[^>]*class=["']blog-grid["'][^>]*id=["']blogGrid["'][^>]*>)[\s\S]*?(<\/div>\s*<div\b[^>]*id=["']emptyState["'])/i,
      `$1${marked}$2`
    );
  }

  html = html.replace(/(<p\b[^>]*id=["']resultCount["'][^>]*>)[\s\S]*?(<\/p>)/i, `$1총 ${posts.length}건$2`);
  html = html.replace(
    /<div\b([^>]*id=["']emptyState["'][^>]*)>[\s\S]*?<\/div>/i,
    (_full, attrs) => `<div${String(attrs).replace(/\sclass=["'][^"']*["']/i, '').trimEnd()} class="empty"><strong>검색 결과가 없습니다.</strong><br>다른 키워드나 카테고리를 선택해 주세요.</div>`
  );
  fs.writeFileSync(blogIndexPath, html.replace(/\r\n/g, '\n'), 'utf8');
};

const existingSitemapBlocks = () => {
  if (!fs.existsSync(sitemapPath)) return [];
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  return (xml.match(/<url>\s*[\s\S]*?<\/url>/gi) || []).map(block => {
    const loc = decodeHtml(block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1] || '').trim();
    return { loc, block };
  }).filter(item => item.loc && !item.loc.includes('/blog/posts/'));
};

const fallbackStaticUrls = () => {
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^(index|[a-z0-9-]+)\.html$/i.test(entry.name))
    .map(entry => entry.name === 'index.html' ? `${SITE_URL}/` : `${SITE_URL}/${entry.name}`);
  files.push(`${SITE_URL}/blog/`);
  return [...new Set(files)].map(loc => ({
    loc,
    block: `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${todayKst()}</lastmod>\n    <changefreq>${loc.endsWith('/blog/') || loc === `${SITE_URL}/` ? 'weekly' : 'monthly'}</changefreq>\n    <priority>${loc === `${SITE_URL}/` ? '1.0' : loc.endsWith('/blog/') ? '0.9' : '0.8'}</priority>\n  </url>`
  }));
};

const replaceLastmod = (block, date) => {
  if (!date) return block;
  if (/<lastmod>[\s\S]*?<\/lastmod>/i.test(block)) return block.replace(/<lastmod>[\s\S]*?<\/lastmod>/i, `<lastmod>${date}</lastmod>`);
  return block.replace(/<loc>[\s\S]*?<\/loc>/i, match => `${match}\n    <lastmod>${date}</lastmod>`);
};

const writeSitemap = posts => {
  const latestDate = posts[0]?.modified || posts[0]?.date || todayKst();
  const source = existingSitemapBlocks();
  const staticBlocks = (source.length ? source : fallbackStaticUrls())
    .map(item => item.loc === `${SITE_URL}/blog/` ? replaceLastmod(item.block, latestDate) : item.block)
    .map(block => block.replace(/^\s*/, '  '));

  const postBlocks = posts.map(post => `  <url>\n    <loc>${xmlEscape(post.url)}</loc>\n    <lastmod>${xmlEscape(post.modified || post.date)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`);

  const seen = new Set();
  const blocks = [...staticBlocks, ...postBlocks].filter(block => {
    const loc = decodeHtml(block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1] || '').trim();
    if (!loc || seen.has(loc)) return false;
    seen.add(loc);
    return true;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${blocks.join('\n')}\n</urlset>\n`;
  fs.writeFileSync(sitemapPath, xml, 'utf8');
};

const toRssDate = date => {
  const parsed = new Date(`${normalizeDate(date) || todayKst()}T09:00:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? new Date().toUTCString() : parsed.toUTCString();
};

const writeRss = posts => {
  const items = posts.slice(0, RSS_LIMIT).map(post => `    <item>\n      <title><![CDATA[${cdata(post.title)}]]></title>\n      <link>${xmlEscape(post.url)}</link>\n      <guid isPermaLink="true">${xmlEscape(post.url)}</guid>\n      <pubDate>${xmlEscape(toRssDate(post.date))}</pubDate>\n      <category><![CDATA[${cdata(post.categoryLabel)}]]></category>\n      <description><![CDATA[${cdata(post.content || `<p>${xmlEscape(post.summary)}</p>`) }]]></description>\n      <enclosure url="${xmlEscape(post.thumbnail)}" type="image/webp" />\n    </item>`).join('\n\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>KBRIDGE 케이브릿지 물류 블로그</title>\n    <link>${SITE_URL}/blog/</link>\n    <description>수출입, 해상·항공운송, 통관, 물류 서비스와 공급망 인사이트를 제공하는 케이브릿지 공식 블로그입니다.</description>\n    <language>ko-KR</language>\n    <copyright>© 2026 KBRIDGE CO., LTD.</copyright>\n    <generator>KBRIDGE Blog SEO Automation</generator>\n    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />\n    <lastBuildDate>${xmlEscape(toRssDate(posts[0]?.modified || posts[0]?.date || todayKst()))}</lastBuildDate>\n    <ttl>60</ttl>\n${items ? `\n${items}\n` : ''}  </channel>\n</rss>\n`;
  fs.writeFileSync(rssPath, xml, 'utf8');
};

const ensureKeyFile = () => {
  const keyPath = path.join(root, `${INDEXNOW_KEY}.txt`);
  fs.writeFileSync(keyPath, `${INDEXNOW_KEY}\n`, 'utf8');
};

const urlsFromPaths = paths => [...new Set(paths
  .map(normalizeSlashes)
  .filter(value => /^blog\/posts\/(info|service|news|insight|glossary)\/.+\.html?$/i.test(value))
  .map(value => `${SITE_URL}/${value.replace(/^\/+/, '')}`))];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const notifyIndexNow = async urls => {
  urls = [...new Set([...urls, `${SITE_URL}/blog/`])];
  if (!urls.length) {
    console.log('IndexNow: 전송할 변경 URL이 없습니다.');
    return;
  }
  const body = {
    host: SITE_HOST,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls.slice(0, 10000)
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body)
      });
      const text = await response.text();
      if (response.ok) {
        console.log(`IndexNow: ${urls.length}개 URL 전송 완료 (HTTP ${response.status}).`);
        return;
      }
      console.warn(`IndexNow 시도 ${attempt}/3 실패: HTTP ${response.status} ${text}`);
    } catch (error) {
      console.warn(`IndexNow 시도 ${attempt}/3 오류: ${error.message}`);
    }
    if (attempt < 3) await sleep(attempt * 5000);
  }
  console.log('::warning::IndexNow 전송은 실패했지만 사이트맵·RSS 생성은 정상 완료되었습니다. 다음 게시 시 자동 재시도됩니다.');
};

const validateOutput = posts => {
  const urls = posts.map(post => post.url);
  if (new Set(urls).size !== urls.length) throw new Error('중복된 블로그 URL이 발견되었습니다.');
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const rss = fs.readFileSync(rssPath, 'utf8');
  const blogIndex = fs.existsSync(blogIndexPath) ? fs.readFileSync(blogIndexPath, 'utf8') : '';
  for (const post of posts) {
    if (!sitemap.includes(xmlEscape(post.url))) throw new Error(`사이트맵 누락: ${post.url}`);
    if (!rss.includes(xmlEscape(post.url))) throw new Error(`RSS 누락: ${post.url}`);
    if (blogIndex && !blogIndex.includes(post.url)) throw new Error(`블로그 정적 목록 누락: ${post.url}`);
  }
  if (!sitemap.startsWith('<?xml') || !rss.startsWith('<?xml')) throw new Error('XML 파일 헤더가 올바르지 않습니다.');
};

const printReport = posts => {
  const counts = Object.fromEntries(categories.map(category => [category, posts.filter(post => post.category === category).length]));
  console.log(`블로그 SEO 파일 생성 완료: 총 ${posts.length}건`);
  for (const category of categories) console.log(`- ${labels[category]}: ${counts[category]}건`);
  for (const post of posts) {
    if (post.warnings.length) console.log(`::warning file=${post.relativePath}::${post.warnings.join(', ')}`);
  }
};

const args = process.argv.slice(2);
if (args.includes('--notify-all')) {
  const posts = readPosts();
  await notifyIndexNow(posts.map(post => post.url));
} else if (args.includes('--notify')) {
  const index = args.indexOf('--notify');
  await notifyIndexNow(urlsFromPaths(args.slice(index + 1)));
} else {
  const posts = readPosts();
  writeManifest(posts);
  writeBlogIndex(posts);
  writeSitemap(posts);
  writeRss(posts);
  ensureKeyFile();
  validateOutput(posts);
  printReport(posts);
}
