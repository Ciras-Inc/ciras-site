'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_JSON = path.join(ROOT, 'blog', 'index.json');
const INDEX_HTML = path.join(ROOT, 'index.html');
const BASE_URL = 'https://www.ciras.jp';

// Blog グリッドの開始・終了マーカー（index.html の固定構造）
const GRID_START = '<div class="blog-grid stagger">';
// 終了マーカー: カードの閉じ div 直後の blog-more 行（改行コードに依存しない検索）
const GRID_END_MARKER = '<div class="blog-more';

function formatDate(iso) {
  const [year, month, day] = iso.split('-');
  return `${year}.${parseInt(month, 10)}.${parseInt(day, 10)}`;
}

// カテゴリ重複排除で最大 max 件選出
function pickArticles(articles, max) {
  const seen = new Set();
  const picked = [];
  for (const a of articles) {
    if (!seen.has(a.category)) {
      seen.add(a.category);
      picked.push(a);
      if (picked.length >= max) return picked;
    }
  }
  // フォールバック: 同カテゴリ許可
  for (const a of articles) {
    if (!picked.includes(a)) {
      picked.push(a);
      if (picked.length >= max) return picked;
    }
  }
  return picked;
}

function buildCard(article) {
  const url = `${BASE_URL}/blog/${article.slug}`;
  const date = formatDate(article.publishedAt);
  const tag = article.category;
  const title = article.title;
  const desc = article.description;
  return (
    `      <article class="blog-card fade-in-up">` +
    `<a href="${url}">` +
    `<div class="blog-card-meta"><span class="blog-card-tag">${tag}</span><span class="blog-card-date">${date}</span></div>` +
    `<h3>${title}</h3>` +
    `<p class="blog-card-desc">${desc}</p>` +
    `</a></article>`
  );
}

function main() {
  const { articles } = JSON.parse(fs.readFileSync(INDEX_JSON, 'utf8'));

  const active = articles
    .filter(a => !a.archived)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const picked = pickArticles(active, 3);
  const cardsHtml = picked.map(buildCard).join('\n');

  // CRLF → LF に正規化してから処理（Windows ファイルへの対応）
  let html = fs.readFileSync(INDEX_HTML, 'utf8').replace(/\r\n/g, '\n');

  // GRID_START から GRID_END_BEFORE までの内容を置換
  const startIdx = html.indexOf(GRID_START);
  if (startIdx === -1) {
    console.error('エラー: blog-grid 開始マーカーが見つかりません');
    process.exit(1);
  }
  const afterStart = startIdx + GRID_START.length;
  // blog-more の前の </div> を終端とする
  const moreIdx = html.indexOf(GRID_END_MARKER, afterStart);
  if (moreIdx === -1) {
    console.error('エラー: blog-more マーカーが見つかりません');
    process.exit(1);
  }
  // </div> は blog-more の直前にある（CRLFにも対応）
  const closeDivIdx = html.lastIndexOf('</div>', moreIdx);

  const before = html.slice(0, afterStart);
  const after = html.slice(closeDivIdx);
  html = before + '\n' + cardsHtml + '\n    ' + after;

  fs.writeFileSync(INDEX_HTML, html, 'utf8');

  console.log('build-homepage.js 完了。選出記事:');
  picked.forEach(a => console.log(`  [${a.category}] ${a.publishedAt} ${a.slug}`));
}

main();
