'use strict';

// ブランドボイス原則 (1) 〜 (9) を全アクティブページに一括適用するクリーンアップ。
// - 時間・回数・期間の明示を削除
// - 「無料」をフロントから消す（無料相談 → ご相談、無料で相談する → ご相談）
// - 業界用語（AEO 等）を平易な表現に置換
// - 営業定型表現を整理
// - 「並走」「伴走」を「深く関わる／身近に関わる」に置換
//
// 対象外:
//   - blog/*.html, blog-template.html, blog-index.html, blog/index.html : 記事の事実情報を保護
//   - admin.html : 仕様書 §11-10
//
// 個別ページ固有の文脈（例: FAQ「費用はどれくらいかかりますか？」回答内で
// 「相談は無料」と一度だけ言及して良い）は、本スクリプト適用後に個別 Edit で復元する。

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
  'seminar/ai-juku/index.html',
  'lp/ai-jyuku/index.html',
];

// 順序重要：長い文字列 / 複合表現から先に処理する
const REPLACEMENTS = [

  // ====== 原則(1) + (8) 時間・回数・期間の明示削除（複合表現から） ======

  // 「無料相談（30分）」「30分の無料相談」など複合 → 「ご相談」
  { from: /30分の無料相談\s*[（(]30分[）)]/g, to: 'ご相談' },
  { from: /無料相談\s*[（(]30分[）)]/g, to: 'ご相談' },
  { from: /無料相談\s*[（(]オンライン・30分[）)]/g, to: 'ご相談' },
  { from: /30分の無料相談/g, to: 'ご相談' },
  { from: /30分間の無料相談/g, to: 'ご相談' },

  // セミナー時間明示の削除
  { from: /生成AI活用セミナー\s*[（(]オンライン・30分・月次[）)]/g, to: '生成AI活用セミナー（オンライン）' },
  { from: /生成AI活用セミナー\s*[（(]オンライン・30分[）)]/g, to: '生成AI活用セミナー（オンライン）' },
  { from: /生成AI活用セミナー\s*[（(]オンライン[）)]/g, to: '生成AI活用セミナー' },
  { from: /生成AI活用塾\s*[（(]対面1時間・実践型[）)]/g, to: '生成AI活用塾' },
  { from: /生成AI活用塾\s*[（(]対面1時間[）)]/g, to: '生成AI活用塾' },
  { from: /生成AI活用塾\s*[（(]対面[）)]/g, to: '生成AI活用塾' },

  // 括弧書き補足（原則(8) ）
  { from: /[（(]オンライン・30分・月次[）)]/g, to: '' },
  { from: /[（(]オンライン・30分[）)]/g, to: '' },
  { from: /[（(]対面1時間・実践型[）)]/g, to: '' },
  { from: /[（(]対面1時間[）)]/g, to: '' },
  { from: /[（(]オンラインまたは対面・約1時間[）)]/g, to: '' },
  { from: /[（(]月1回[）)]/g, to: '' },
  // 「（オンライン）」「（対面）」 単独
  { from: /[（(]オンライン[）)]/g, to: '' },
  { from: /[（(]対面[）)]/g, to: '' },

  // 30分単独
  { from: /30分間の/g, to: '' },
  { from: /30分の/g, to: '' },
  { from: /30分・/g, to: '' },

  // 月1回
  { from: /月1回まとめて聞くより、/g, to: '' },
  { from: /月1回の面談（オンラインまたは対面・約1時間）と日々のチャット相談（LINE・メール）/g, to: 'チャット相談' },
  { from: /月1回の面談と日々のチャット相談/g, to: 'チャット相談' },
  { from: /月1回の面談/g, to: '面談' },
  { from: /月1回/g, to: '' },

  // 1週間以内 / 最短1週間
  { from: /1週間以内に費用と進め方をお伝えし、納得いただけたら開始します。/g, to: '' },
  { from: /1週間以内に/g, to: '' },
  { from: /最短1週間で/g, to: '' },
  { from: /最短1週間/g, to: '' },

  // 月次開催 / 毎月 / 月次
  { from: /・月次開催/g, to: '' },
  { from: /月次開催/g, to: '' },
  { from: /、毎月開催しています。/g, to: '。' },
  { from: /毎月開催/g, to: '' },
  { from: /毎月/g, to: '' },

  // 1営業日以内
  { from: /原則1営業日以内に回答します。/g, to: '' },
  { from: /原則1営業日以内/g, to: '' },
  { from: /1営業日以内/g, to: '' },

  // 約1時間
  { from: /、約1時間/g, to: '' },
  { from: /約1時間の/g, to: '' },
  { from: /約1時間/g, to: '' },

  // ====== 原則(3) 「無料」をフロントから消す（CTA・本文） ======

  { from: /無料で相談する/g, to: 'ご相談' },
  { from: /無料で相談したい/g, to: 'ご相談したい' },
  { from: /無料で相談しませんか/g, to: 'ご相談しませんか' },
  { from: /無料相談を申し込む/g, to: 'ご相談する' },
  { from: /無料相談から/g, to: 'ご相談から' },
  { from: /無料相談へ/g, to: 'ご相談へ' },
  { from: /無料相談で/g, to: 'ご相談で' },
  { from: /の無料相談/g, to: 'のご相談' },
  { from: /無料相談/g, to: 'ご相談' },

  // 「無料で診断する」 → 「診断する」（CTAから無料外し）
  { from: /無料で診断する/g, to: '診断する' },

  // ====== 原則(4) 業界用語の平易化 ======
  { from: /AEO（Answer Engine Optimization）/g, to: 'AI検索向けの最適化' },
  { from: /AEO\s*\(Answer Engine Optimization\)/g, to: 'AI検索向けの最適化' },
  { from: /AEO対応/g, to: 'AI検索向けの作り方' },
  { from: /AEO対策/g, to: 'AI検索対策' },
  { from: /AEO最適化/g, to: 'AI検索向けの最適化' },
  // 単独 AEO（カテゴリ名等は別途）
  // ※ ブログのカテゴリ表記「AEO対策」はブログ記事側で別途運用、本スクリプトは対象外なので安全

  // 「AI軸で」 → 「AIの観点で」 等
  { from: /AI軸で聞かれる/g, to: 'AIの観点でご相談を受ける' },
  { from: /AI軸で/g, to: 'AIの観点で' },

  // フォールバック / コンテキスト 等
  { from: /フォールバック/g, to: '予備の選択肢' },
  { from: /コンテキスト/g, to: '文脈' },
  { from: /シームレス/g, to: '' },
  { from: /包括的/g, to: '' },

  // ====== 原則(5) 営業定型表現 ======
  { from: /、ぜひ/g, to: '、' },
  { from: /ぜひ/g, to: '' },
  { from: /からどうぞ。/g, to: 'からはじめられます。' },
  { from: /どうぞ。/g, to: '' },
  { from: /最適なプラン/g, to: '合ったプラン' },
  { from: /最適なサービス/g, to: '合ったサービス' },
  { from: /最適な/g, to: '合った' },
  { from: /圧倒的/g, to: '' },
  { from: /完璧な/g, to: '' },
  { from: /革新的な/g, to: '' },
  { from: /革新的/g, to: '' },

  // ====== 原則(9) 並走 / 伴走 ======
  { from: /経営判断への並走/g, to: '経営判断に深く関わるところ' },
  { from: /経営への深い並走/g, to: '経営に深く関わるところ' },
  { from: /への並走/g, to: 'に深く関わる' },
  { from: /並走まで/g, to: '深く関わるところまで' },
  { from: /並走する/g, to: '深く関わる' },
  { from: /並走/g, to: '深く関わる' },
  { from: /伴走する/g, to: '身近に関わる' },
  { from: /伴走/g, to: '身近に関わる' },
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
const missing = results.filter(r => r.status === 'missing');
const noChange = results.filter(r => r.status === 'no-change');

console.log('=== ブランドボイス原則 1-9 一括適用結果 ===');
console.log(`updated: ${updated.length}`);
updated.forEach(r => console.log(`  ✓ ${r.file} (${r.changes}件)`));
if (missing.length) {
  console.log(`missing: ${missing.length}`);
  missing.forEach(r => console.log('  ! ' + r.file));
}
if (noChange.length) console.log(`no-change: ${noChange.length}`);
