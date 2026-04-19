'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { load } = require('cheerio');

const ROOT = path.join(__dirname, '..');
const INDEX_JSON = path.join(ROOT, 'blog', 'index.json');
const BLOG_DIR = path.join(ROOT, 'blog');

const BANNER_CLASS = 'archive-banner';
const BANNER_STYLE = `
    <style>
      .archive-banner {
        border: 2px solid #242422;
        background: #f7f7f7;
        padding: 16px 24px;
        margin: 0 0 32px;
        font-family: 'Noto Sans JP', sans-serif;
        font-size: 0.95rem;
        color: #242422;
        font-weight: 600;
      }
    </style>`;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return expiresAt < todayStr();
}

function buildBannerHtml(expiresAt) {
  const d = new Date(expiresAt);
  const label = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return `<div class="${BANNER_CLASS}">\n        <p>この補助金の募集は終了しました（${label}時点）</p>\n      </div>`;
}

function insertBannerIntoHtml(filePath, expiresAt) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const $ = load(raw);

  if ($(`.${BANNER_CLASS}`).length > 0) {
    return false; // 既挿入
  }

  const bannerHtml = buildBannerHtml(expiresAt);

  // <article> 直後の最初の h1 の前に挿入
  const article = $('article').first();
  if (article.length) {
    const h1 = article.find('h1').first();
    if (h1.length) {
      h1.before(bannerHtml);
    } else {
      article.prepend(bannerHtml);
    }
  } else {
    // article がない場合は h1 の前
    const h1 = $('h1').first();
    if (h1.length) {
      h1.before(bannerHtml);
    } else {
      $('body').prepend(bannerHtml);
    }
  }

  // style がなければ </head> 直前に挿入
  if (!raw.includes(BANNER_CLASS)) {
    const headClose = $.html().indexOf('</head>');
    // cheerio 経由で style を head に追加
    $('head').append(BANNER_STYLE);
  }

  // cheerio の $.html() を使わず、元ファイルのエンコードを保持するため
  // cheerio で処理した結果を書き戻す（html ファイル全体を cheerio が管理）
  fs.writeFileSync(filePath, $.html(), 'utf8');
  return true;
}

function main() {
  const data = JSON.parse(fs.readFileSync(INDEX_JSON, 'utf8'));
  const today = todayStr();
  let archivedCount = 0;

  for (const article of data.articles) {
    if (!isExpired(article.expires_at)) continue;
    if (article.archived) {
      console.log(`スキップ（既アーカイブ済み）: ${article.slug}`);
      continue;
    }

    article.archived = true;
    archivedCount++;
    console.log(`アーカイブ: ${article.slug} (expires_at: ${article.expires_at})`);

    const htmlPath = path.join(BLOG_DIR, `${article.slug}.html`);
    if (fs.existsSync(htmlPath)) {
      const inserted = insertBannerIntoHtml(htmlPath, article.expires_at);
      console.log(`  バナー挿入: ${inserted ? '完了' : 'スキップ（既挿入）'}`);
    } else {
      console.log(`  HTMLファイル未存在: ${htmlPath}`);
    }
  }

  fs.writeFileSync(INDEX_JSON, JSON.stringify(data, null, 2) + '\n', 'utf8');

  if (archivedCount === 0) {
    console.log('アーカイブ対象0件。');
  } else {
    console.log(`\nblog/index.json 更新完了。${archivedCount} 件をアーカイブ。`);
    console.log('トップページ・一覧を再ビルド中...');
    execSync('node scripts/build-homepage.js', { cwd: ROOT, stdio: 'inherit' });
    execSync('node scripts/build-blog-list.js', { cwd: ROOT, stdio: 'inherit' });
  }
}

main();
