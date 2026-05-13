'use strict';

// AI導入クリーンアップで「Ciras AI導入 → Ciras AI顧問」した結果、
// 「Ciras AI顧問（月額33,000円）、Ciras AI顧問（月額33,000円〜）」のような
// 重複が発生している箇所を修正。2つ目を「AI初期設定パック（55,000円〜）」に置き換える。
//
// また、「月1回」削除に伴う orphan 文字列（「のレクチャー（）」「月1回の」削除後の不自然な空文字）を修正。

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
  // 重複 AI顧問 を AI初期設定パック に置き換え（最初の AI顧問を残し、2つ目を初期設定パックに）
  { from: /Ciras AI顧問（月額33,000円）、Ciras AI顧問（月額33,000円〜）/g, to: 'Ciras AI顧問（月額33,000円〜）、AI初期設定パック（55,000円〜・買い切り）' },
  // orphan「のレクチャー（）」
  { from: /、?のレクチャー（）/g, to: '' },
  { from: /のレクチャー（）/g, to: '' },
  // 「は月1回」「、月1回」「は月1回の」等 orphan
  { from: /は月1回まとめて聞くより、/g, to: '' },
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
