/**
 * 管理画面API認証ミドルウェア
 * /api/admin/* の全リクエストに対してJWT検証を行う
 * ただし /api/admin/login はスキップ
 */

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // ログインAPIはスキップ
  if (url.pathname === '/api/admin/login') {
    return next();
  }

  // Authorization ヘッダーから Bearer トークンを取得
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '認証が必要です。' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verifyJWT(token, env.ADMIN_JWT_SECRET || 'default-secret-change-me');
    // ユーザー情報をcontextに保存
    context.data = context.data || {};
    context.data.admin = payload;
    return next();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'トークンが無効です。再度ログインしてください。' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ===== JWT ユーティリティ =====

export async function createJWT(payload, secret, expiresInHours = 24) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now, exp: now + expiresInHours * 3600 };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(claims));
  const signingInput = encodedHeader + '.' + encodedPayload;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const encodedSig = base64url(signature);

  return signingInput + '.' + encodedSig;
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const [encodedHeader, encodedPayload, encodedSig] = parts;
  const signingInput = encodedHeader + '.' + encodedPayload;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );

  const sigBytes = base64urlDecode(encodedSig);
  const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(signingInput));
  if (!isValid) throw new Error('Invalid signature');

  const payload = JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}

function base64url(input) {
  const str = typeof input === 'string'
    ? btoa(input)
    : btoa(String.fromCharCode(...new Uint8Array(input)));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  const padded = str + '='.repeat((4 - str.length % 4) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}
