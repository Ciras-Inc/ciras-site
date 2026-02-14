import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import { decrypt } from '@/lib/crypto';
import type { SocialAccount } from '@/types';

function createOAuthClient(consumerKey: string, consumerSecret: string) {
  return new OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: 'HMAC-SHA1',
    hash_function(baseString, key) {
      return crypto.createHmac('sha1', key).update(baseString).digest('base64');
    },
  });
}

export async function postToX(
  content: string,
  account: SocialAccount,
  mediaUrl?: string
): Promise<{ id: string } | null> {
  const accessToken = decrypt(account.encrypted_access_token!);
  const accessTokenSecret = decrypt(account.encrypted_access_token_secret!);
  const consumerKey = account.x_api_key || process.env.X_API_KEY!;
  const consumerSecret = account.encrypted_x_api_secret
    ? decrypt(account.encrypted_x_api_secret)
    : process.env.X_API_SECRET!;

  const oauth = createOAuthClient(consumerKey, consumerSecret);
  const token = { key: accessToken, secret: accessTokenSecret };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = { text: content };

  if (mediaUrl) {
    const mediaId = await uploadMediaToX(mediaUrl, oauth, token);
    if (mediaId) {
      body.media = { media_ids: [mediaId] };
    }
  }

  const url = 'https://api.x.com/2/tweets';
  const authHeader = oauth.toHeader(oauth.authorize({ url, method: 'POST' }, token));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('X post failed:', err);
    return null;
  }

  const data = await res.json();
  return { id: data.data.id };
}

async function uploadMediaToX(
  imageUrl: string,
  oauth: OAuth,
  token: { key: string; secret: string }
): Promise<string | null> {
  try {
    const imageRes = await fetch(imageUrl);
    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    const url = 'https://upload.twitter.com/1.1/media/upload.json';
    const authHeader = oauth.toHeader(
      oauth.authorize({ url, method: 'POST' }, token)
    );

    const params = new URLSearchParams();
    params.append('media_data', base64);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      console.error('X media upload failed:', await res.text());
      return null;
    }

    const data = await res.json();
    return data.media_id_string;
  } catch (e) {
    console.error('X media upload error:', e);
    return null;
  }
}

export async function getXRequestToken(): Promise<{
  oauth_token: string;
  oauth_token_secret: string;
}> {
  const oauth = createOAuthClient(process.env.X_API_KEY!, process.env.X_API_SECRET!);
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/x/callback`;

  const url = 'https://api.x.com/oauth/request_token';
  const authHeader = oauth.toHeader(
    oauth.authorize({ url, method: 'POST', data: { oauth_callback: callbackUrl } })
  );

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ oauth_callback: callbackUrl }).toString(),
  });

  const text = await res.text();
  const params = new URLSearchParams(text);
  return {
    oauth_token: params.get('oauth_token')!,
    oauth_token_secret: params.get('oauth_token_secret')!,
  };
}

export async function getXAccessToken(
  oauthToken: string,
  oauthTokenSecret: string,
  oauthVerifier: string
): Promise<{
  oauth_token: string;
  oauth_token_secret: string;
  user_id: string;
  screen_name: string;
}> {
  const oauth = createOAuthClient(process.env.X_API_KEY!, process.env.X_API_SECRET!);
  const token = { key: oauthToken, secret: oauthTokenSecret };

  const url = 'https://api.x.com/oauth/access_token';
  const authHeader = oauth.toHeader(oauth.authorize({ url, method: 'POST' }, token));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ oauth_verifier: oauthVerifier }).toString(),
  });

  const text = await res.text();
  const params = new URLSearchParams(text);
  return {
    oauth_token: params.get('oauth_token')!,
    oauth_token_secret: params.get('oauth_token_secret')!,
    user_id: params.get('user_id')!,
    screen_name: params.get('screen_name')!,
  };
}
