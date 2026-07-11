#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const categories = ['info', 'service', 'news', 'insight', 'glossary'];
const labels = {
  info: '물류 정보',
  service: '물류 서비스',
  news: '물류 뉴스',
  insight: '물류 인사이트',
  glossary: '물류 용어집'
};
const postsRoot = path.join(root, 'blog', 'posts');
const outputPath = path.join(root, 'assets', 'blog-posts.json');

const cleanText = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const decodeHtml = value => String(value || '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'");

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

const dateFromFilename = filePath => {
  const match = decodeURIComponent(filePath).match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
};

const gitDate = relativePath => {
  try {
    const value = execFileSync('git', ['log', '-1', '--format=%cI', '--', relativePath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return normalizeDate(value);
  } catch (_) {
    return '';
  }
};

const today = () => new Date().toISOString().slice(0, 10);

const meta = (html, names) => {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, 'i');
    const match = html.match(re);
    if (match) return decodeHtml(match[1] || match[2] || '').trim();
  }
  return '';
};

const tagText = (html, tag) => {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? cleanText(decodeHtml(match[1])) : '';
};

const firstParagraph = html => {
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return match ? cleanText(decodeHtml(match[1])) : '';
};

const normalizeAssetPath = (raw, fromFile) => {
  const value = String(raw || '').trim();
  if (!value) return 'assets/hero-port.webp';
  if (/^https?:\/\//i.test(value)) return value;
  const fromDir = path.posix.dirname(fromFile.split(path.sep).join('/'));
  const joined = value.startsWith('/')
    ? value.replace(/^\/+/, '')
    : path.posix.normalize(path.posix.join(fromDir, value));
  return joined.replace(/^\.\//, '').replace(/^\.\.\//g, '');
};

const walk = dir => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.html?$/i.test(entry.name) && !entry.name.startsWith('_') ? [full] : [];
  });
};

const parsePost = file => {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const parts = relative.split('/');
  const category = categories.includes(parts[2]) ? parts[2] : 'info';
  const slug = path.basename(file).replace(/\.html?$/i, '');
  const html = fs.readFileSync(file, 'utf8');
  const published = meta(html, ['blog-published', 'article:published']);
  if (/^(false|no|n|0|비공개)$/i.test(published)) return null;

  const title = cleanText(
    meta(html, ['blog-title', 'og:title', 'twitter:title']) ||
    tagText(html, 'title') ||
    tagText(html, 'h1') ||
    slug
  ).replace(/\s*[-|]\s*KBRIDGE.*$/i, '');

  const summary = cleanText(
    meta(html, ['blog-summary', 'description', 'og:description', 'twitter:description']) ||
    firstParagraph(html) ||
    ''
  );

  const date = normalizeDate(
    meta(html, ['blog-date', 'article:published_time', 'date']) ||
    dateFromFilename(relative) ||
    gitDate(relative) ||
    today()
  );

  const thumbnail = normalizeAssetPath(meta(html, ['blog-thumbnail', 'og:image', 'twitter:image']), relative);
  const keywordsRaw = meta(html, ['blog-keywords', 'keywords']);
  const keywords = keywordsRaw.split(',').map(cleanText).filter(Boolean);

  return {
    slug,
    category,
    categoryLabel: labels[category],
    title,
    summary,
    date,
    thumbnail,
    keywords,
    url: relative,
    published: true,
    source: 'generated-html'
  };
};

const posts = walk(postsRoot)
  .map(parsePost)
  .filter(Boolean)
  .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.title || '').localeCompare(String(b.title || ''), 'ko'));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
console.log(`Generated ${path.relative(root, outputPath)} with ${posts.length} posts.`);
