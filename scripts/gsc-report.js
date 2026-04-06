#!/usr/bin/env node
/**
 * Google Search Console 検索パフォーマンスレポート
 * 過去28日間のクエリ別データ（クリック数順 上位20件）
 * 実行: node scripts/gsc-report.js
 */

const path = require('path');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'gsc-credentials.json');
const SITE_URL = 'https://www.ciras.jp/';
const ROW_LIMIT = 20;
const DAYS = 28;

// 日付文字列生成（YYYY-MM-DD）
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function main() {
  // 認証
  const credentials = require(CREDENTIALS_PATH);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });

  const searchconsole = google.searchconsole({ version: 'v1', auth });

  // 期間設定（今日から28日前まで）
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // 昨日まで（当日はデータ未確定）
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (DAYS - 1));

  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  console.log(`\n  Google Search Console レポート`);
  console.log(`  サイト : ${SITE_URL}`);
  console.log(`  期間   : ${startStr} 〜 ${endStr}（過去${DAYS}日間）`);
  console.log(`  上位   : ${ROW_LIMIT} クエリ（クリック数順）\n`);

  // APIリクエスト
  const res = await searchconsole.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: startStr,
      endDate: endStr,
      dimensions: ['query'],
      rowLimit: ROW_LIMIT,
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
    },
  });

  const rows = res.data.rows;
  if (!rows || rows.length === 0) {
    console.log('  データがありません。\n');
    return;
  }

  // ヘッダー
  const LINE = '─'.repeat(80);
  console.log(LINE);
  console.log(
    `  ${'#'.padEnd(3)}  ${'クエリ'.padEnd(36)}  ${'クリック'.padStart(6)}  ${'表示回数'.padStart(6)}  ${'CTR'.padStart(6)}  ${'順位'.padStart(5)}`
  );
  console.log(LINE);

  // 行表示
  rows.forEach((row, i) => {
    const query = row.keys[0];
    const clicks = row.clicks;
    const impressions = row.impressions;
    const ctr = (row.ctr * 100).toFixed(1) + '%';
    const position = row.position.toFixed(1);
    const truncated = query.length > 34 ? query.slice(0, 33) + '…' : query;

    console.log(
      `  ${String(i + 1).padEnd(3)}  ${truncated.padEnd(36)}  ${String(clicks).padStart(6)}  ${String(impressions).padStart(6)}  ${ctr.padStart(6)}  ${position.padStart(5)}`
    );
  });

  console.log(LINE);

  // サマリー
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  const avgCtr = totalClicks / totalImpressions * 100;
  const avgPosition = rows.reduce((s, r) => s + r.position, 0) / rows.length;

  console.log(`\n  【上位${rows.length}クエリ合計】`);
  console.log(`  クリック数 : ${totalClicks.toLocaleString()}`);
  console.log(`  表示回数   : ${totalImpressions.toLocaleString()}`);
  console.log(`  平均CTR    : ${avgCtr.toFixed(1)}%`);
  console.log(`  平均順位   : ${avgPosition.toFixed(1)}`);
  console.log('');
}

main().catch((err) => {
  console.error('\n  エラー:', err.message);
  if (err.message.includes('insufficient authentication')) {
    console.error('  → サービスアカウントに Search Console の閲覧権限があるか確認してください');
  }
  process.exit(1);
});
