// Ciras Diagnostic Tool - Cloudflare Worker
// Handles API routes for AI/Web diagnosis, admin, and report pages

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Clean URL routing for diagnostic pages
    if (path === '/ai-check') {
      return env.ASSETS.fetch(new Request(new URL('/ai-check.html', url.origin), request));
    }
    if (path === '/web-check') {
      return env.ASSETS.fetch(new Request(new URL('/web-check.html', url.origin), request));
    }
    if (path === '/admin') {
      return env.ASSETS.fetch(new Request(new URL('/admin.html', url.origin), request));
    }

    // API routes
    if (path === '/api/ai-check' && request.method === 'POST') {
      return handleAiCheck(request, env);
    }
    if (path === '/api/web-check' && request.method === 'POST') {
      return handleWebCheck(request, env);
    }
    if (path === '/api/site-check' && request.method === 'POST') {
      return handleSiteCheck(request, env);
    }
    if (path.match(/^\/api\/diagnoses\/[\w-]+\/email$/) && request.method === 'POST') {
      const id = path.split('/')[3];
      return handleAddEmail(request, env, id);
    }
    if (path === '/api/admin/diagnoses' && request.method === 'GET') {
      return withAuth(request, env, () => handleListDiagnoses(env));
    }
    if (path.match(/^\/api\/admin\/diagnoses\/[\w-]+$/) && request.method === 'GET') {
      const id = path.split('/').pop();
      return withAuth(request, env, () => handleGetDiagnosis(env, id));
    }
    if (path.match(/^\/api\/admin\/diagnoses\/[\w-]+$/) && request.method === 'PATCH') {
      const id = path.split('/').pop();
      return withAuth(request, env, () => handleUpdateDiagnosis(request, env, id));
    }

    // Health check endpoint (admin only)
    if (path === '/api/health' && request.method === 'GET') {
      return withAuth(request, env, () => jsonResponse({
        status: 'ok',
        config: {
          anthropic_api_key: env.ANTHROPIC_API_KEY ? 'configured' : 'MISSING',
          admin_password: env.ADMIN_PASSWORD ? 'configured' : 'MISSING',
          kv_diagnoses: env.DIAGNOSES ? 'configured' : 'MISSING'
        }
      }));
    }

    // Report page (dynamically generated)
    if (path.match(/^\/report\/[\w-]+$/)) {
      const id = path.split('/').pop();
      return handleReportPage(env, id);
    }

    // Static assets (fallthrough)
    return env.ASSETS.fetch(request);
  }
};

// ========== Auth ==========

function checkAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  return authHeader.slice(7) === env.ADMIN_PASSWORD;
}

async function withAuth(request, env, handler) {
  if (!checkAuth(request, env)) {
    return jsonResponse({ error: '認証が必要です' }, 401);
  }
  return handler();
}

// ========== AI Check Handler ==========

async function handleAiCheck(request, env) {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not configured');
      return jsonResponse({ error: 'システム設定エラーです。管理者にお問い合わせください。' }, 500);
    }

    const body = await request.json();
    const required = ['q1_position', 'q2_industry', 'q3_employees', 'q4_interests', 'q6_ai_status'];
    for (const field of required) {
      if (!body[field] || (Array.isArray(body[field]) && body[field].length === 0)) {
        return jsonResponse({ error: `${field} は必須です` }, 400);
      }
    }
    if (Array.isArray(body.q4_interests) && body.q4_interests.length > 2) {
      return jsonResponse({ error: 'Q4は最大2つまで選択できます' }, 400);
    }

    const result = await callClaudeAPI(env.ANTHROPIC_API_KEY, buildAiCheckSystemPrompt(), buildAiCheckPrompt(body));
    if (!result.success) {
      return jsonResponse({ error: result.error || 'ただいま診断が混み合っています。しばらくしてからお試しください。' }, 503);
    }

    const id = crypto.randomUUID();
    const diagnosis = {
      id, type: 'ai-check', answers: body, result: result.data,
      email: null, createdAt: new Date().toISOString(), status: 'pending'
    };

    await env.DIAGNOSES.put(`diag:${id}`, JSON.stringify(diagnosis), {
      metadata: { type: 'ai-check', created: diagnosis.createdAt, status: 'pending',
        position: body.q1_position, industry: body.q2_industry }
    });

    return jsonResponse({ id, result: result.data });
  } catch (err) {
    console.error('handleAiCheck error:', err);
    return jsonResponse({ error: 'ただいま診断が混み合っています。しばらくしてからお試しください。' }, 503);
  }
}

// ========== Web Check Handler ==========

async function handleWebCheck(request, env) {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not configured');
      return jsonResponse({ error: 'システム設定エラーです。管理者にお問い合わせください。' }, 500);
    }

    const body = await request.json();
    if (!body.q1_has_website || !body.q3_expectation || !body.q4_current_response) {
      return jsonResponse({ error: '必須項目が入力されていません' }, 400);
    }

    const hasUrl = (body.q1_has_website === 'ある' || body.q1_has_website === 'あるが放置している') && body.q2_url;
    let crawlData = null;
    let scores = null;

    if (hasUrl) {
      // Crawl and score the website
      const crawlResult = await crawlWebsite(body.q2_url);
      if (crawlResult.success) {
        crawlData = crawlResult;
        scores = scoreWebsite(crawlResult);
      }
    }

    // Build prompt based on whether we have URL data
    const systemPrompt = buildWebCheckSystemPrompt(hasUrl && scores);
    const userPrompt = buildWebCheckPrompt(body, scores, crawlData);

    const result = await callClaudeAPI(env.ANTHROPIC_API_KEY, systemPrompt, userPrompt);
    if (!result.success) {
      return jsonResponse({ error: result.error || 'ただいま診断が混み合っています。しばらくしてからお試しください。' }, 503);
    }

    const id = crypto.randomUUID();
    const diagnosis = {
      id, type: 'web-check', answers: body,
      crawlData: crawlData ? { url: crawlData.finalUrl, pageSize: crawlData.pageSize,
        title: crawlData.title, description: crawlData.metaDescription } : null,
      scores: scores, result: result.data,
      email: null, createdAt: new Date().toISOString(), status: 'pending'
    };

    await env.DIAGNOSES.put(`diag:${id}`, JSON.stringify(diagnosis), {
      metadata: { type: 'web-check', created: diagnosis.createdAt, status: 'pending',
        position: body.q3_expectation, industry: body.q2_url || 'サイトなし' }
    });

    return jsonResponse({ id, scores, result: result.data });
  } catch (err) {
    console.error('handleWebCheck error:', err);
    return jsonResponse({ error: 'ただいま診断が混み合っています。しばらくしてからお試しください。' }, 503);
  }
}

// ========== Site Check Handler (URL-only) ==========

async function handleSiteCheck(request, env) {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not configured');
      return jsonResponse({ error: 'システム設定エラーです。管理者にお問い合わせください。' }, 500);
    }

    const body = await request.json();
    if (!body.url || !body.url.trim()) {
      return jsonResponse({ error: 'URLを入力してください' }, 400);
    }

    // Crawl the website
    const crawlResult = await crawlWebsite(body.url);
    if (!crawlResult.success) {
      return jsonResponse({ error: crawlResult.error || 'サイトにアクセスできませんでした。URLが正しいか確認してください。' }, 400);
    }

    // Score the website
    const scores = scoreWebsite(crawlResult);

    // Build AI prompt based on crawl data and scores
    const systemPrompt = buildSiteCheckSystemPrompt();
    const userPrompt = buildSiteCheckPrompt(scores, crawlResult);

    const result = await callClaudeAPI(env.ANTHROPIC_API_KEY, systemPrompt, userPrompt);
    if (!result.success) {
      return jsonResponse({ error: result.error || 'ただいま診断が混み合っています。しばらくしてからお試しください。' }, 503);
    }

    const id = crypto.randomUUID();
    const diagnosis = {
      id, type: 'site-check',
      answers: { url: body.url },
      crawlData: {
        url: crawlResult.finalUrl, pageSize: crawlResult.pageSize,
        title: crawlResult.title, description: crawlResult.metaDescription
      },
      scores: scores, result: result.data,
      email: null, createdAt: new Date().toISOString(), status: 'pending'
    };

    await env.DIAGNOSES.put(`diag:${id}`, JSON.stringify(diagnosis), {
      metadata: {
        type: 'site-check', created: diagnosis.createdAt, status: 'pending',
        position: 'URL診断', industry: body.url
      }
    });

    return jsonResponse({
      id, scores, result: result.data,
      url: crawlResult.finalUrl,
      siteInfo: {
        isHttps: crawlResult.isHttps,
        hasViewport: crawlResult.hasViewport,
        hasJsonLd: crawlResult.hasJsonLd,
        hasFaq: crawlResult.hasFaq,
        hasCompanyInfo: crawlResult.hasCompanyInfo,
        hasAddress: crawlResult.hasAddress,
        hasPhone: crawlResult.hasPhone,
        hasPrice: crawlResult.hasPrice
      }
    });
  } catch (err) {
    console.error('handleSiteCheck error:', err);
    return jsonResponse({ error: 'ただいま診断が混み合っています。しばらくしてからお試しください。' }, 503);
  }
}

// ========== Website Crawling ==========

async function crawlWebsite(inputUrl) {
  try {
    let url = inputUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'CirasWebChecker/1.0 (+https://ciras.jp)' },
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return { success: false, error: 'HTMLではないコンテンツです' };
    }

    const html = await response.text();
    const truncatedHtml = html.substring(0, 500000); // 500KB limit

    return {
      success: true,
      finalUrl: response.url,
      isHttps: response.url.startsWith('https://'),
      html: truncatedHtml,
      pageSize: html.length,
      title: extractTag(truncatedHtml, 'title'),
      metaDescription: extractMetaContent(truncatedHtml, 'description'),
      hasViewport: /meta[^>]*name=["']viewport["']/i.test(truncatedHtml),
      hasJsonLd: /<script[^>]*type=["']application\/ld\+json["']/i.test(truncatedHtml),
      jsonLdTypes: extractJsonLdTypes(truncatedHtml),
      headingStructure: extractHeadings(truncatedHtml),
      hasCanonical: /link[^>]*rel=["']canonical["']/i.test(truncatedHtml),
      internalLinks: countInternalLinks(truncatedHtml, response.url),
      hasFaq: /faq|よくある質問|Q&A|Q＆A/i.test(truncatedHtml),
      hasAddress: /〒|住所|所在地|address/i.test(truncatedHtml),
      hasPrice: /円|料金|価格|price/i.test(truncatedHtml),
      hasPhone: /tel:|電話|TEL/i.test(truncatedHtml),
      hasCompanyInfo: /会社概要|代表|設立|about/i.test(truncatedHtml),
      scriptCount: (truncatedHtml.match(/<script/gi) || []).length,
      stylesheetCount: (truncatedHtml.match(/<link[^>]*stylesheet/gi) || []).length,
      imageCount: (truncatedHtml.match(/<img/gi) || []).length,
      hasAltText: checkAltText(truncatedHtml),
      copyrightYear: extractCopyrightYear(truncatedHtml),
      contentLength: extractTextContent(truncatedHtml).length
    };
  } catch (err) {
    console.error('Crawl error:', err);
    return { success: false, error: err.message || 'クロールに失敗しました' };
  }
}

// HTML parsing helpers
function extractTag(html, tag) {
  const match = html.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

function extractMetaContent(html, name) {
  const match = html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i'));
  return match ? match[1].trim() : '';
}

function extractJsonLdTypes(html) {
  const types = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (data['@type']) types.push(data['@type']);
    } catch (e) { /* ignore parse errors */ }
  }
  return types;
}

function extractHeadings(html) {
  const headings = { h1: 0, h2: 0, h3: 0 };
  headings.h1 = (html.match(/<h1/gi) || []).length;
  headings.h2 = (html.match(/<h2/gi) || []).length;
  headings.h3 = (html.match(/<h3/gi) || []).length;
  return headings;
}

function countInternalLinks(html, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const links = html.match(/<a[^>]*href=["']([^"'#]*?)["']/gi) || [];
    let internal = 0;
    for (const link of links) {
      const href = link.match(/href=["']([^"'#]*?)["']/i);
      if (href && href[1]) {
        try {
          const linkUrl = new URL(href[1], baseUrl);
          if (linkUrl.hostname === base.hostname) internal++;
        } catch (e) { internal++; } // relative links are internal
      }
    }
    return internal;
  } catch (e) { return 0; }
}

function checkAltText(html) {
  const images = html.match(/<img[^>]*>/gi) || [];
  if (images.length === 0) return true;
  const withAlt = images.filter(img => /alt=["'][^"']+["']/i.test(img)).length;
  return withAlt / images.length;
}

function extractCopyrightYear(html) {
  const match = html.match(/©\s*(\d{4})|copyright\s*(\d{4})/i);
  return match ? parseInt(match[1] || match[2]) : null;
}

function extractTextContent(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ========== Website Scoring ==========

function scoreWebsite(crawl) {
  const a = scoreAISearch(crawl);
  const b = scoreSEOBasics(crawl);
  const c = scoreFuture(crawl);
  const total = a.total + b.total + c.total;

  return { totalScore: total, categories: { a, b, c } };
}

function scoreAISearch(c) {
  let clarity = 0; // max 12
  if (c.hasAddress) clarity += 3;
  if (c.hasPrice) clarity += 3;
  if (c.hasPhone) clarity += 2;
  if (c.headingStructure.h1 >= 1) clarity += 2;
  if (c.headingStructure.h2 >= 2) clarity += 2;

  let expertise = 0; // max 10
  if (c.contentLength > 3000) expertise += 4;
  else if (c.contentLength > 1000) expertise += 2;
  if (c.headingStructure.h2 >= 3) expertise += 3;
  if (c.imageCount >= 3) expertise += 3;

  let structured = 0; // max 10
  if (c.hasJsonLd) {
    structured += 5;
    if (c.jsonLdTypes.includes('Organization') || c.jsonLdTypes.includes('LocalBusiness')) structured += 3;
    if (c.jsonLdTypes.includes('FAQPage') || c.jsonLdTypes.includes('Service')) structured += 2;
  }

  let faq = 0; // max 8
  if (c.hasFaq) faq += 8;

  let credibility = 0; // max 10
  if (c.hasCompanyInfo) credibility += 4;
  if (c.hasAddress) credibility += 3;
  if (c.hasPhone) credibility += 3;

  const total = clarity + expertise + structured + faq + credibility;
  return {
    total, maxScore: 50, label: 'AI検索に引用されるための要素',
    details: {
      clarity: { score: clarity, max: 12, label: '情報の明確さ' },
      expertise: { score: expertise, max: 10, label: '専門性・独自性' },
      structured: { score: structured, max: 10, label: '構造化データ' },
      faq: { score: faq, max: 8, label: 'Q&A・FAQ形式' },
      credibility: { score: credibility, max: 10, label: '信頼性の証明' }
    }
  };
}

function scoreSEOBasics(c) {
  let mobile = 0; // max 10
  if (c.hasViewport) mobile += 10;

  let speed = 0; // max 10
  if (c.pageSize < 200000) speed += 5;
  else if (c.pageSize < 500000) speed += 3;
  if (c.scriptCount <= 5) speed += 3;
  else if (c.scriptCount <= 10) speed += 1;
  if (c.imageCount <= 20) speed += 2;

  let titleDesc = 0; // max 10
  if (c.title) {
    titleDesc += 3;
    if (c.title.length >= 10 && c.title.length <= 60) titleDesc += 2;
  }
  if (c.metaDescription) {
    titleDesc += 3;
    if (c.metaDescription.length >= 50 && c.metaDescription.length <= 160) titleDesc += 2;
  }

  let security = 0; // max 5
  if (c.isHttps) security += 5;

  const total = mobile + speed + titleDesc + security;
  return {
    total, maxScore: 35, label: '従来SEOとして最低限必要な要素',
    details: {
      mobile: { score: mobile, max: 10, label: 'モバイル対応' },
      speed: { score: speed, max: 10, label: '表示速度（推定）' },
      titleDesc: { score: titleDesc, max: 10, label: 'タイトル・説明文' },
      security: { score: security, max: 5, label: 'セキュリティ' }
    }
  };
}

function scoreFuture(c) {
  let freshness = 0; // max 8
  const currentYear = new Date().getFullYear();
  if (c.copyrightYear) {
    if (c.copyrightYear >= currentYear) freshness += 5;
    else if (c.copyrightYear >= currentYear - 1) freshness += 3;
    else if (c.copyrightYear >= currentYear - 2) freshness += 1;
  }
  if (c.hasCanonical) freshness += 3;

  let breadth = 0; // max 7
  if (c.internalLinks >= 15) breadth += 4;
  else if (c.internalLinks >= 8) breadth += 3;
  else if (c.internalLinks >= 3) breadth += 1;
  if (c.hasFaq) breadth += 2;
  if (c.hasCompanyInfo) breadth += 1;

  const total = freshness + breadth;
  return {
    total, maxScore: 15, label: '将来を見据えた評価',
    details: {
      freshness: { score: freshness, max: 8, label: '更新性' },
      breadth: { score: breadth, max: 7, label: 'コンテンツの網羅性' }
    }
  };
}

// ========== Email Handler ==========

async function handleAddEmail(request, env, id) {
  try {
    const body = await request.json();
    if (!body.email || !body.email.includes('@')) {
      return jsonResponse({ error: '有効なメールアドレスを入力してください' }, 400);
    }

    const raw = await env.DIAGNOSES.get(`diag:${id}`);
    if (!raw) return jsonResponse({ error: '診断結果が見つかりません' }, 404);

    const diagnosis = JSON.parse(raw);
    diagnosis.email = body.email;

    const meta = {
      type: diagnosis.type, created: diagnosis.createdAt,
      status: diagnosis.status, email: body.email
    };
    if (diagnosis.type === 'ai-check') {
      meta.position = diagnosis.answers.q1_position;
      meta.industry = diagnosis.answers.q2_industry;
    } else {
      meta.position = diagnosis.answers.q3_expectation;
      meta.industry = diagnosis.answers.q2_url || 'サイトなし';
    }

    await env.DIAGNOSES.put(`diag:${id}`, JSON.stringify(diagnosis), { metadata: meta });
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('handleAddEmail error:', err);
    return jsonResponse({ error: 'メールアドレスの保存に失敗しました' }, 500);
  }
}

// ========== Admin Handlers ==========

async function handleListDiagnoses(env) {
  try {
    const list = await env.DIAGNOSES.list({ prefix: 'diag:' });
    const diagnoses = list.keys.map(key => ({
      id: key.name.replace('diag:', ''), ...key.metadata
    }));
    diagnoses.sort((a, b) => new Date(b.created) - new Date(a.created));
    return jsonResponse({ diagnoses });
  } catch (err) {
    console.error('handleListDiagnoses error:', err);
    return jsonResponse({ error: '一覧の取得に失敗しました' }, 500);
  }
}

async function handleGetDiagnosis(env, id) {
  try {
    const raw = await env.DIAGNOSES.get(`diag:${id}`);
    if (!raw) return jsonResponse({ error: '診断結果が見つかりません' }, 404);
    return jsonResponse(JSON.parse(raw));
  } catch (err) {
    console.error('handleGetDiagnosis error:', err);
    return jsonResponse({ error: '診断結果の取得に失敗しました' }, 500);
  }
}

async function handleUpdateDiagnosis(request, env, id) {
  try {
    const body = await request.json();
    const raw = await env.DIAGNOSES.get(`diag:${id}`);
    if (!raw) return jsonResponse({ error: '診断結果が見つかりません' }, 404);

    const diagnosis = JSON.parse(raw);
    if (body.status) diagnosis.status = body.status;
    if (body.reportContent !== undefined) diagnosis.reportContent = body.reportContent;

    const meta = {
      type: diagnosis.type, created: diagnosis.createdAt,
      status: diagnosis.status, email: diagnosis.email || undefined
    };
    if (diagnosis.type === 'ai-check') {
      meta.position = diagnosis.answers.q1_position;
      meta.industry = diagnosis.answers.q2_industry;
    } else {
      meta.position = diagnosis.answers.q3_expectation;
      meta.industry = diagnosis.answers.q2_url || 'サイトなし';
    }

    await env.DIAGNOSES.put(`diag:${id}`, JSON.stringify(diagnosis), { metadata: meta });
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('handleUpdateDiagnosis error:', err);
    return jsonResponse({ error: '更新に失敗しました' }, 500);
  }
}

// ========== Report Page ==========

async function handleReportPage(env, id) {
  try {
    const raw = await env.DIAGNOSES.get(`diag:${id}`);
    if (!raw) {
      return new Response(generateNotFoundHTML(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const diagnosis = JSON.parse(raw);
    const html = (diagnosis.type === 'web-check' || diagnosis.type === 'site-check') ? generateWebCheckReportHTML(diagnosis) : generateAiCheckReportHTML(diagnosis);
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (err) {
    console.error('handleReportPage error:', err);
    return new Response(generateErrorHTML(), { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

// ========== Claude API ==========

async function callClaudeAPI(apiKey, systemPrompt, userPrompt) {
  try {
    console.log('Calling Claude API with model:', CLAUDE_MODEL);
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL, max_tokens: 2048,
        system: systemPrompt, messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Claude API error: status=${response.status}, body=${errorBody}`);
      if (response.status === 401) {
        return { success: false, error: 'APIキーが無効です。管理者にお問い合わせください。' };
      }
      if (response.status === 429) {
        return { success: false, error: 'ただいまアクセスが集中しています。1分ほど待ってから再度お試しください。' };
      }
      if (response.status === 529 || response.status === 503) {
        return { success: false, error: 'AIサービスが一時的に混み合っています。しばらくしてからお試しください。' };
      }
      return { success: false, error: `診断処理中にエラーが発生しました（${response.status}）。しばらくしてからお試しください。` };
    }

    const data = await response.json();
    const text = data.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to parse Claude response:', text);
      return { success: false, error: '診断結果の生成に失敗しました。再度お試しください。' };
    }

    return { success: true, data: JSON.parse(jsonMatch[0]) };
  } catch (err) {
    console.error('Claude API call failed:', err);
    return { success: false, error: '診断処理中にエラーが発生しました。しばらくしてからお試しください。' };
  }
}

// ========== AI Check Prompts ==========

function buildAiCheckSystemPrompt() {
  return `あなたはCiras株式会社のAIコンサルタントです。中小企業の経営者や担当者に対して、AI活用の具体的な提案を行います。

提案のルールを必ず守ってください：
1. 回答者の「立場」「業種」「従業員数」に合わせた、その人だけに刺さる提案にすること。ありきたりな一般論は禁止。
2. 専門用語・専門ツール名は絶対に使わないこと（例：「RPA」→「パソコン作業の自動化」、「ChatGPT」→「AIチャット」、「CRM」→「お客様管理」）。
3. 「before」は回答者が実際に経験していそうな具体的な場面を書くこと（共感ではなく、本人の日常を描写する）。
4. 「after」はAIを使った後の変化を、数字や時間で具体的に書くこと（例：「2時間→15分」「月末3日→半日」）。
5. 「point」はこの提案の一番のメリットを1行で書くこと。
6. できないことを「できる」と言わないこと。AIの限界も正直に伝えること。
7. 回答は必ず以下のJSON形式のみで出力すること。JSON以外のテキストは含めないこと。

出力形式：
{
  "solutions": [
    {
      "title": "提案タイトル（1行、その人の業務に直結する具体的な内容）",
      "point": "この提案の一番のメリット（1行、数字を含めて）",
      "before": "今の状態（1〜2行。回答者が「まさにそれ！」と思う日常の場面を描写）",
      "after": "AIを使った後（1〜2行。具体的な数字・時間の変化を含めて）"
    }
  ]
}`;
}

function buildAiCheckPrompt(answers) {
  const positionContext = {
    '経営者・役員': '経営判断・ROI・戦略的視点から提案してください。投資対効果や競争優位性を重視してください。',
    '管理職・マネージャー': 'チーム運営・業務改善・部門成果の視点から提案してください。現場で実行しやすい方法を重視してください。',
    '一般社員・スタッフ': '日々の業務改善・スキルアップの視点から提案してください。個人レベルで始められることを重視してください。',
    '個人事業主': '一人で始められる・低コストの視点から提案してください。少ないリソースで最大効果を出す方法を重視してください。'
  };
  const aiLevelContext = {
    'まだ使っていない': '初歩的な導入提案をしてください。最初の一歩として取り組みやすいものから提案してください。',
    '個人的に試している程度': '業務への本格導入に向けた提案をしてください。個人利用から組織利用へのステップを含めてください。',
    '一部の業務で使っている': '活用範囲の拡大や、既存活用の改善・効率化を提案してください。',
    '組織的に活用している': '高度な活用や最適化の提案をしてください。他社との差別化につながる活用法を含めてください。'
  };

  let prompt = `以下のアンケート回答に基づいて、この方のビジネスに合った具体的なAI活用の解決案を5つ提案してください。

【回答者の情報】
- 立場: ${answers.q1_position}
- 業種: ${answers.q2_industry}${answers.q2_industry_other ? `（${answers.q2_industry_other}）` : ''}
- 従業員数: ${answers.q3_employees}
- AI活用の興味分野: ${answers.q4_interests.join('、')}
- 現在のAI活用状況: ${answers.q6_ai_status}`;

  if (answers.q5_details && answers.q5_details.trim()) {
    prompt += `\n- 具体的な課題・状況: ${answers.q5_details}`;
    prompt += `\n\n※自由記述の内容を最優先で考慮し、この課題に直結する提案を中心にしてください。`;
  }

  prompt += `\n\n【提案の視点】\n${positionContext[answers.q1_position] || ''}`;
  prompt += `\n\n【提案のレベル】\n${aiLevelContext[answers.q6_ai_status] || ''}`;
  prompt += `\n\n【重要な注意】`;
  prompt += `\n- 「${answers.q2_industry}」の「${answers.q1_position}」が日常的に経験する具体的な場面をbeforeに書くこと`;
  prompt += `\n- 「AIツール」「チャットボット」のような曖昧な表現ではなく、何をどう変えるか具体的に書くこと`;
  prompt += `\n- 専門用語やツール名は絶対に使わず、誰でもわかる言葉で書くこと`;
  prompt += `\n\n興味分野（${answers.q4_interests.join('、')}）に直結する提案を5つ出力してください。`;
  return prompt;
}

// ========== Web Check Prompts ==========

function buildWebCheckSystemPrompt(hasScores) {
  if (hasScores) {
    return `あなたはCiras株式会社のWeb・AI検索コンサルタントです。クライアントのWebサイト診断結果に基づいて、改善提案を行います。

提案のルールを必ず守ってください：
1. 回答者の「期待すること」「問い合わせ状況」「気になること」に合わせた、その人だけに刺さる提案にすること。ありきたりな一般論は禁止。
2. 専門用語は絶対に使わないこと（例：「構造化データ」→「AIが読み取りやすい情報の整理」、「SEO」→「検索での見つかりやすさ」、「JSON-LD」→「会社情報の整理タグ」）。
3. 「before」は回答者のサイトで実際に起きていそうな具体的な問題を書くこと（診断スコアの低い項目を根拠に）。
4. 「after」はWebサイトを改善した後の変化を、具体的に書くこと（例：「お客様が検索したとき、御社の正しい情報が表示される」）。
5. 「point」はこの改善の一番のメリットを1行で書くこと。
6. できないことを「できる」と言わないこと。
7. 回答は必ず以下のJSON形式のみで出力すること。JSON以外のテキストは含めないこと。

出力形式：
{
  "solutions": [
    {
      "title": "改善ポイントのタイトル（1行、サイトの課題に直結する具体的な内容）",
      "point": "この改善の一番のメリット（1行）",
      "before": "今の状態（1〜2行。診断スコアの低い項目を根拠に、具体的な問題を描写）",
      "after": "改善した後（1〜2行。具体的な変化を含めて）"
    }
  ]
}

重要度の高い順に3つの改善ポイントを出力してください。`;
  }

  return `あなたはCiras株式会社のWeb・AI検索コンサルタントです。Webサイトを持っていない、または放置しているクライアントに対して、Webサイトの必要性と最適な形を提案します。

提案のルールを必ず守ってください：
1. 回答者の「期待すること」「問い合わせ状況」に合わせた、その人だけに刺さる提案にすること。ありきたりな一般論は禁止。
2. 専門用語は絶対に使わないこと。
3. 「before」はWebサイトがない・放置している今の状態で起きている具体的な問題を書くこと。
4. 「after」はWebサイトを作った・改善した後の具体的な変化を書くこと。
5. 「point」はこの提案の一番のメリットを1行で書くこと。
6. 押し売りにならない、事実に基づいた提案にすること。
7. 回答は必ず以下のJSON形式のみで出力すること。JSON以外のテキストは含めないこと。

出力形式：
{
  "solutions": [
    {
      "title": "提案タイトル（1行、相手の状況に直結する具体的な内容）",
      "point": "この提案の一番のメリット（1行）",
      "before": "今の状態（1〜2行。Webサイトがないことで起きている具体的な問題を描写）",
      "after": "Webサイトを作ると（1〜2行。具体的な変化を含めて）"
    }
  ]
}

3つの提案を出力してください。`;
}

function buildWebCheckPrompt(answers, scores, crawlData) {
  let prompt = `以下のアンケート回答に基づいて、この方に合った具体的なWebサイト改善（または新規制作）の提案をしてください。

【回答者の情報】
- Webサイトの有無: ${answers.q1_has_website}`;

  if (answers.q2_url) {
    prompt += `\n- サイトURL: ${answers.q2_url}`;
  }
  prompt += `\n- Webサイトに期待すること: ${answers.q3_expectation}${answers.q3_expectation_other ? `（${answers.q3_expectation_other}）` : ''}`;
  prompt += `\n- 現在の問い合わせ状況: ${answers.q4_current_response}`;
  if (answers.q5_concerns && answers.q5_concerns.trim()) {
    prompt += `\n- 気になっていること: ${answers.q5_concerns}`;
    prompt += `\n\n※自由記述の内容を最優先で考慮し、この課題に直結する提案を中心にしてください。`;
  }

  if (scores) {
    prompt += `\n\n【自動分析スコア】（100点満点中 ${scores.totalScore}点）`;
    prompt += `\nA. AI検索対応: ${scores.categories.a.total}/${scores.categories.a.maxScore}点`;
    for (const [, d] of Object.entries(scores.categories.a.details)) {
      prompt += `\n  - ${d.label}: ${d.score}/${d.max}`;
    }
    prompt += `\nB. SEO基礎: ${scores.categories.b.total}/${scores.categories.b.maxScore}点`;
    for (const [, d] of Object.entries(scores.categories.b.details)) {
      prompt += `\n  - ${d.label}: ${d.score}/${d.max}`;
    }
    prompt += `\nC. 将来性: ${scores.categories.c.total}/${scores.categories.c.maxScore}点`;
    for (const [, d] of Object.entries(scores.categories.c.details)) {
      prompt += `\n  - ${d.label}: ${d.score}/${d.max}`;
    }

    if (crawlData) {
      prompt += `\n\n【サイト情報】`;
      prompt += `\n- ページタイトル: ${crawlData.title || 'なし'}`;
      prompt += `\n- メタ説明文: ${crawlData.metaDescription || 'なし'}`;
      prompt += `\n- HTTPS: ${crawlData.isHttps ? 'あり' : 'なし'}`;
      prompt += `\n- 構造化データ(JSON-LD): ${crawlData.hasJsonLd ? 'あり（' + crawlData.jsonLdTypes.join(', ') + '）' : 'なし'}`;
      prompt += `\n- FAQ: ${crawlData.hasFaq ? 'あり' : 'なし'}`;
      prompt += `\n- viewport(モバイル対応): ${crawlData.hasViewport ? 'あり' : 'なし'}`;
    }

    prompt += `\n\n【重要な注意】`;
    prompt += `\n- スコアが低い項目を優先的に改善提案すること`;
    prompt += `\n- 「${answers.q3_expectation}」を期待していることを踏まえた提案にすること`;
    prompt += `\n- 専門用語は絶対に使わず、誰でもわかる言葉で書くこと`;
    prompt += `\n- 「before」にはスコアの低い項目を根拠に、今起きている具体的な問題を書くこと`;
    prompt += `\n- 「after」には改善後の具体的な変化を書くこと`;
    prompt += `\n\n重要度の高い順に3つの改善ポイントを出力してください。`;
  } else {
    prompt += `\n\nこのクライアントはWebサイトを${answers.q1_has_website === '持っていない' ? '持っていません' : '持っていますが放置しています'}。`;
    prompt += `\n\n【重要な注意】`;
    prompt += `\n- 「${answers.q3_expectation}」を期待していることを踏まえた提案にすること`;
    prompt += `\n- 問い合わせが「${answers.q4_current_response}」であることを考慮すること`;
    prompt += `\n- 専門用語は絶対に使わず、誰でもわかる言葉で書くこと`;
    prompt += `\n- 「before」にはWebサイトがない・放置していることで今起きている問題を具体的に書くこと`;
    prompt += `\n- 「after」にはWebサイトを作った・改善した後の具体的な変化を書くこと`;
    prompt += `\n\n3つの提案を出力してください。`;
  }

  return prompt;
}

// ========== Site Check Prompts (URL-only) ==========

function buildSiteCheckSystemPrompt() {
  return `あなたはCiras株式会社のWeb・AI検索コンサルタントです。クライアントのWebサイトを自動分析した結果に基づいて、改善提案を行います。

提案のルールを必ず守ってください：
1. 診断スコアの低い項目を優先的に、具体的で実行可能な改善提案をすること。ありきたりな一般論は禁止。
2. 専門用語は絶対に使わないこと（例：「構造化データ」→「AIが読み取りやすい情報の整理」、「SEO」→「検索での見つかりやすさ」、「JSON-LD」→「会社情報の整理タグ」、「viewport」→「スマホ表示の設定」）。
3. 「before」はサイトで実際に起きている具体的な問題を書くこと（診断スコアの低い項目を根拠に）。
4. 「after」はWebサイトを改善した後の変化を、具体的に書くこと（例：「お客様が検索したとき、御社の正しい情報が表示される」）。
5. 「point」はこの改善の一番のメリットを1行で書くこと。
6. できないことを「できる」と言わないこと。
7. 回答は必ず以下のJSON形式のみで出力すること。JSON以外のテキストは含めないこと。

出力形式：
{
  "solutions": [
    {
      "title": "改善ポイントのタイトル（1行、サイトの課題に直結する具体的な内容）",
      "point": "この改善の一番のメリット（1行）",
      "before": "今の状態（1〜2行。診断スコアの低い項目を根拠に、具体的な問題を描写）",
      "after": "改善した後（1〜2行。具体的な変化を含めて）"
    }
  ]
}

重要度の高い順に3つの改善ポイントを出力してください。`;
}

function buildSiteCheckPrompt(scores, crawlData) {
  let prompt = `以下のWebサイト自動分析結果に基づいて、具体的な改善提案をしてください。

【分析対象サイト】
- URL: ${crawlData.finalUrl}
- ページタイトル: ${crawlData.title || 'なし'}
- メタ説明文: ${crawlData.metaDescription || 'なし'}

【自動分析スコア】（100点満点中 ${scores.totalScore}点）
A. AI検索対応: ${scores.categories.a.total}/${scores.categories.a.maxScore}点`;
  for (const [, d] of Object.entries(scores.categories.a.details)) {
    prompt += `\n  - ${d.label}: ${d.score}/${d.max}`;
  }
  prompt += `\nB. SEO基礎: ${scores.categories.b.total}/${scores.categories.b.maxScore}点`;
  for (const [, d] of Object.entries(scores.categories.b.details)) {
    prompt += `\n  - ${d.label}: ${d.score}/${d.max}`;
  }
  prompt += `\nC. 将来性: ${scores.categories.c.total}/${scores.categories.c.maxScore}点`;
  for (const [, d] of Object.entries(scores.categories.c.details)) {
    prompt += `\n  - ${d.label}: ${d.score}/${d.max}`;
  }

  prompt += `\n\n【サイト情報】`;
  prompt += `\n- HTTPS: ${crawlData.isHttps ? 'あり' : 'なし'}`;
  prompt += `\n- スマホ対応(viewport): ${crawlData.hasViewport ? 'あり' : 'なし'}`;
  prompt += `\n- 構造化データ(JSON-LD): ${crawlData.hasJsonLd ? 'あり（' + crawlData.jsonLdTypes.join(', ') + '）' : 'なし'}`;
  prompt += `\n- FAQ: ${crawlData.hasFaq ? 'あり' : 'なし'}`;
  prompt += `\n- 会社概要: ${crawlData.hasCompanyInfo ? 'あり' : 'なし'}`;
  prompt += `\n- 住所: ${crawlData.hasAddress ? 'あり' : 'なし'}`;
  prompt += `\n- 電話番号: ${crawlData.hasPhone ? 'あり' : 'なし'}`;
  prompt += `\n- 料金情報: ${crawlData.hasPrice ? 'あり' : 'なし'}`;
  prompt += `\n- 画像数: ${crawlData.imageCount}`;
  prompt += `\n- 内部リンク数: ${crawlData.internalLinks}`;
  prompt += `\n- テキスト量: 約${crawlData.contentLength}文字`;

  prompt += `\n\n【重要な注意】`;
  prompt += `\n- スコアが低い項目を優先的に改善提案すること`;
  prompt += `\n- 専門用語は絶対に使わず、誰でもわかる言葉で書くこと`;
  prompt += `\n- 「before」にはスコアの低い項目を根拠に、今起きている具体的な問題を書くこと`;
  prompt += `\n- 「after」には改善後の具体的な変化を書くこと`;
  prompt += `\n\n重要度の高い順に3つの改善ポイントを出力してください。`;

  return prompt;
}

// ========== Report HTML Generators ==========

const REPORT_HEAD = `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" href="/images/favicon.ico" sizes="any">
  <link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&family=Shippori+Mincho:wght@400;500;600;700&display=swap" rel="stylesheet">`;

const REPORT_STYLES = `<style>
    :root{--green:#2D5A27;--green-light:#E8F0E6;--black:#1A1A1A;--gray-dark:#4A4A4A;--gray:#888;--gray-light:#E5E5E5;--white:#FFF;--bg:#FAFAFA}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Noto Sans JP',sans-serif;font-weight:400;color:var(--black);line-height:1.9;background:var(--bg);font-size:15px;letter-spacing:.03em}
    .mincho{font-family:'Shippori Mincho',serif}
    a{color:inherit;text-decoration:none}
    .report-header{background:var(--green);color:var(--white);padding:3rem 2rem;text-align:center}
    .report-header-inner{max-width:800px;margin:0 auto}
    .report-logo{height:28px;margin-bottom:1.5rem}
    .report-label{font-size:.75rem;letter-spacing:.2em;opacity:.8;margin-bottom:.5rem}
    .report-title{font-family:'Shippori Mincho',serif;font-size:clamp(1.5rem,3vw,2rem);font-weight:600;margin-bottom:.5rem}
    .report-date{font-size:.85rem;opacity:.8}
    .report-body{max-width:800px;margin:0 auto;padding:3rem 2rem}
    .report-section{margin-bottom:3rem}
    .report-section-title{font-family:'Shippori Mincho',serif;font-size:1.2rem;font-weight:600;color:var(--green);margin-bottom:1.5rem;padding-bottom:.5rem;border-bottom:2px solid var(--green-light)}
    .answer-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1rem}
    .answer-item{background:var(--white);padding:1.2rem;border-radius:4px;border:1px solid var(--gray-light)}
    .answer-label{font-size:.75rem;color:var(--gray);margin-bottom:.3rem}
    .answer-value{font-size:.9rem;font-weight:500}
    .solution-card{background:var(--white);padding:2rem;border-radius:4px;margin-bottom:1.5rem;border-left:4px solid var(--green)}
    .solution-num{font-family:'Shippori Mincho',serif;font-size:.8rem;font-weight:600;color:var(--green);margin-bottom:.5rem}
    .solution-title{font-family:'Shippori Mincho',serif;font-size:1.1rem;font-weight:600;margin-bottom:.8rem}
    .solution-desc{font-size:.9rem;color:var(--gray-dark);line-height:2;white-space:pre-line}
    .score-hero{text-align:center;padding:2rem;background:var(--white);border-radius:4px;margin-bottom:2rem;border:1px solid var(--gray-light)}
    .score-num{font-family:'Shippori Mincho',serif;font-size:4rem;font-weight:700;color:var(--green)}
    .score-max{font-size:1.2rem;color:var(--gray)}
    .score-bar-wrap{margin-bottom:1rem}
    .score-bar-label{display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:.3rem}
    .score-bar{height:8px;background:var(--gray-light);border-radius:4px;overflow:hidden}
    .score-bar-fill{height:100%;background:var(--green);border-radius:4px}
    .improvement-card{background:var(--white);padding:2rem;border-radius:4px;margin-bottom:1.5rem;border:1px solid var(--gray-light)}
    .improvement-title{font-family:'Shippori Mincho',serif;font-size:1.1rem;font-weight:600;margin-bottom:1rem;color:var(--green)}
    .improvement-section{margin-bottom:.8rem}
    .improvement-label{font-size:.75rem;font-weight:600;margin-bottom:.2rem}
    .improvement-label-good{color:var(--green)}
    .improvement-label-risk{color:#B8860B}
    .improvement-label-action{color:#C41E3A}
    .improvement-text{font-size:.9rem;color:var(--gray-dark);line-height:1.9}
    .report-cta{background:var(--green-light);padding:3rem 2rem;text-align:center}
    .report-cta-inner{max-width:600px;margin:0 auto}
    .report-cta-title{font-family:'Shippori Mincho',serif;font-size:1.3rem;font-weight:600;margin-bottom:1rem}
    .report-cta-text{font-size:.9rem;color:var(--gray-dark);line-height:2;margin-bottom:1.5rem}
    .btn{display:inline-block;font-size:.9rem;font-weight:500;padding:1rem 2rem;border-radius:2px;transition:all .3s}
    .btn-primary{background:var(--green);color:var(--white)}
    .btn-primary:hover{opacity:.85}
    .btn-secondary{background:var(--white);color:var(--green);border:1px solid var(--green);margin-left:.5rem}
    .btn-secondary:hover{background:var(--green-light)}
    .report-footer{background:var(--black);color:var(--white);padding:2rem;text-align:center;font-size:.8rem;opacity:.7}
    @media(max-width:600px){.answer-grid{grid-template-columns:1fr}.btn{display:block;margin-bottom:.5rem}.btn-secondary{margin-left:0}}
  </style>`;

function generateAiCheckReportHTML(diagnosis) {
  const a = diagnosis.answers;
  const r = diagnosis.result;
  const date = new Date(diagnosis.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

  const solutionsHTML = r.solutions.map((s, i) => `
        <div class="solution-card">
          <div class="solution-num">${String(i + 1).padStart(2, '0')}</div>
          <h3 class="solution-title">${escapeHTML(s.title)}</h3>
          ${s.point ? `<p style="font-weight:600;color:#2D5A27;background:#E8F0E6;padding:.6rem 1rem;border-radius:4px;margin-bottom:1rem;font-size:.95rem">${escapeHTML(s.point)}</p>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-radius:6px;overflow:hidden;border:1px solid #E5E5E5">
            <div style="background:#FFF5F5;padding:1.2rem 1.5rem;border-right:1px solid #E5E5E5">
              <p style="font-size:.75rem;font-weight:700;color:#C41E3A;margin-bottom:.4rem">&#x2716; 今の状態</p>
              <p style="font-size:.9rem;color:#4A4A4A;line-height:1.8">${escapeHTML(s.before || s.description || '')}</p>
            </div>
            <div style="background:#F0FFF0;padding:1.2rem 1.5rem">
              <p style="font-size:.75rem;font-weight:700;color:#2D5A27;margin-bottom:.4rem">&#x2714; AIを使うと</p>
              <p style="font-size:.9rem;color:#4A4A4A;line-height:1.8">${escapeHTML(s.after || '')}</p>
            </div>
          </div>
        </div>`).join('');

  return `<!DOCTYPE html><html lang="ja"><head>
  <title>AI活用レベルチェック 診断レポート｜Ciras株式会社</title>
  ${REPORT_HEAD}${REPORT_STYLES}
</head><body>
  <header class="report-header"><div class="report-header-inner">
    <img src="/images/logo-white.png" alt="Ciras株式会社" class="report-logo">
    <p class="report-label">DIAGNOSTIC REPORT</p>
    <h1 class="report-title">AI活用レベルチェック 診断レポート</h1>
    <p class="report-date">${escapeHTML(date)}</p>
  </div></header>
  <main class="report-body">
    <section class="report-section">
      <h2 class="report-section-title">回答内容</h2>
      <div class="answer-grid">
        <div class="answer-item"><p class="answer-label">立場</p><p class="answer-value">${escapeHTML(a.q1_position)}</p></div>
        <div class="answer-item"><p class="answer-label">業種</p><p class="answer-value">${escapeHTML(a.q2_industry)}</p></div>
        <div class="answer-item"><p class="answer-label">従業員数</p><p class="answer-value">${escapeHTML(a.q3_employees)}</p></div>
        <div class="answer-item"><p class="answer-label">AI活用状況</p><p class="answer-value">${escapeHTML(a.q6_ai_status)}</p></div>
      </div>
      <div style="margin-top:1rem"><div class="answer-item"><p class="answer-label">興味分野</p><p class="answer-value">${escapeHTML(a.q4_interests.join('、'))}</p></div></div>
      ${a.q5_details ? `<div style="margin-top:1rem"><div class="answer-item"><p class="answer-label">詳細</p><p class="answer-value">${escapeHTML(a.q5_details)}</p></div></div>` : ''}
    </section>
    <section class="report-section">
      <h2 class="report-section-title">AIが提案する5つの解決案</h2>
      ${solutionsHTML}
    </section>
  </main>
  <section class="report-cta"><div class="report-cta-inner">
    <h2 class="report-cta-title mincho">この診断結果について、詳しく相談しませんか？</h2>
    <p class="report-cta-text">Ciras株式会社では、月額33,000円のAI顧問サービスで、<br>御社に合ったAI活用を一緒に考え、実行まで伴走します。</p>
    <a href="/contact.html" class="btn btn-primary">無料相談する</a>
    <a href="https://lin.ee/s2u6VUw" class="btn btn-secondary">LINEで相談</a>
  </div></section>
  <footer class="report-footer"><p>&copy; 2026 Ciras Inc.（シラス株式会社）</p></footer>
</body></html>`;
}

function generateWebCheckReportHTML(diagnosis) {
  const a = diagnosis.answers;
  const r = diagnosis.result;
  const s = diagnosis.scores;
  const date = new Date(diagnosis.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

  let contentHTML = '';
  if (s) {
    // With scores
    contentHTML += `<section class="report-section">
      <h2 class="report-section-title">総合スコア</h2>
      <div class="score-hero"><p class="score-num">${s.totalScore}<span class="score-max"> / 100</span></p></div>`;
    for (const cat of [s.categories.a, s.categories.b, s.categories.c]) {
      const pct = Math.round(cat.total / cat.maxScore * 100);
      contentHTML += `<div class="score-bar-wrap"><div class="score-bar-label"><span>${escapeHTML(cat.label)}</span><span>${cat.total} / ${cat.maxScore}</span></div><div class="score-bar"><div class="score-bar-fill" style="width:${pct}%"></div></div></div>`;
    }
    contentHTML += `</section>`;
  }

  // Solutions (both URL and no-URL mode now use solutions format)
  if (r.solutions && r.solutions.length > 0) {
    contentHTML += `<section class="report-section"><h2 class="report-section-title">${s ? 'AIが提案する改善ポイント' : 'AIが提案するWebサイトプラン'}</h2>`;
    r.solutions.forEach((sol, i) => {
      contentHTML += `
        <div class="solution-card">
          <div class="solution-num">${String(i + 1).padStart(2, '0')}</div>
          <h3 class="solution-title">${escapeHTML(sol.title)}</h3>
          ${sol.point ? `<p style="font-weight:600;color:#2D5A27;background:#E8F0E6;padding:.6rem 1rem;border-radius:4px;margin-bottom:1rem;font-size:.95rem">${escapeHTML(sol.point)}</p>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-radius:6px;overflow:hidden;border:1px solid #E5E5E5">
            <div style="background:#FFF5F5;padding:1.2rem 1.5rem;border-right:1px solid #E5E5E5">
              <p style="font-size:.75rem;font-weight:700;color:#C41E3A;margin-bottom:.4rem">&#x2716; 今の状態</p>
              <p style="font-size:.9rem;color:#4A4A4A;line-height:1.8">${escapeHTML(sol.before || '')}</p>
            </div>
            <div style="background:#F0FFF0;padding:1.2rem 1.5rem">
              <p style="font-size:.75rem;font-weight:700;color:#2D5A27;margin-bottom:.4rem">&#x2714; 改善すると</p>
              <p style="font-size:.9rem;color:#4A4A4A;line-height:1.8">${escapeHTML(sol.after || '')}</p>
            </div>
          </div>
        </div>`;
    });
    contentHTML += `</section>`;
  }

  return `<!DOCTYPE html><html lang="ja"><head>
  <title>Webサイト状況チェック 診断レポート｜Ciras株式会社</title>
  ${REPORT_HEAD}${REPORT_STYLES}
</head><body>
  <header class="report-header"><div class="report-header-inner">
    <img src="/images/logo-white.png" alt="Ciras株式会社" class="report-logo">
    <p class="report-label">DIAGNOSTIC REPORT</p>
    <h1 class="report-title">Webサイト状況チェック 診断レポート</h1>
    <p class="report-date">${escapeHTML(date)}</p>
  </div></header>
  <main class="report-body">
    <section class="report-section">
      <h2 class="report-section-title">回答内容</h2>
      <div class="answer-grid">
        <div class="answer-item"><p class="answer-label">Webサイト</p><p class="answer-value">${escapeHTML(a.q1_has_website)}</p></div>
        ${a.q2_url ? `<div class="answer-item"><p class="answer-label">URL</p><p class="answer-value">${escapeHTML(a.q2_url)}</p></div>` : ''}
        <div class="answer-item"><p class="answer-label">期待すること</p><p class="answer-value">${escapeHTML(a.q3_expectation)}</p></div>
        <div class="answer-item"><p class="answer-label">問い合わせ状況</p><p class="answer-value">${escapeHTML(a.q4_current_response)}</p></div>
      </div>
      ${a.q5_concerns ? `<div style="margin-top:1rem"><div class="answer-item"><p class="answer-label">気になること</p><p class="answer-value">${escapeHTML(a.q5_concerns)}</p></div></div>` : ''}
    </section>
    ${contentHTML}
  </main>
  <section class="report-cta"><div class="report-cta-inner">
    <h2 class="report-cta-title mincho">この診断結果について、詳しく相談しませんか？</h2>
    <p class="report-cta-text">Ciras株式会社では、AI検索に強いWebサイト制作（220,000円〜・税込）を行っています。<br>御社に合ったサイト設計を一緒に考えます。</p>
    <a href="/contact.html" class="btn btn-primary">無料相談する</a>
    <a href="https://lin.ee/s2u6VUw" class="btn btn-secondary">LINEで相談</a>
  </div></section>
  <footer class="report-footer"><p>&copy; 2026 Ciras Inc.（シラス株式会社）</p></footer>
</body></html>`;
}

function generateNotFoundHTML() {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>レポートが見つかりません｜Ciras株式会社</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600&family=Shippori+Mincho:wght@600&display=swap" rel="stylesheet"><style>:root{--green:#2D5A27;--gray-dark:#4A4A4A;--bg:#FAFAFA}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Noto Sans JP',sans-serif;color:#1A1A1A;line-height:1.9;background:var(--bg);font-size:15px;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem;text-align:center}h1{font-family:'Shippori Mincho',serif;font-size:1.5rem;margin-bottom:1rem;color:var(--green)}p{color:var(--gray-dark);margin-bottom:1.5rem}a{color:var(--green);font-weight:500}</style></head><body><div><h1>レポートが見つかりません</h1><p>指定されたレポートは存在しないか、URLが正しくない可能性があります。</p><a href="/">Ciras株式会社 トップページへ</a></div></body></html>`;
}

function generateErrorHTML() {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>エラー｜Ciras株式会社</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Noto Sans JP',sans-serif;color:#1A1A1A;line-height:1.9;background:#FAFAFA;font-size:15px;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem;text-align:center}h1{font-size:1.5rem;margin-bottom:1rem;color:#2D5A27}p{color:#4A4A4A;margin-bottom:1.5rem}a{color:#2D5A27;font-weight:500}</style></head><body><div><h1>エラーが発生しました</h1><p>申し訳ございません。しばらくしてから再度お試しください。</p><a href="/">トップページへ</a></div></body></html>`;
}

// ========== Utilities ==========

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
