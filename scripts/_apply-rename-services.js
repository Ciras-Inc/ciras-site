'use strict';

// サービス改定に伴う機械的な置換を全HTMLに一括適用。
// - 「AI活用 Webサイト制作」「AI活用Webサイト制作」「Webサイト制作」（特定文脈）→ 「AI時代のホームページ制作」
// - 「AI業務システム開発」→ 「AI時代の業務システム開発」
// - Web制作料金 220,000円 → 330,000円
// admin.html は対象外。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const TARGETS = [
  'index.html',
  'ai-komon.html',
  'kagemusha.html',
  'web.html',
  'system.html',
  'company.html',
  'contact.html',
  'faq.html',
  'partner.html',
  'needs.html',
  'privacy.html',
  'ai-check.html',
  'ai-check-lp.html',
  'web-check.html',
  'web-check-lp.html',
  'seminar.html',
  'blog-index.html',
  'blog-template.html',
  'blog/index.html',
  'blog/260214-ai-search-guide.html',
  'blog/260214-wix-migration.html',
  'blog/260228-seminar-report-ehime.html',
  'blog/260317-seminar-report-hiroshima.html',
  'blog/260320-seminar-report-ehime.html',
  'blog/aeo-taisaku-kihon.html',
  'blog/ai-katsuyou-3points.html',
  'blog/shindan-tool-release.html',
  'seminar/ai-juku/index.html',
  'lp/ai-jyuku/index.html',
];

// 置換ルール（順序重要：長い文字列から処理）
const REPLACEMENTS = [
  // サービス名リネーム
  { from: /AI活用\s*Webサイト制作/g, to: 'AI時代のホームページ制作' },
  { from: /AI活用Webサイト制作/g, to: 'AI時代のホームページ制作' },
  { from: /AI業務システム開発/g, to: 'AI時代の業務システム開発' },
  // 価格更新（Web制作）
  { from: /220,000円〜/g, to: '330,000円〜' },
  { from: /220,000円～/g, to: '330,000円〜' },
  // JSON-LD 内の price 文字列（Web）
  { from: /"price":"220000"/g, to: '"price":"330000"' },
];

function updateFile(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    return { file: relPath, status: 'missing', changes: 0 };
  }

  let html = fs.readFileSync(fullPath, 'utf8');
  const originalEol = html.includes('\r\n') ? '\r\n' : '\n';
  html = html.replace(/\r\n/g, '\n');
  const before = html;
  let changes = 0;

  for (const r of REPLACEMENTS) {
    const matches = html.match(r.from);
    if (matches) {
      changes += matches.length;
      html = html.replace(r.from, r.to);
    }
  }

  if (html === before) {
    return { file: relPath, status: 'no-change', changes: 0 };
  }

  fs.writeFileSync(fullPath, html.replace(/\n/g, originalEol), 'utf8');
  return { file: relPath, status: 'updated', changes };
}

const results = TARGETS.map(updateFile);
const updated = results.filter(r => r.status === 'updated');
const missing = results.filter(r => r.status === 'missing');
const noChange = results.filter(r => r.status === 'no-change');

console.log('=== サービス名・価格 一括置換結果 ===');
console.log(`updated: ${updated.length}`);
updated.forEach(r => console.log(`  ✓ ${r.file} (${r.changes}件)`));
if (missing.length) {
  console.log(`missing: ${missing.length}`);
  missing.forEach(r => console.log('  ! ' + r.file));
}
if (noChange.length) {
  console.log(`no-change: ${noChange.length}`);
}
