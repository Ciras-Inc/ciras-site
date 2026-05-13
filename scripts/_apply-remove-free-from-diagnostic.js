'use strict';

// 「無料診断ツール」「Free Diagnostic」「Free Consultation」をフロントから外す。
// 原則(3) 「無料」をフロントに出さない の徹底適用。
// ※「無料診断ツール」自体は機能名としては残せるが、フロント表記からは「無料」を外す。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 全ての主要ページ（admin.html 除く）
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

const REPLACEMENTS = [
  // ナビ表記（ヘッダー・モバイルメニュー両方）
  { from: />無料診断ツール</g, to: '>診断ツール<' },
  // セクション見出し・本文中の単独 "無料診断ツール"
  { from: /無料診断ツール/g, to: '診断ツール' },

  // English section-label
  { from: /Free Diagnostic/g, to: 'Diagnostic' },
  { from: /Free Consultation/g, to: 'Consultation' },
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
    const m = html.match(r.from);
    if (m) {
      changes += m.length;
      html = html.replace(r.from, r.to);
    }
  }

  if (html === before) return { file: relPath, status: 'no-change', changes: 0 };

  fs.writeFileSync(fullPath, html.replace(/\n/g, originalEol), 'utf8');
  return { file: relPath, status: 'updated', changes };
}

const results = TARGETS.map(updateFile);
const updated = results.filter(r => r.status === 'updated');

console.log('=== 「無料診断ツール」「Free Diagnostic」 をフロントから外す 結果 ===');
console.log(`updated: ${updated.length}`);
updated.forEach(r => console.log(`  ✓ ${r.file} (${r.changes}件)`));
const noChange = results.filter(r => r.status === 'no-change');
if (noChange.length) console.log(`no-change: ${noChange.length}`);
