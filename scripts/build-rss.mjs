#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE_ORIGIN, cdata, getPosts, toRfc822, xmlEscape } from './blog-post-utils.mjs';

const rssPath = path.join(ROOT, 'rss.xml');
const limit = Math.max(1, Number.parseInt(process.env.RSS_LIMIT || '50', 10) || 50);
const posts = getPosts().slice(0, limit);
const latestDate = posts[0]?.modifiedDate || posts[0]?.publishedDate;

const lines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">',
  '  <channel>',
  '    <title>KBRIDGE 케이브릿지 물류 블로그</title>',
  `    <link>${xmlEscape(`${SITE_ORIGIN}/blog/`)}</link>`,
  '    <description>수출입, 해상·항공운송, 통관, 물류 실무 정보를 제공하는 케이브릿지 공식 블로그입니다.</description>',
  '    <language>ko-KR</language>',
  `    <atom:link href="${xmlEscape(`${SITE_ORIGIN}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
  `    <lastBuildDate>${xmlEscape(toRfc822(latestDate))}</lastBuildDate>`,
  '    <ttl>60</ttl>'
];

for (const post of posts) {
  lines.push('    <item>');
  lines.push(`      <title>${xmlEscape(post.title)}</title>`);
  lines.push(`      <link>${xmlEscape(post.url)}</link>`);
  lines.push(`      <guid isPermaLink="true">${xmlEscape(post.url)}</guid>`);
  lines.push(`      <pubDate>${xmlEscape(toRfc822(post.publishedDate || post.modifiedDate))}</pubDate>`);
  lines.push(`      <category>${xmlEscape(post.categoryLabel)}</category>`);
  lines.push(`      <description>${cdata(post.description)}</description>`);
  if (post.articleHtml) lines.push(`      <content:encoded>${cdata(post.articleHtml)}</content:encoded>`);
  if (post.image) {
    const mime = post.image.toLowerCase().endsWith('.png') ? 'image/png' : post.image.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    lines.push(`      <enclosure url="${xmlEscape(post.image)}" type="${mime}" length="0" />`);
  }
  lines.push('    </item>');
}

lines.push('  </channel>', '</rss>', '');
fs.writeFileSync(rssPath, lines.join('\n'), 'utf8');
console.log(`Generated rss.xml with ${posts.length} latest posts.`);
