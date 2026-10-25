#!/usr/bin/env node
// The independent RSS entry point delegates to the canonical blog generator.
// This keeps publication filters, ordering, and unlimited membership identical.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
execFileSync(process.execPath, [path.join(root, 'scripts', 'build-blog-posts.mjs'), '--rss-only'], {
  cwd: root,
  stdio: 'inherit'
});
console.log('Generated rss.xml with every public blog post (no item cap).');
