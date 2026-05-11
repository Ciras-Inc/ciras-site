// Pages Functions: /api/instagram
// Worker ciras-ig-refresher が KV (INSTAGRAM_FEED) に書き込んだ最新フィードを返す
// 詳細仕様: docs/ciras-jp-instagram-feed-implementation-v2.md §2

type Env = {
  INSTAGRAM_FEED: KVNamespace;
};

// 許可する Origin（CORS）
const ALLOWED_ORIGINS = new Set<string>([
  'https://ciras.jp',
  'https://www.ciras.jp',
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://ciras.jp';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
  };
}

function jsonResponse(
  body: unknown,
  init: { status?: number; cacheSeconds?: number; request: Request }
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${init.cacheSeconds ?? 300}`,
    ...corsHeaders(init.request),
  };
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // GET / HEAD 以外はメソッド拒否（CORS preflight も不要：単純GET）
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', {
      status: 405,
      headers: { 'Allow': 'GET, HEAD' },
    });
  }

  try {
    const feed = await env.INSTAGRAM_FEED.get('feed:latest', 'json');

    if (!feed || typeof feed !== 'object') {
      return jsonResponse({ posts: [] }, { request });
    }

    return jsonResponse(feed, { request });
  } catch (err) {
    console.error('instagram_api_error', err instanceof Error ? err.message : String(err));
    return jsonResponse(
      { posts: [], error: 'feed unavailable' },
      { status: 500, cacheSeconds: 60, request }
    );
  }
};
