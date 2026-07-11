#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE_ORIGIN, getPosts, normalizeDate, xmlEscape } from './blog-post-utils.mjs';

const sitemapPath = path.join(ROOT, 'sitemap.xml');
const posts = getPosts();

function parseExistingEntries(xml) {
  const entries = [];
  const re = /<url>\s*([\s\S]*?)\s*<\/url>/gi;
  let match;
  while ((match = re.exec(xml))) {
    const block = match[1];
    const value = tag => block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.trim() || '';
    const loc = value('loc');
    if (!loc || loc.includes('/blog/posts/')) continue;
    entries.push({
      loc,
      lastmod: normalizeDate(value('lastmod')),
      changefreq: value('changefreq'),
      priority: value('priority')
    });
  }
  return entries;
}

const existingXml = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, 'utf8') : '';
const entries = parseExistingEntries(existingXml);

if (!entries.some(entry => entry.loc === `${SITE_ORIGIN}/`)) {
  entries.unshift({ loc: `${SITE_ORIGIN}/`, changefreq: 'weekly', priority: '1.0' });
}
if (!entries.some(entry => entry.loc === `${SITE_ORIGIN}/blog/`)) {
  entries.push({ loc: `${SITE_ORIGIN}/blog/`, changefreq: 'weekly', priority: '0.9' });
}

const latestPostDate = posts.reduce((latest, post) => {
  const date = post.modifiedDate || post.publishedDate || '';
  return date > latest ? date : latest;
}, '');

for (const entry of entries) {
  if (entry.loc === `${SITE_ORIGIN}/blog/` && latestPostDate) entry.lastmod = latestPostDate;
}

const postEntries = posts.map(post => ({
  loc: post.url,
  lastmod: post.modifiedDate || post.publishedDate,
  changefreq: 'monthly',
  priority: '0.8'
}));

const seen = new Set();
const allEntries = [...entries, ...postEntries].filter(entry => {
  if (!entry.loc || seen.has(entry.loc)) return false;
  seen.add(entry.loc);
  return true;
});

const lines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
];

for (const entry of allEntries) {
  lines.push('  <url>');
  lines.push(`    <loc>${xmlEscape(entry.loc)}</loc>`);
  if (entry.lastmod) lines.push(`    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`);
  if (entry.changefreq) lines.push(`    <changefreq>${xmlEscape(entry.changefreq)}</changefreq>`);
  if (entry.priority) lines.push(`    <priority>${xmlEscape(entry.priority)}</priority>`);
  lines.push('  </url>');
}

lines.push('</urlset>', '');
fs.writeFileSync(sitemapPath, lines.join('\n'), 'utf8');
console.log(`Generated sitemap.xml: ${allEntries.length} URLs (${postEntries.length} blog posts).`);
