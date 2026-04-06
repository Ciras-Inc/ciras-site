#!/usr/bin/env node
// protect-files.js
// PreToolUse hook: Edit|Write ツールで保護ファイルへの書き込みをブロックする

const PROTECTED_PATTERNS = [
  '.env',
  'package-lock.json',
  '.git/',
  'wrangler.toml',
];

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let filePath = '';
  try {
    const data = JSON.parse(input);
    filePath = data?.tool_input?.file_path ?? '';
  } catch {
    process.exit(0);
  }

  if (!filePath) process.exit(0);

  // パス区切りを正規化（Windows の \ → /）
  const normalized = filePath.replace(/\\/g, '/');

  for (const pattern of PROTECTED_PATTERNS) {
    if (normalized.includes(pattern)) {
      process.stderr.write(`Blocked: "${filePath}" matches protected pattern "${pattern}"\n`);
      process.exit(2);
    }
  }

  process.exit(0);
});
