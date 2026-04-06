#!/usr/bin/env node
/**
 * sitemap.xml 自動生成スクリプト
 * 対象: ルート直下のHTML + blog/ lp/ seminar/ 配下のHTML
 * 実行: node scripts/generate-sitemap.js
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.ciras.jp';
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'sitemap.xml');

// 公開対象外ファイル（ルート直下）
const EXCLUDE_ROOT = new Set([
  'admin.html',
  'blog-template.html',
  'blog-index.html',
]);

// URLパス別の優先度設定
const PRIORITY_MAP = {
  '/':               1.0,
  '/ai-komon':       0.9,
  '/ai-donyu':       0.9,
  '/web':            0.9,
  '/system':         0.9,
  '/kagemusha':      0.9,
  '/needs':          0.8,
  '/seminar':        0.8,
  '/ai-check':       0.8,
  '/web-check':      0.8,
  '/ai-check-lp':    0.8,
  '/web-check-lp':   0.8,
  '/voice':          0.7,
  '/faq':            0.7,
  '/blog/':          0.7,
  '/company':        0.6,
  '/contact':        0.6,
  '/partner':        0.5,
  '/privacy':        0.3,
};

// changefreq 判定
function getChangefreq(urlPath) {
  if (urlPath === '/seminar' || urlPath.startsWith('/seminar/')) return 'weekly';
  if (urlPath === '/blog/' || urlPath.startsWith('/blog/')) return 'weekly';
  if (urlPath === '/privacy') return 'yearly';
  return 'monthly';
}

// 優先度判定
function getPriority(urlPath) {
  if (PRIORITY_MAP[urlPath] !== undefined) return PRIORITY_MAP[urlPath];
  // blog記事
  if (urlPath.startsWith('/blog/')) return 0.6;
  // lp/ seminar/ サブページ
  if (urlPath.startsWith('/lp/') || urlPath.startsWith('/seminar/')) return 0.7;
  return 0.6;
}

// ファイルの更新日時をYYYY-MM-DD形式で取得
function getLastmod(filePath) {
  const stat = fs.statSync(filePath);
  return stat.mtime.toISOString().slice(0, 10);
}

// HTMLファイルパスをURLパスに変換
function toUrlPath(relPath) {
  // Windows区切りを統一
  const normalized = relPath.replace(/\\/g, '/');
  // index.html の処理
  if (normalized === 'index.html') return '/';
  if (normalized.endsWith('/index.html')) {
    return '/' + normalized.slice(0, -'index.html'.length);
  }
  // 通常ファイルは .html を除去
  return '/' + normalized.replace(/\.html$/, '');
}

// 指定ディレクトリ配下のHTMLを再帰収集
function collectHtml(dir, baseDir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectHtml(fullPath, baseDir));
    } else if (entry.name.endsWith('.html')) {
      results.push(fullPath);
    }
  }
  return results;
}

// エントリー収集
const entries = [];

// 1. ルート直下のHTMLファイル
for (const file of fs.readdirSync(ROOT)) {
  if (!file.endsWith('.html')) continue;
  if (EXCLUDE_ROOT.has(file)) continue;
  entries.push({ filePath: path.join(ROOT, file), relPath: file });
}

// 2. blog/ lp/ seminar/ 配下
for (const subdir of ['blog', 'lp', 'seminar']) {
  const dir = path.join(ROOT, subdir);
  for (const filePath of collectHtml(dir, ROOT)) {
    const relPath = path.relative(ROOT, filePath);
    entries.push({ filePath, relPath });
  }
}

// URLパスでソート（/ → サービス → ブログ順）
entries.sort((a, b) => {
  const ua = toUrlPath(a.relPath);
  const ub = toUrlPath(b.relPath);
  return ua.localeCompare(ub);
});

// XML生成
const urlElements = entries.map(({ filePath, relPath }) => {
  const filename = path.basename(relPath);
  const urlPath = toUrlPath(relPath);
  const loc = urlPath === '/'
    ? BASE_URL + '/'
    : BASE_URL + urlPath;
  const lastmod = getLastmod(filePath);
  const changefreq = getChangefreq(urlPath);
  const priority = getPriority(urlPath);

  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority.toFixed(1)}</priority>`,
    '  </url>',
  ].join('\n');
});

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urlElements,
  '</urlset>',
  '',
].join('\n');

fs.writeFileSync(OUTPUT, xml, 'utf-8');

console.log(`✓ sitemap.xml を生成しました（${entries.length} URL）`);
console.log(`  出力先: ${OUTPUT}`);
entries.forEach(({ relPath }) => {
  const urlPath = toUrlPath(relPath);
  const loc = urlPath === '/' ? BASE_URL + '/' : BASE_URL + urlPath;
  console.log(`  - ${loc}`);
});
