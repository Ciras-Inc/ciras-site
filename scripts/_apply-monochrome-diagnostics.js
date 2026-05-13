'use strict';

// 診断ツール（web-check, ai-check）の緑系色をモノクロームに置換。
// Cirasの統一デザインシステム（モノクローム）に揃えるため。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const TARGETS = [
  'web-check.html',
  'ai-check.html',
  'web-check-lp.html',
  'ai-check-lp.html',
];

const REPLACEMENTS = [
  // 緑系グレード色 → モノクロのグレースケール
  { from: /#3a8c4e/gi, to: '#444444' },
  { from: /#5fa86a/gi, to: '#666666' },
  { from: /#9cc89e/gi, to: '#999999' },
  { from: /#c4dabb/gi, to: '#bbbbbb' },
  { from: /#1a3b18/gi, to: '#1a1a1a' },
  { from: /#2c5926/gi, to: '#242422' },
  { from: /#2D5A27/g,  to: '#242422' },
  // rgba 表記の濃緑透過
  { from: /rgba\(44,\s*89,\s*38,\s*0\.15\)/g, to: 'rgba(36,36,34,0.12)' },
  { from: /rgba\(44,\s*89,\s*38,\s*0\.2\)/g,  to: 'rgba(36,36,34,0.15)' },
];

for (const rel of TARGETS) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.log(`! ${rel} not found`);
    continue;
  }
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
  if (html === orig) {
    console.log(`= ${rel} (no change)`);
  } else {
    fs.writeFileSync(full, html, 'utf8');
    console.log(`✓ ${rel} (${changes} 件)`);
  }
}
