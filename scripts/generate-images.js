'use strict';

// OpenAI Image API（既定: gpt-image-1）で images/manifest.json の画像を生成する。
//
// 使い方:
//   1) 事前準備: 環境変数 OPENAI_API_KEY が設定されていること（杉本さんの Windows User 環境変数）
//   2) 必要に応じて OPENAI_IMAGE_MODEL でモデルを差し替え可能（既定 gpt-image-1）
//   3) `node scripts/generate-images.js` で実行。manifest の regenerate:true のみ生成する
//   4) 生成完了後、manifest 側の regenerate を false に書き戻して二度生成を防ぐ
//
// 注意:
//   - 課金が発生する。実行は杉本さんの承認後にのみ行うこと
//   - OpenAI Platform で Budget Alerts / Auto-recharge Limits を事前設定推奨
//   - 既存生成画像（manifest 未掲載分）は上書きしない

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'images', 'manifest.json');

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('エラー: OPENAI_API_KEY が設定されていません。Windows User 環境変数を確認してください。');
  process.exit(1);
}

const DEFAULT_MODEL = 'gpt-image-1';
const MODEL = process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL;

function loadManifest() {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw);
}

function saveManifest(manifest) {
  const out = JSON.stringify(manifest, null, 2) + '\n';
  fs.writeFileSync(MANIFEST_PATH, out, 'utf8');
}

async function callOpenAIImageApi(prompt, size, quality) {
  // OpenAI Image API は base64 を返す（response_format=b64_json）か URL を返す。
  // gpt-image-1 は b64_json をデフォルトで返す。
  const body = {
    model: MODEL,
    prompt,
    n: 1,
    size,
  };
  if (quality) body.quality = quality;

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API エラー (${res.status}): ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const item = data && data.data && data.data[0];
  if (!item) throw new Error('OpenAI レスポンスに画像データがありません');

  if (item.b64_json) {
    return Buffer.from(item.b64_json, 'base64');
  }
  if (item.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error(`画像 URL 取得失敗: ${imgRes.status}`);
    const arrayBuffer = await imgRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  throw new Error('OpenAI レスポンスに b64_json も url もありません');
}

async function generateOne(entry) {
  const target = path.join(ROOT, entry.filename);
  const targetDir = path.dirname(target);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log(`  [${entry.id}] ${entry.filename} (${entry.size}, ${entry.quality || 'standard'}) 生成中...`);
  const buf = await callOpenAIImageApi(entry.prompt, entry.size, entry.quality);
  fs.writeFileSync(target, buf);
  console.log(`  [${entry.id}] ✓ 保存: ${entry.filename} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  const manifest = loadManifest();
  const targets = manifest.images.filter(i => i.regenerate);

  if (targets.length === 0) {
    console.log('生成対象がありません（manifest.images で regenerate:true のものがない）。');
    return;
  }

  console.log(`=== 画像生成開始（モデル: ${MODEL}） ===`);
  console.log(`対象: ${targets.length} 枚`);
  console.log('');

  let successCount = 0;
  let failCount = 0;
  for (const entry of targets) {
    try {
      await generateOne(entry);
      entry.regenerate = false;
      successCount++;
      // 1 枚ごとに manifest を保存（途中失敗時に最新状態を反映）
      saveManifest(manifest);
    } catch (err) {
      console.error(`  [${entry.id}] エラー: ${err.message}`);
      failCount++;
    }
  }

  console.log('');
  console.log('=== 生成結果 ===');
  console.log(`成功: ${successCount} / 失敗: ${failCount} / 合計: ${targets.length}`);
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('致命的エラー: ', err);
  process.exit(1);
});
