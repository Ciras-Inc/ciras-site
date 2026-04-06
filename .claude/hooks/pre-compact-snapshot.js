#!/usr/bin/env node
// pre-compact-snapshot.js
// PreCompact hook (matcher: auto): 自動圧縮前にトランスクリプトと git status を保存

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SNAPSHOT_DIR = path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), 'quality_reports', 'session_snapshots');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let transcriptPath = '';
  try {
    const data = JSON.parse(input);
    transcriptPath = data?.transcript_path ?? '';
  } catch {
    process.stderr.write('pre-compact-snapshot: JSON parse error\n');
    process.exit(0);
  }

  // タイムスタンプ生成（yyyyMMdd-HHmmss）
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  // 保存先ディレクトリを作成
  try {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  } catch (e) {
    process.stderr.write(`pre-compact-snapshot: mkdir failed: ${e.message}\n`);
    process.exit(0);
  }

  // トランスクリプトのコピー
  if (transcriptPath && fs.existsSync(transcriptPath)) {
    const dest = path.join(SNAPSHOT_DIR, `transcript-${ts}.jsonl`);
    try {
      fs.copyFileSync(transcriptPath, dest);
    } catch (e) {
      process.stderr.write(`pre-compact-snapshot: copy failed: ${e.message}\n`);
    }
  } else {
    process.stderr.write(`pre-compact-snapshot: transcript_path not found: "${transcriptPath}"\n`);
  }

  // git status を保存
  const gitStatusPath = path.join(SNAPSHOT_DIR, `git-status-${ts}.txt`);
  try {
    const status = execSync('git status', {
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      encoding: 'utf8',
      timeout: 5000,
    });
    fs.writeFileSync(gitStatusPath, status, 'utf8');
  } catch (e) {
    fs.writeFileSync(gitStatusPath, `git status error: ${e.message}\n`, 'utf8');
  }

  process.exit(0);
});
