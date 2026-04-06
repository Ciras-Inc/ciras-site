#!/usr/bin/env node
/**
 * デプロイ一括スクリプト
 * 実行順序: check → sitemap → git add . → git commit → git push
 * エラー発生時はその場で停止する
 */

const { execSync } = require('child_process');

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

// コミットメッセージ用の日時（例: "deploy: 2026-04-06 13:30"）
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
const commitMsg = `deploy: ${timestamp}`;

try {
  run('npm run check');
  run('npm run sitemap');
  run('git add .');
  run(`git commit -m "${commitMsg}"`);
  run('git push');
  console.log(`\n✓ デプロイ完了: ${commitMsg}\n`);
} catch (e) {
  console.error('\n✗ デプロイ中断: エラーが発生しました\n');
  process.exit(1);
}
