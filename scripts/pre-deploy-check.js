#!/usr/bin/env node
/**
 * デプロイ前チェックスクリプト
 * チェック内容:
 *   1. 内部リンク（href）が実在するファイルを指しているか
 *   2. JSON-LD の JSON 構文が正しいか
 *   3. 全HTMLに <title> と <meta name="description"> が存在するか
 *
 * 実行: node scripts/pre-deploy-check.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = 'https://www.ciras.jp';

// チェック対象外ファイル
const EXCLUDE_FILES = new Set([
  'admin.html',
  'blog-template.html',
  'blog-index.html',
]);

// ========== HTML ファイル収集 ==========

function collectAllHtml(dir) {
  const results = [];
  // .claude/worktrees は除外
  if (dir.includes('.claude')) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.claude' || entry.name === 'node_modules') continue;
      results.push(...collectAllHtml(fullPath));
    } else if (entry.name.endsWith('.html')) {
      const relPath = path.relative(ROOT, fullPath).replace(/\\/g, '/');
      const basename = path.basename(entry.name);
      // ルート直下の除外対象はスキップ
      if (!relPath.includes('/') && EXCLUDE_FILES.has(basename)) continue;
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

// ========== URLパス → ファイルパス変換 ==========

function urlToFilePath(urlPath) {
  // fragment を除去
  const withoutFragment = urlPath.split('#')[0];
  if (!withoutFragment || withoutFragment === '/') {
    return path.join(ROOT, 'index.html');
  }
  // 末尾スラッシュ（ディレクトリ）→ index.html
  if (withoutFragment.endsWith('/')) {
    return path.join(ROOT, withoutFragment, 'index.html');
  }
  // 拡張子なし → .html を補完
  if (!path.extname(withoutFragment)) {
    return path.join(ROOT, withoutFragment + '.html');
  }
  return path.join(ROOT, withoutFragment);
}

// ========== 内部リンク抽出 ==========

function extractInternalLinks(html) {
  const links = [];
  // <a href="..."> のみ対象（<link>/<area> 等は除外）
  const re = /<a\s[^>]*href="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    // 絶対内部リンク
    if (href.startsWith(BASE_URL)) {
      links.push(href.slice(BASE_URL.length) || '/');
      continue;
    }
    // ルート相対リンク
    if (href.startsWith('/') && !href.startsWith('//')) {
      links.push(href);
      continue;
    }
    // 外部リンク・mailto・tel・アンカーのみはスキップ
  }
  return links;
}

// ========== チェック実行 ==========

const allHtml = collectAllHtml(ROOT);
const errors = {
  links: [],    // 内部リンク切れ
  jsonld: [],   // JSON-LD 構文エラー
  meta: [],     // title / meta description 欠落
};
let totalChecked = 0;

for (const { fullPath, relPath } of allHtml) {
  totalChecked++;
  const html = fs.readFileSync(fullPath, 'utf-8');

  // --- チェック1: 内部リンク ---
  const internalLinks = extractInternalLinks(html);
  const seen = new Set();
  for (const linkPath of internalLinks) {
    const withoutFrag = linkPath.split('#')[0];
    if (!withoutFrag || withoutFrag === '/') continue; // ルートは常に存在
    if (seen.has(withoutFrag)) continue;
    seen.add(withoutFrag);

    const targetFile = urlToFilePath(withoutFrag);
    if (!fs.existsSync(targetFile)) {
      errors.links.push({ file: relPath, link: linkPath });
    }
  }

  // --- チェック2: JSON-LD 構文 ---
  const jsonldRe = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jm;
  let blockIndex = 0;
  while ((jm = jsonldRe.exec(html)) !== null) {
    blockIndex++;
    try {
      JSON.parse(jm[1]);
    } catch (e) {
      errors.jsonld.push({ file: relPath, block: blockIndex, error: e.message });
    }
  }

  // --- チェック3: title / meta description ---
  const hasTitle = /<title[^>]*>[^<]+<\/title>/i.test(html);
  const hasDesc = /<meta[^>]+name=["']description["'][^>]*content=["'][^"']+["']/i.test(html)
    || /<meta[^>]+content=["'][^"']+["'][^>]*name=["']description["']/i.test(html);

  if (!hasTitle || !hasDesc) {
    errors.meta.push({
      file: relPath,
      missing: [!hasTitle && 'title', !hasDesc && 'meta description'].filter(Boolean),
    });
  }
}

// ========== 結果表示 ==========

const LINE = '─'.repeat(60);
let hasError = false;

console.log(`\n${LINE}`);
console.log(`  デプロイ前チェック  （対象: ${totalChecked} ファイル）`);
console.log(LINE);

// チェック1
console.log('\n【チェック1】内部リンク切れ');
if (errors.links.length === 0) {
  console.log('  ✓ 問題なし');
} else {
  hasError = true;
  for (const { file, link } of errors.links) {
    console.log(`  ✗ ${file}`);
    console.log(`      リンク先が見つかりません: ${link}`);
  }
}

// チェック2
console.log('\n【チェック2】JSON-LD 構文');
if (errors.jsonld.length === 0) {
  console.log('  ✓ 問題なし');
} else {
  hasError = true;
  for (const { file, block, error } of errors.jsonld) {
    console.log(`  ✗ ${file}  （ブロック #${block}）`);
    console.log(`      ${error}`);
  }
}

// チェック3
console.log('\n【チェック3】title / meta description');
if (errors.meta.length === 0) {
  console.log('  ✓ 問題なし');
} else {
  hasError = true;
  for (const { file, missing } of errors.meta) {
    console.log(`  ✗ ${file}  欠落: ${missing.join(', ')}`);
  }
}

// 総合結果
console.log(`\n${LINE}`);
if (hasError) {
  const total = errors.links.length + errors.jsonld.length + errors.meta.length;
  console.log(`  結果: ✗ ${total} 件の問題が見つかりました`);
  console.log(LINE + '\n');
  process.exit(1);
} else {
  console.log('  結果: ✓ 全チェック OK');
  console.log(LINE + '\n');
}
