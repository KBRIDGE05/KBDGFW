#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const ROOT = process.cwd();
export const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://www.kbexpress.kr').replace(/\/+$/, '');
export const POSTS_ROOT = path.join(ROOT, 'blog', 'posts');

const CATEGORY_LABELS = {
  info: '물류 정보',
  service: '물류 서비스',
  news: '물류 뉴스',
  insight: '물류 인사이트',
  glossary: '물류 용어집'
};

const namedEntities = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '
};

export function decodeHtml(value = '') {
  return String(value).replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
    const lower = entity.toLowerCase();
    if (namedEntities[lower] !== undefined) return namedEntities[lower];
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return _;
  });
}

export function stripTags(value = '') {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

export function cleanText(value = '') {
  return decodeHtml(stripTags(value)).replace(/\s+/g, ' ').trim();
}

function parseAttributes(tag = '') {
  const attrs = {};
  const re = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = re.exec(tag))) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '').trim();
  }
  return attrs;
}

export function getMeta(html, names) {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = parseAttributes(tag);
    const key = (attrs.name || attrs.property || attrs.itemprop || '').toLowerCase();
    if (wanted.has(key) && attrs.content) return attrs.content;
  }
  return '';
}

export function getCanonical(html) {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const attrs = parseAttributes(tag);
    const rels = String(attrs.rel || '').toLowerCase().split(/\s+/);
    if (rels.includes('canonical') && attrs.href) return attrs.href;
  }
  return '';
}

export function getTagText(html, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? cleanText(match[1]) : '';
}

function getTimeDate(html) {
  for (const tag of html.match(/<time\b[^>]*>/gi) || []) {
    const attrs = parseAttributes(tag);
    if (attrs.datetime) return attrs.datetime;
  }
  return '';
}

function readJsonLd(html) {
  const values = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== 'object') continue;
        values.push(item);
        if (Array.isArray(item['@graph'])) queue.push(...item['@graph']);
      }
    } catch {
      // 잘못된 JSON-LD 한 블록 때문에 전체 자동화를 중단하지 않습니다.
    }
  }
  return values;
}

function jsonLdValue(html, keys) {
  const wanted = new Set(keys);
  for (const item of readJsonLd(html)) {
    for (const key of wanted) {
      const value = item[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim();
      if (value && typeof value === 'object' && typeof value.url === 'string') return value.url.trim();
    }
  }
  return '';
}

export function normalizeDate(value = '') {
  const raw = cleanText(value);
  if (!raw) return '';
  const direct = raw.match(/(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  if (direct) return `${direct[1]}-${String(direct[2]).padStart(2, '0')}-${String(direct[3]).padStart(2, '0')}`;
  const compact = raw.match(/^(20\d{2})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function gitDate(relativePath) {
  try {
    const value = execFileSync('git', ['log', '-1', '--format=%cI', '--', relativePath], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return normalizeDate(value);
  } catch {
    return '';
  }
}

function fileDate(filePath) {
  try {
    return new Date(fs.statSync(filePath).mtimeMs).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function dateFromFilename(relativePath) {
  const match = decodeURIComponent(relativePath).match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function absoluteUrl(raw, pageUrl) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(?:data:|mailto:|tel:|javascript:|#)/i.test(value)) return value;
  try {
    return new URL(value, pageUrl).href;
  } catch {
    return value;
  }
}

function extractArticleHtml(html, pageUrl) {
  const source =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ||
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ||
    '';

  return source
    .replace(/<(script|style|nav|footer|header|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/\s(?:href|src|poster)=("([^"]*)"|'([^']*)')/gi, (full, quoted, doubleValue, singleValue) => {
      const attr = full.match(/^\s(href|src|poster)=/i)?.[1] || 'href';
      const absolute = absoluteUrl(doubleValue ?? singleValue ?? '', pageUrl);
      return ` ${attr}="${absolute.replace(/"/g, '&quot;')}"`;
    })
    .trim();
}

function firstParagraph(html) {
  const paragraph = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '';
  return cleanText(paragraph);
}

function inferCategory(relativePath) {
  const category = relativePath.split('/')[2] || 'info';
  return CATEGORY_LABELS[category] ? category : 'info';
}

function isPublished(html) {
  const robots = getMeta(html, ['robots', 'googlebot', 'yeti']).toLowerCase();
  if (/(?:^|,)\s*noindex\b/.test(robots)) return false;
  const published = getMeta(html, ['blog-published', 'article:published']);
  return !/^(?:false|no|n|0|비공개)$/i.test(published.trim());
}

export function walkHtml(dir = POSTS_ROOT) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkHtml(fullPath);
    return /\.html?$/i.test(entry.name) && !entry.name.startsWith('_') ? [fullPath] : [];
  });
}

export function parsePost(filePath) {
  const relativePath = path.relative(ROOT, filePath).split(path.sep).join('/');
  const html = fs.readFileSync(filePath, 'utf8');
  if (!isPublished(html)) return null;

  const category = inferCategory(relativePath);
  const computedUrl = `${SITE_ORIGIN}/${relativePath}`;
  const canonicalRaw = getCanonical(html) || getMeta(html, ['og:url']) || computedUrl;
  const canonical = absoluteUrl(canonicalRaw, computedUrl);
  const title = cleanText(
    getMeta(html, ['blog-title', 'og:title', 'twitter:title']) ||
    jsonLdValue(html, ['headline', 'name']) ||
    getTagText(html, 'h1') ||
    getTagText(html, 'title') ||
    path.basename(filePath, path.extname(filePath))
  ).replace(/\s*[-|]\s*KBRIDGE.*$/i, '');

  const description = cleanText(
    getMeta(html, ['blog-summary', 'description', 'og:description', 'twitter:description']) ||
    jsonLdValue(html, ['description']) ||
    firstParagraph(html)
  );

  const publishedDate = normalizeDate(
    getMeta(html, ['blog-date', 'article:published_time', 'date', 'datepublished']) ||
    jsonLdValue(html, ['datePublished']) ||
    getTimeDate(html) ||
    dateFromFilename(relativePath) ||
    gitDate(relativePath) ||
    fileDate(filePath)
  );

  const modifiedDate = normalizeDate(
    getMeta(html, ['blog-modified', 'article:modified_time', 'last-modified', 'datemodified']) ||
    jsonLdValue(html, ['dateModified']) ||
    gitDate(relativePath) ||
    publishedDate ||
    fileDate(filePath)
  );

  const imageRaw =
    getMeta(html, ['blog-thumbnail', 'og:image', 'twitter:image']) ||
    jsonLdValue(html, ['image', 'thumbnailUrl']);
  const image = absoluteUrl(imageRaw, computedUrl);

  return {
    relativePath,
    url: canonical.startsWith(SITE_ORIGIN) ? canonical : computedUrl,
    title,
    description,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    publishedDate: publishedDate || modifiedDate,
    modifiedDate: modifiedDate || publishedDate,
    image,
    articleHtml: extractArticleHtml(html, computedUrl)
  };
}

export function getPosts() {
  return walkHtml()
    .map(parsePost)
    .filter(Boolean)
    .sort((a, b) => {
      const dateOrder = String(b.publishedDate || b.modifiedDate).localeCompare(String(a.publishedDate || a.modifiedDate));
      return dateOrder || a.title.localeCompare(b.title, 'ko');
    });
}

export function xmlEscape(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function cdata(value = '') {
  return `<![CDATA[${String(value).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

export function toRfc822(dateString) {
  const normalized = normalizeDate(dateString);
  const date = normalized ? new Date(`${normalized}T09:00:00+09:00`) : new Date();
  return date.toUTCString();
}
