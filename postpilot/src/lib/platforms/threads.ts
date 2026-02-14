import { decrypt, encrypt } from '@/lib/crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { SocialAccount } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function createThreadsContainer(
  content: string,
  account: SocialAccount,
  mediaUrl?: string
): Promise<{ id: string } | null> {
  const accessToken = decrypt(account.encrypted_access_token!);
  const userId = account.platform_user_id;

  const url = `https://graph.threads.net/v1.0/${userId}/threads`;
  const params: Record<string, string> = {
    text: content,
    media_type: mediaUrl ? 'IMAGE' : 'TEXT',
    access_token: accessToken,
  };
  if (mediaUrl) {
    params.image_url = mediaUrl;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  if (!res.ok) {
    console.error('Threads container creation failed:', await res.text());
    return null;
  }

  const data = await res.json();
  return { id: data.id };
}

export async function publishThreadsContainer(
  account: SocialAccount,
  containerId: string
): Promise<{ id: string } | null> {
  const accessToken = decrypt(account.encrypted_access_token!);
  const userId = account.platform_user_id;

  const url = `https://graph.threads.net/v1.0/${userId}/threads_publish`;
  const params = {
    creation_id: containerId,
    access_token: accessToken,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  if (!res.ok) {
    console.error('Threads publish failed:', await res.text());
    return null;
  }

  const data = await res.json();
  return { id: data.id };
}

export async function refreshThreadsToken(
  account: SocialAccount,
  dbClient?: SupabaseClient
): Promise<string | null> {
  const client = dbClient || supabaseAdmin;
  const currentToken = decrypt(account.encrypted_access_token!);

  const url = `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${currentToken}`;
  const res = await fetch(url);

  if (!res.ok) {
    console.error('Threads token refresh failed:', await res.text());
    return null;
  }

  const data = await res.json();
  const newToken = data.access_token;
  const expiresIn = data.expires_in;

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  await client
    .from('social_accounts')
    .update({
      encrypted_access_token: encrypt(newToken),
      token_expires_at: expiresAt,
    })
    .eq('id', account.id);

  return newToken;
}

export async function fetchOwnThreadsPosts(
  account: SocialAccount,
  limit: number = 10
): Promise<string[]> {
  const accessToken = decrypt(account.encrypted_access_token!);
  const userId = account.platform_user_id;

  const url = `https://graph.threads.net/v1.0/${userId}/threads?fields=text&limit=${limit}&access_token=${accessToken}`;
  const res = await fetch(url);

  if (!res.ok) {
    console.error('Fetch own threads failed:', await res.text());
    return [];
  }

  const data = await res.json();
  return (data.data || [])
    .map((post: { text?: string }) => post.text || '')
    .filter((text: string) => text.length > 0);
}

export function getThreadsAuthUrl(state: string): string {
  const appId = process.env.THREADS_APP_ID!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/threads/callback`;
  const scope = 'threads_basic,threads_content_publish';

  return `https://threads.net/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${state}`;
}

export async function exchangeThreadsCode(code: string): Promise<{
  accessToken: string;
  userId: string;
}> {
  const shortTokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.THREADS_APP_ID!,
      client_secret: process.env.THREADS_APP_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/threads/callback`,
      code,
    }).toString(),
  });

  const shortData = await shortTokenRes.json();

  const longTokenRes = await fetch(
    `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${process.env.THREADS_APP_SECRET!}&access_token=${shortData.access_token}`,
  );

  const longData = await longTokenRes.json();

  return {
    accessToken: longData.access_token,
    userId: longData.user_id?.toString() || shortData.user_id?.toString(),
  };
}

export async function getThreadsProfile(accessToken: string): Promise<{
  id: string;
  username: string;
}> {
  const res = await fetch(
    `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${accessToken}`
  );
  return res.json();
}
