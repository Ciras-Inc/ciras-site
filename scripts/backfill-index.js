// blog/*.html を走査して blog/index.json を生成するスクリプト（初回のみ実行）
'use strict';

const fs = require('fs');
const path = require('path');
const { load } = require('cheerio');

const BLOG_DIR = path.join(__dirname, '..', 'blog');
const OUTPUT_PATH = path.join(BLOG_DIR, 'index.json');

const CATEGORIES = ['AI活用', 'AEO対策', 'Web運用', 'お知らせ', '補助金'];

// スラグからカテゴリを推定
function inferCategory(slug, title, description) {
  const text = `${slug} ${title} ${description}`.toLowerCase();
  if (text.includes('seminar') || text.includes('セミナー') || text.includes('shindan') || text.includes('診断')) {
    return 'お知らせ';
  }
  if (text.includes('aeo') || text.includes('ai-search') || text.includes('ai検索') || text.includes('answer engine')) {
    return 'AEO対策';
  }
  if (text.includes('wix') || text.includes('migration') || text.includes('移行') || text.includes('web運用')) {
    return 'Web運用';
  }
  if (text.includes('補助金') || text.includes('subsidy')) {
    return '補助金';
  }
  if (text.includes('ai') || text.includes('chatgpt') || text.includes('活用')) {
    return 'AI活用';
  }
  return 'お知らせ';
}

// HTML ファイルからメタデータを抽出
function extractMeta(filePath, slug) {
  const html = fs.readFileSync(filePath, 'utf8');
  const $ = load(html);

  const title = $('title').text().replace(/\s*[\|｜]\s*Ciras.*$/, '').trim()
    || $('h1').first().text().trim()
    || slug;

  const description = $('meta[name="description"]').attr('content')
    || $('meta[property="og:description"]').attr('content')
    || '';

  // JSON-LD から datePublished を取得
  let publishedAt = '';
  let updatedAt = '';
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      if (data.datePublished) publishedAt = data.datePublished.slice(0, 10);
      if (data.dateModified) updatedAt = data.dateModified.slice(0, 10);
    } catch (_e) {
      // JSON-LD パースエラーは無視
    }
  });

  // og:image を取得
  const heroImage = $('meta[property="og:image"]').attr('content') || `/blog/images/${slug}.png`;

  // スラグから日付を推定（例: 260214-xxx → 2026-02-14）
  if (!publishedAt) {
    const dateMatch = slug.match(/^(\d{2})(\d{2})(\d{2})-/);
    if (dateMatch) {
      publishedAt = `20${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    }
  }
  if (!updatedAt) updatedAt = publishedAt;

  const category = inferCategory(slug, title, description);

  // キーワードからタグを生成
  const keywords = $('meta[name="keywords"]').attr('content') || '';
  const tags = keywords
    ? keywords.split(/[,、]/).map(t => t.trim()).filter(Boolean).slice(0, 5)
    : [category];

  return {
    slug,
    title,
    description: description.slice(0, 120),
    category,
    publishedAt,
    updatedAt,
    heroImage,
    author: '杉本竜弥',
    tags,
    expires_at: null,
    archived: false,
  };
}

function main() {
  const files = fs.readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort();

  const articles = [];
  for (const file of files) {
    const slug = path.basename(file, '.html');
    const filePath = path.join(BLOG_DIR, file);
    try {
      const meta = extractMeta(filePath, slug);
      articles.push(meta);
      console.log(`✓ ${slug} [${meta.category}] ${meta.publishedAt}`);
    } catch (err) {
      console.error(`✗ ${slug}: ${err.message}`);
    }
  }

  // publishedAt 降順でソート
  articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const output = { version: '1.0', articles };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`\nblog/index.json に ${articles.length} 件を書き出しました。`);
}

main();
