'use strict';

// 全HTMLページのヘッダー・フッター・モバイルメニューを index.html と同じ統一版に置き換える。
// CSS のデザイントークン（:root）と body の font-size/line-height も統一する。
// admin.html は対象外（仕様書§11-10）。
// 既に統一済みのファイルは差分なしで終了する。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const TARGETS = [
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

// index.html から header と footer の正規版を抽出
const SOURCE = path.join(ROOT, 'index.html');
const source = fs.readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');

function extractBlock(html, openPattern, closeTag) {
  const re = new RegExp(openPattern + '[\\s\\S]*?</' + closeTag + '>', 'm');
  const m = html.match(re);
  if (!m) throw new Error('extractBlock failed for ' + openPattern);
  return m[0];
}

const NEW_HEADER = extractBlock(source, '<header class="header"', 'header');
const NEW_FOOTER = extractBlock(source, '<footer class="footer"', 'footer');

// CSS デザイントークン（:root）— 既存に :root が無いページにのみ差し込む
const DESIGN_TOKENS_CSS = `    /* === DESIGN TOKENS === */
    :root {
      --color-bg: #FFFFFF;
      --color-bg-alt: #FAFAFA;
      --color-text: #242422;
      --color-text-sub: #666666;
      --color-text-mute: #888888;
      --color-text-soft: #aaaaaa;
      --color-border: #E5E5E5;
      --color-border-soft: #eeeeee;
      --color-dark-bg: #1A1A1A;
      --color-dark-text: #ffffff;
      --color-dark-text-sub: #cccccc;
      --color-dark-text-mute: #999999;
      --font-base: 18px;
      --font-base-mobile: 16px;
      --line-height-body: 1.8;
      --radius: 8px;
      --radius-sm: 4px;
    }

`;

function updateFile(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    return { file: relPath, status: 'missing' };
  }

  let html = fs.readFileSync(fullPath, 'utf8');
  const originalEol = html.includes('\r\n') ? '\r\n' : '\n';
  html = html.replace(/\r\n/g, '\n');
  const before = html;

  // 1. <header class="header" ... </header> をまるごと置換
  const headerRe = /<header class="header"[\s\S]*?<\/header>/m;
  if (headerRe.test(html)) {
    html = html.replace(headerRe, NEW_HEADER);
  }

  // 2. <footer class="footer" ... </footer> をまるごと置換
  const footerRe = /<footer class="footer"[\s\S]*?<\/footer>/m;
  if (footerRe.test(html)) {
    html = html.replace(footerRe, NEW_FOOTER);
  }

  // 3. デザイントークン CSS が無ければ /* === RESET === */ の直前に差し込む
  if (!html.includes('--color-bg-alt:') && html.includes('/* === RESET ===')) {
    html = html.replace(
      /([ \t]*)\/\* === RESET === \*\//,
      DESIGN_TOKENS_CSS + '$1/* === RESET === */'
    );
  }

  // 4. body の font-size/line-height/color/background を CSS 変数に寄せる（軽微）
  //    body { ...; color: #242422; background: #fff; line-height: 1.6; overflow-x: hidden; }
  html = html.replace(
    /(body\s*\{[^}]*?)color:\s*#242422;\s*background:\s*#fff;\s*line-height:\s*1\.6;\s*overflow-x:\s*hidden;/,
    '$1color: var(--color-text); background: var(--color-bg); line-height: var(--line-height-body); overflow-x: hidden; font-size: var(--font-base-mobile);'
  );
  // メディアクエリで >=768px で 18px に上げる行を追加（既に追加済みでない場合）
  if (!html.includes('font-size: var(--font-base)') && html.includes('font-size: var(--font-base-mobile)')) {
    html = html.replace(
      /(body\s*\{[^}]*?font-size:\s*var\(--font-base-mobile\);\s*\})/,
      '$1\n    @media (min-width: 768px) { body { font-size: var(--font-base); } }'
    );
  }

  if (html === before) {
    return { file: relPath, status: 'no-change' };
  }

  fs.writeFileSync(fullPath, html.replace(/\n/g, originalEol), 'utf8');
  return { file: relPath, status: 'updated' };
}

const results = TARGETS.map(updateFile);
const updated = results.filter(r => r.status === 'updated');
const missing = results.filter(r => r.status === 'missing');
const noChange = results.filter(r => r.status === 'no-change');

console.log('=== Unified layout 適用結果 ===');
console.log(`updated: ${updated.length}`);
updated.forEach(r => console.log('  ✓ ' + r.file));
if (missing.length) {
  console.log(`missing: ${missing.length}`);
  missing.forEach(r => console.log('  ! ' + r.file));
}
if (noChange.length) {
  console.log(`no-change: ${noChange.length}`);
  noChange.forEach(r => console.log('  = ' + r.file));
}
