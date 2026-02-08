/**
 * 管理者ログインAPI
 * POST /api/admin/login
 */
import { createJWT } from './_middleware.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'IDとパスワードを入力してください。' }), { status: 400, headers });
    }

    const DB = env.DB;
    const user = await DB.prepare('SELECT * FROM admin_users WHERE username = ?').bind(username).first();
    if (!user) {
      return new Response(JSON.stringify({ error: 'IDまたはパスワードが正しくありません。' }), { status: 401, headers });
    }

    // パスワード検証（PBKDF2）
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'IDまたはパスワードが正しくありません。' }), { status: 401, headers });
    }

    // JWT 発行
    const secret = env.ADMIN_JWT_SECRET || 'default-secret-change-me';
    const token = await createJWT({ sub: user.id, username: user.username }, secret, 24);

    return new Response(JSON.stringify({ token, username: user.username }), { status: 200, headers });
  } catch (err) {
    console.error('Login error:', err);
    return new Response(JSON.stringify({ error: 'ログインに失敗しました。' }), { status: 500, headers });
  }
}

/**
 * 初期管理者セットアップ
 * POST /api/admin/login?action=setup
 * ※ 管理者が0人の場合のみ実行可能
 */
export async function onRequestGet(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  const headers = { 'Content-Type': 'application/json' };

  if (url.searchParams.get('action') === 'check-setup') {
    const DB = env.DB;
    const count = await DB.prepare('SELECT COUNT(*) as cnt FROM admin_users').first();
    return new Response(JSON.stringify({ needsSetup: count.cnt === 0 }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers });
}

/**
 * 初期管理者作成
 * PUT /api/admin/login
 */
export async function onRequestPut(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  try {
    const DB = env.DB;
    const count = await DB.prepare('SELECT COUNT(*) as cnt FROM admin_users').first();
    if (count.cnt > 0) {
      return new Response(JSON.stringify({ error: '管理者は既に登録されています。' }), { status: 400, headers });
    }

    const { username, password } = await request.json();
    if (!username || !password || password.length < 6) {
      return new Response(JSON.stringify({ error: 'IDと6文字以上のパスワードを入力してください。' }), { status: 400, headers });
    }

    const passwordHash = await hashPassword(password);
    await DB.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').bind(username, passwordHash).run();

    const secret = env.ADMIN_JWT_SECRET || 'default-secret-change-me';
    const user = await DB.prepare('SELECT * FROM admin_users WHERE username = ?').bind(username).first();
    const token = await createJWT({ sub: user.id, username: user.username }, secret, 24);

    return new Response(JSON.stringify({ token, username: user.username }), { status: 200, headers });
  } catch (err) {
    console.error('Setup error:', err);
    return new Response(JSON.stringify({ error: 'セットアップに失敗しました。' }), { status: 500, headers });
  }
}

// ===== パスワードハッシュ (PBKDF2) =====

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return saltHex + ':' + hashHex;
}

async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const computedHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return computedHex === hashHex;
}
