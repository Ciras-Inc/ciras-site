'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_JSON = path.join(ROOT, 'blog', 'index.json');
const BLOG_INDEX_HTML = path.join(ROOT, 'blog', 'index.html');

// 置換範囲マーカー
const GRID_START = '<div class="blog-grid fade-in-up">';
const GRID_END = '</div>\n  </div></section>';

function formatDate(iso) {
  const [year, month, day] = iso.split('-');
  return `${year}.${parseInt(month, 10)}.${parseInt(day, 10)}`;
}

function buildCard(article) {
  const url = `/blog/${article.slug}`;
  const date = formatDate(article.publishedAt);
  const tag = article.category;
  const title = article.title;
  const desc = article.description;
  return (
    `      <a href="${url}" class="blog-card">\n` +
    `        <div class="blog-card-meta"><span class="blog-card-tag">${tag}</span><span class="blog-card-date">${date}</span></div>\n` +
    `        <h2>${title}</h2>\n` +
    `        <p>${desc}</p>\n` +
    `      </a>`
  );
}

function main() {
  const { articles } = JSON.parse(fs.readFileSync(INDEX_JSON, 'utf8'));

  const active = articles
    .filter(a => !a.archived)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const cardsHtml = active.map(buildCard).join('\n\n');

  // CRLF → LF に正規化してから処理（Windows ファイルへの対応）
  let html = fs.readFileSync(BLOG_INDEX_HTML, 'utf8').replace(/\r\n/g, '\n');

  const startIdx = html.indexOf(GRID_START);
  if (startIdx === -1) {
    console.error('エラー: blog-grid 開始マーカーが見つかりません');
    process.exit(1);
  }
  const afterStart = startIdx + GRID_START.length;

  // 終了マーカー: </div> が2回連続する closing pattern を探す
  const endMarkerIdx = html.indexOf(GRID_END, afterStart);
  if (endMarkerIdx === -1) {
    console.error('エラー: blog-grid 終了マーカーが見つかりません');
    process.exit(1);
  }

  const before = html.slice(0, afterStart);
  const after = html.slice(endMarkerIdx);
  html = before + '\n\n' + cardsHtml + '\n\n    ' + after;

  fs.writeFileSync(BLOG_INDEX_HTML, html, 'utf8');

  console.log(`build-blog-list.js 完了。${active.length} 件を書き出しました:`);
  active.forEach(a => console.log(`  [${a.category}] ${a.publishedAt} ${a.slug}`));
}

main();
