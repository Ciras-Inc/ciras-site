'use strict';

// Webサイト制作の価格を 22万円 → 33万円、220,000 → 330,000 に統一する。
// HTMLタグ間で分割された価格表示（<strong>220,000</strong> 円〜 等）はカバーできないため、
// 視覚的価格表示は手動編集で対応。本スクリプトは「22万円」「220,000」「220000」の単純文字列を一括置換。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const TARGETS = [
  'index.html',
  'ai-initial-setup.html',
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
  'seminar/ai-juku/index.html',
  'lp/ai-jyuku/index.html',
];

const REPLACEMENTS = [
  { from: /22万円〜/g, to: '33万円〜' },
  { from: /22万円～/g, to: '33万円〜' },
  { from: /22万円/g, to: '33万円' },
  { from: /220,000円/g, to: '330,000円' },
  { from: /"price":\s*"220000"/g, to: '"price":"330000"' },
];

let totalChanges = 0;
for (const rel of TARGETS) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  let html = fs.readFileSync(full, 'utf8');
  const orig = html;
  let changes = 0;
  for (const r of REPLACEMENTS) {
    const m = html.match(r.from);
    if (m) {
      changes += m.length;
      html = html.replace(r.from, r.to);
    }
  }
  if (html !== orig) {
    fs.writeFileSync(full, html, 'utf8');
    console.log(`✓ ${rel} (${changes}件)`);
    totalChanges += changes;
  }
}
console.log(`=== 完了。合計 ${totalChanges} 件 ===`);
