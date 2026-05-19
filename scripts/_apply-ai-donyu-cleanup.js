'use strict';

// AI導入廃止に伴う残存参照のクリーンアップ。
// HTMLファイル全体に対し、典型的な AI導入 文言を AI初期設定パック / AI顧問 / 業務システム開発 へ書き換える。
// 既に手動で更新したものは差分なしで終了する。

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
  'seminar/ai-juku/index.html',
  'lp/ai-jyuku/index.html',
];

// 順序重要：長い文脈から先に置換
const REPLACEMENTS = [
  // 機械的な「Ciras AI導入 → Ciras AI顧問」へのフォールバック置換（廃止サービスへの導線を顧問へ向ける）
  // ※ ai-komon の比較・カードなど、すでに手動で AI初期設定パック に置き換えた箇所はもう「Ciras AI導入」を含まないため影響なし
  { from: /Ciras AI導入（月額88,000円）/g, to: 'Ciras AI顧問（月額33,000円〜）' },
  { from: /Ciras AI導入\s*\(月額88,000円\)/g, to: 'Ciras AI顧問（月額33,000円〜）' },
  { from: /月額88,000円のCiras AI導入/g, to: 'Ciras AI顧問（月額33,000円〜）' },
  { from: /月額88,000円のAI導入/g, to: 'Ciras AI顧問（月額33,000円〜）' },
  { from: /AI導入（月額88,000円）/g, to: 'AI顧問（月額33,000円〜）' },
  { from: /AI導入\s*\(月額88,000円\)/g, to: 'AI顧問（月額33,000円〜）' },
  // 価格単体
  { from: /月額88,000円/g, to: '月額33,000円〜' },
  // サービス名の機械置換（広い文脈）
  { from: /Ciras AI導入/g, to: 'Ciras AI顧問' },
  // ナビ・キーワードでの "AI導入" 単体
  { from: /AI導入,/g, to: 'AI初期設定,' },
  // 「AI導入・」「・AI導入」のような中点接続を「AI初期設定パック」に
  { from: /AI導入・/g, to: 'AI初期設定パック・' },
  { from: /・AI導入/g, to: '・AI初期設定パック' },
  // URL（残存があれば 301 リダイレクトに任せるが、コード内の直接リンクは ai-komon に統一）
  { from: /https:\/\/www\.ciras\.jp\/ai-donyu/g, to: 'https://www.ciras.jp/ai-komon' },
  { from: /href="\/ai-donyu"/g, to: 'href="/ai-komon"' },
];

function updateFile(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) return { file: relPath, status: 'missing', changes: 0 };

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

  if (html === before) return { file: relPath, status: 'no-change', changes: 0 };

  fs.writeFileSync(fullPath, html.replace(/\n/g, originalEol), 'utf8');
  return { file: relPath, status: 'updated', changes };
}

const results = TARGETS.map(updateFile);
const updated = results.filter(r => r.status === 'updated');

console.log('=== AI導入 残存参照クリーンアップ結果 ===');
console.log(`updated: ${updated.length}`);
updated.forEach(r => console.log(`  ✓ ${r.file} (${r.changes}件)`));
const noChange = results.filter(r => r.status === 'no-change');
if (noChange.length) console.log(`no-change: ${noChange.length}`);
