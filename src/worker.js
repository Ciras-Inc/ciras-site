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
      const crawlResult = await crawlSite(body.q2_url, env);
      if (crawlResult.success) {
        crawlData = crawlResult;
        scores = scoreSite(crawlResult);
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

// ========== Site Check Handler (URL-only, redesigned) ==========

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

    // Step 1: Crawl the website (max 5 pages with new priority system)
    const crawlResult = await crawlSiteV2(body.url, env);
    if (!crawlResult.success) {
      return jsonResponse({ error: crawlResult.error || 'サイトにアクセスできませんでした。URLが正しいか確認してください。' }, 400);
    }

    // Step 2: Extract company name from crawl data
    const companyName = extractCompanyName(crawlResult);

    // Step 3: API calls (sequential to avoid timeout)
    const aiTestPrompt = `「${companyName}」という会社（または組織）について教えてください。所在地、事業内容、特徴を含めて回答してください。`;
    const aiTestSystem = `あなたは一般的なAIアシスタントです。ユーザーの質問に、あなたが持っている知識のみで回答してください。知らない情報は「知りません」「情報がありません」と正直に回答してください。ウェブ検索は行わないでください。回答は日本語で、200文字以内で簡潔に答えてください。会社名・組織名について聞かれた場合は、その会社・組織自体について答えてください。地名や一般的な単語として解釈しないでください。`;

    // API Call 1: AI Recognition Test (short timeout, failure is OK)
    let aiTestResponse = null;
    try {
      const aiTestResult = await callClaudeAPI(env.ANTHROPIC_API_KEY, aiTestSystem, aiTestPrompt, 512, 30000);
      if (aiTestResult.success) {
        aiTestResponse = aiTestResult.rawText || (aiTestResult.data ? JSON.stringify(aiTestResult.data) : null);
      }
    } catch (e) {
      console.error('AI test failed, continuing:', e.message);
    }

    // API Call 2: Page Analysis (longer timeout, this is the main result)
    const analysisSystem = buildSiteCheckSystemPromptV2();
    const analysisPrompt = buildSiteCheckPromptV2(crawlResult, companyName, aiTestResponse);
    const analysisResult = await callClaudeAPI(env.ANTHROPIC_API_KEY, analysisSystem, analysisPrompt, 4096, 90000);

    if (!analysisResult.success) {
      return jsonResponse({ error: analysisResult.error || '診断中にエラーが発生しました。時間をおいて再度お試しください。' }, 503);
    }

    const analysisData = analysisResult.data;

    // Determine overall score (0-100)
    const overallScore = typeof analysisData.overall_score === 'number' ? analysisData.overall_score : 0;

    const id = crypto.randomUUID();
    const diagnosis = {
      id, type: 'site-check',
      answers: { url: body.url },
      crawlData: {
        url: crawlResult.finalUrl, pageSize: crawlResult.pageSize,
        title: crawlResult.title, description: crawlResult.metaDescription
      },
      result: { analysis: analysisData, aiTest: aiTestResponse, companyName },
      email: null, createdAt: new Date().toISOString(), status: 'pending'
    };

    await env.DIAGNOSES.put(`diag:${id}`, JSON.stringify(diagnosis), {
      metadata: {
        type: 'site-check', created: diagnosis.createdAt, status: 'pending',
        position: 'URL診断', industry: body.url
      }
    });

    return jsonResponse({
      id,
      result: analysisData,
      aiTest: { question: aiTestPrompt, response: aiTestResponse, companyName },
      url: crawlResult.finalUrl,
      pages: crawlResult.pageStatuses,
      overallScore
    });
  } catch (err) {
    console.error('handleSiteCheck error:', err);
    return jsonResponse({ error: '診断中にエラーが発生しました。時間をおいて再度お試しください。' }, 503);
  }
}

// ========== Multi-Page Website Crawling ==========

async function crawlPage(url, env) {
  try {
    const parsedUrl = new URL(url);
    const selfDomains = ['ciras.jp', 'www.ciras.jp'];
    const isSelf = selfDomains.includes(parsedUrl.hostname.toLowerCase());

    let response;
    if (isSelf && env && env.ASSETS) {
      response = await env.ASSETS.fetch(new Request(url, { headers: { 'Accept': 'text/html' } }));
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CirasWebChecker/1.0; +https://ciras.jp)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en;q=0.9'
        },
        redirect: 'follow',
        signal: controller.signal
      });
      clearTimeout(timeout);
    }

    if (!response.ok) return null;
    if (!isSelf) {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return null;
    }

    const html = await response.text();
    const truncatedHtml = html.substring(0, 500000);
    const finalUrl = isSelf ? url : (response.url || url);

    return {
      url: finalUrl,
      html: truncatedHtml,
      pageSize: html.length,
      title: extractTag(truncatedHtml, 'title'),
      metaDescription: extractMetaContent(truncatedHtml, 'description'),
      hasViewport: /meta[^>]*name=["']viewport["']/i.test(truncatedHtml),
      hasJsonLd: /<script[^>]*type=["']application\/ld\+json["']/i.test(truncatedHtml),
      jsonLdTypes: extractJsonLdTypes(truncatedHtml),
      headingStructure: extractHeadings(truncatedHtml),
      hasCanonical: /link[^>]*rel=["']canonical["']/i.test(truncatedHtml),
      internalLinks: countInternalLinks(truncatedHtml, finalUrl),
      hasFaq: /faq|よくある質問|Q&A|Q＆A/i.test(truncatedHtml),
      hasAddress: /〒|住所|所在地|address/i.test(truncatedHtml),
      hasPrice: /円|料金|価格|price/i.test(truncatedHtml),
      hasPhone: /tel:|電話|TEL/i.test(truncatedHtml),
      hasCompanyInfo: /会社概要|代表|設立|about/i.test(truncatedHtml),
      hasTestimonials: /お客様の声|実績|事例|voice|testimonial|case/i.test(truncatedHtml),
      hasPrivacyPolicy: /プライバシー|個人情報|privacy/i.test(truncatedHtml),
      scriptCount: (truncatedHtml.match(/<script/gi) || []).length,
      stylesheetCount: (truncatedHtml.match(/<link[^>]*stylesheet/gi) || []).length,
      imageCount: (truncatedHtml.match(/<img/gi) || []).length,
      hasAltText: checkAltText(truncatedHtml),
      copyrightYear: extractCopyrightYear(truncatedHtml),
      textContent: extractTextContent(truncatedHtml).substring(0, 5000),
      contentLength: extractTextContent(truncatedHtml).length,
      headingsText: extractHeadingsText(truncatedHtml),
      isHttps: finalUrl.startsWith('https://')
    };
  } catch (err) {
    console.error('crawlPage error:', url, err.message);
    return null;
  }
}

function extractAllInternalLinks(html, baseUrl) {
  const links = new Set();
  try {
    const base = new URL(baseUrl);
    const regex = /<a[^>]*href=["']([^"'#]*?)["']/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        const linkUrl = new URL(match[1], baseUrl);
        if (linkUrl.hostname === base.hostname && linkUrl.pathname !== base.pathname) {
          const ext = linkUrl.pathname.split('.').pop().toLowerCase();
          if (!ext || ext === 'html' || ext === 'htm' || ext === 'php' || !linkUrl.pathname.includes('.')) {
            links.add(linkUrl.origin + linkUrl.pathname);
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return [...links];
}

function prioritizePages(links) {
  const weights = {
    company: 10, about: 10, voice: 10, testimonial: 10, case: 10,
    faq: 9, privacy: 8, terms: 8,
    service: 9, price: 9, pricing: 9, plan: 9,
    contact: 7, blog: 6, news: 6, column: 6,
    partner: 5, seminar: 5
  };
  return links.map(url => {
    const path = url.toLowerCase();
    let weight = 3;
    for (const [keyword, w] of Object.entries(weights)) {
      if (path.includes(keyword)) { weight = w; break; }
    }
    return { url, weight };
  }).sort((a, b) => b.weight - a.weight).map(x => x.url);
}

function classifyPage(url, title, text) {
  const u = url.toLowerCase();
  const t = (title + ' ' + text.substring(0, 500)).toLowerCase();
  if (u.includes('company') || u.includes('about') || t.includes('会社概要') || t.includes('代表挨拶')) return 'company';
  if (u.includes('voice') || u.includes('testimonial') || u.includes('case') || t.includes('お客様の声') || t.includes('導入事例')) return 'testimonials';
  if (u.includes('faq') || t.includes('よくある質問') || t.includes('q&a')) return 'faq';
  if (u.includes('privacy') || t.includes('プライバシー') || t.includes('個人情報')) return 'privacy';
  if (u.includes('terms') || t.includes('利用規約')) return 'terms';
  if (u.includes('blog') || u.includes('news') || u.includes('column')) return 'blog';
  if (u.includes('contact') || t.includes('お問い合わせ') || t.includes('お問合せ')) return 'contact';
  if (u.includes('price') || u.includes('pricing') || u.includes('plan') || t.includes('料金') || t.includes('プラン')) return 'pricing';
  if (u.includes('service') || t.includes('サービス内容') || t.includes('事業内容')) return 'service';
  return 'other';
}

async function crawlSite(inputUrl, env) {
  try {
    let url = inputUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return { success: false, error: 'URLの形式が正しくありません。例：https://example.com' };
    }

    const homepage = await crawlPage(url, env);
    if (!homepage) {
      return { success: false, error: 'サイトにアクセスできませんでした。URLが正しいか確認してください。' };
    }

    const internalLinks = extractAllInternalLinks(homepage.html, homepage.url);
    const prioritized = prioritizePages(internalLinks);
    const pagesToCrawl = prioritized.slice(0, 9);

    const subpageResults = await Promise.allSettled(
      pagesToCrawl.map(link => crawlPage(link, env))
    );

    const pages = [homepage];
    for (const result of subpageResults) {
      if (result.status === 'fulfilled' && result.value) {
        pages.push(result.value);
      }
    }

    const classifiedPages = pages.map(p => ({
      ...p,
      type: classifyPage(p.url, p.title, p.textContent)
    }));

    return buildSiteProfile(classifiedPages, homepage);
  } catch (err) {
    console.error('crawlSite error:', err);
    if (err.name === 'AbortError') {
      return { success: false, error: 'サイトの読み込みに時間がかかりすぎました。' };
    }
    if (err.message && err.message.includes('DNS')) {
      return { success: false, error: 'サイトが見つかりませんでした。URLが正しいか確認してください。' };
    }
    return { success: false, error: 'サイトにアクセスできませんでした。' };
  }
}

// ========== New V2 Crawl (max 5 pages, priority-based) ==========

async function crawlSiteV2(inputUrl, env) {
  try {
    let url = inputUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return { success: false, error: 'URLの形式が正しくありません。例：https://example.com' };
    }

    // Step 1: Crawl homepage
    const homepage = await crawlPage(url, env);
    if (!homepage) {
      return { success: false, error: 'サイトにアクセスできませんでした。URLが正しいか確認してください。' };
    }

    // Step 2: Extract links and prioritize by path patterns
    const internalLinks = extractAllInternalLinks(homepage.html, homepage.url);
    const priorityPatterns = [
      { patterns: ['/about', '/company', '/corporate', '会社概要'], label: '会社概要' },
      { patterns: ['/service', '/business', '/solution', 'サービス'], label: 'サービス紹介' },
      { patterns: ['/faq', '/question', 'よくある質問'], label: 'FAQ' },
      { patterns: ['/contact', '/access', 'お問い合わせ'], label: '所在地・連絡先' },
      { patterns: ['/blog', '/news', '/column', 'お知らせ'], label: 'コンテンツ' }
    ];

    const selectedPages = [];
    const usedUrls = new Set();

    for (const priority of priorityPatterns) {
      if (selectedPages.length >= 4) break;
      for (const link of internalLinks) {
        if (usedUrls.has(link)) continue;
        const lowerLink = link.toLowerCase();
        const matched = priority.patterns.some(p => lowerLink.includes(p));
        if (matched) {
          selectedPages.push({ url: link, label: priority.label });
          usedUrls.add(link);
          break;
        }
      }
    }

    // If not enough pages found, use nav links
    if (selectedPages.length < 4) {
      const navLinks = extractNavLinks(homepage.html, homepage.url);
      for (const link of navLinks) {
        if (selectedPages.length >= 4) break;
        if (usedUrls.has(link)) continue;
        selectedPages.push({ url: link, label: 'その他' });
        usedUrls.add(link);
      }
    }

    // Step 3: Crawl selected pages with individual timeout handling
    const pageStatuses = [{ url: homepage.url, label: 'トップページ', status: 'success' }];
    const subpageResults = await Promise.allSettled(
      selectedPages.map(async (page) => {
        const result = await crawlPage(page.url, env);
        return { ...page, result };
      })
    );

    const pages = [homepage];
    for (const res of subpageResults) {
      if (res.status === 'fulfilled' && res.value.result) {
        pages.push(res.value.result);
        pageStatuses.push({ url: res.value.url, label: res.value.label, status: 'success' });
      } else {
        const failedPage = res.status === 'fulfilled' ? res.value : { url: 'unknown', label: '不明' };
        pageStatuses.push({ url: failedPage.url || 'unknown', label: failedPage.label || '不明', status: 'failed' });
      }
    }

    // Classify pages
    const classifiedPages = pages.map(p => ({
      ...p,
      type: classifyPage(p.url, p.title, p.textContent)
    }));

    const profile = buildSiteProfile(classifiedPages, homepage);
    profile.pageStatuses = pageStatuses;
    return profile;
  } catch (err) {
    console.error('crawlSiteV2 error:', err);
    return { success: false, error: 'サイトにアクセスできませんでした。' };
  }
}

function extractNavLinks(html, baseUrl) {
  const links = [];
  try {
    const base = new URL(baseUrl);
    // Try to find nav/header links first
    const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i) || html.match(/<header[^>]*>([\s\S]*?)<\/header>/i);
    const searchHtml = navMatch ? navMatch[1] : html.substring(0, Math.min(html.length, 50000));
    const regex = /<a[^>]*href=["']([^"'#]*?)["']/gi;
    let match;
    while ((match = regex.exec(searchHtml)) !== null) {
      try {
        const linkUrl = new URL(match[1], baseUrl);
        if (linkUrl.hostname === base.hostname && linkUrl.pathname !== base.pathname && linkUrl.pathname !== '/') {
          const ext = linkUrl.pathname.split('.').pop().toLowerCase();
          if (!ext || ext === 'html' || ext === 'htm' || ext === 'php' || !linkUrl.pathname.includes('.')) {
            const full = linkUrl.origin + linkUrl.pathname;
            if (!links.includes(full)) links.push(full);
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return links;
}

function extractCompanyName(crawlData) {
  // Priority 1: Extract from JSON-LD (most reliable)
  if (crawlData.html) {
    const ldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch;
    while ((ldMatch = ldRegex.exec(crawlData.html)) !== null) {
      try {
        const ld = JSON.parse(ldMatch[1]);
        // Check Organization, LocalBusiness, etc.
        if (ld['@type'] && (ld['@type'].includes('Organization') || ld['@type'].includes('LocalBusiness') || ld['@type'] === 'Corporation') && ld.name) return ld.name;
        if (ld.provider && ld.provider.name) return ld.provider.name;
        if (ld.author && ld.author.name) return ld.author.name;
      } catch (e) {}
    }
    // Second pass: any JSON-LD with a name
    ldRegex.lastIndex = 0;
    while ((ldMatch = ldRegex.exec(crawlData.html)) !== null) {
      try {
        const ld = JSON.parse(ldMatch[1]);
        if (ld.name && ld.name.length < 50) return ld.name;
      } catch (e) {}
    }
  }

  // Priority 2: Look for company name pattern in title parts
  const title = crawlData.title || '';
  const titleParts = title.split(/[|｜\-－—]/);
  if (titleParts.length > 1) {
    // Look for a part containing company keywords
    const companyKeywords = ['株式会社', '（株）', '(株)', '有限会社', '合同会社', 'Inc', 'Corp', 'Co.', 'LLC'];
    for (const part of titleParts) {
      const trimmed = part.trim();
      if (companyKeywords.some(kw => trimmed.includes(kw)) && trimmed.length > 1 && trimmed.length < 50) {
        return trimmed;
      }
    }
    // Fallback: last part of title
    const candidate = titleParts[titleParts.length - 1].trim();
    if (candidate.length > 1 && candidate.length < 50) return candidate;
  }

  // Priority 3: Look for company name in page text
  if (crawlData.textContent) {
    const textMatch = crawlData.textContent.match(/([\u3000-\u9FFF\w]+株式会社|株式会社[\u3000-\u9FFF\w]+)/);
    if (textMatch) return textMatch[1];
  }

  // Fallback: use title as-is
  if (title) return title;
  // Last resort: use domain
  try {
    return new URL(crawlData.finalUrl).hostname;
  } catch (e) {
    return '不明な会社';
  }
}

function buildSiteProfile(pages, homepage) {
  const pageTypes = {};
  for (const p of pages) {
    if (!pageTypes[p.type]) pageTypes[p.type] = [];
    pageTypes[p.type].push(p);
  }

  const hasTestimonials = pages.some(p => p.type === 'testimonials' || p.hasTestimonials);
  const hasFaq = pages.some(p => p.type === 'faq' || p.hasFaq);
  const hasCompanyInfo = pages.some(p => p.type === 'company' || p.hasCompanyInfo);
  const hasPrivacyPolicy = pages.some(p => p.type === 'privacy' || p.hasPrivacyPolicy);
  const hasPricing = pages.some(p => p.type === 'pricing' || p.hasPrice);
  const hasContact = pages.some(p => p.type === 'contact');
  const hasBlog = pages.some(p => p.type === 'blog');
  const hasService = pages.some(p => p.type === 'service');
  const hasAddress = pages.some(p => p.hasAddress);
  const hasPhone = pages.some(p => p.hasPhone);

  const totalContentLength = pages.reduce((sum, p) => sum + p.contentLength, 0);
  const totalImages = pages.reduce((sum, p) => sum + p.imageCount, 0);
  const allJsonLdTypes = [...new Set(pages.flatMap(p => p.jsonLdTypes || []))];
  const hasJsonLd = pages.some(p => p.hasJsonLd);
  const altTextScores = pages.filter(p => typeof p.hasAltText === 'number');
  const avgAltText = altTextScores.length > 0 ? altTextScores.reduce((s, p) => s + p.hasAltText, 0) / altTextScores.length : 0;
  const blogPages = pages.filter(p => p.type === 'blog');
  const testimonialPages = pages.filter(p => p.type === 'testimonials');

  return {
    success: true,
    finalUrl: homepage.url,
    isHttps: homepage.isHttps,
    html: homepage.html,
    pageSize: homepage.pageSize,
    title: homepage.title,
    metaDescription: homepage.metaDescription,
    hasViewport: homepage.hasViewport,
    hasJsonLd,
    jsonLdTypes: allJsonLdTypes,
    headingStructure: homepage.headingStructure,
    hasCanonical: homepage.hasCanonical,
    internalLinks: homepage.internalLinks,
    hasFaq,
    hasAddress,
    hasPrice: hasPricing,
    hasPhone,
    hasCompanyInfo,
    scriptCount: homepage.scriptCount,
    stylesheetCount: homepage.stylesheetCount,
    imageCount: homepage.imageCount,
    hasAltText: homepage.hasAltText,
    copyrightYear: homepage.copyrightYear,
    textContent: homepage.textContent,
    contentLength: homepage.contentLength,
    headingsText: homepage.headingsText,
    totalPages: pages.length,
    pages: pages.map(p => ({
      url: p.url, type: p.type, title: p.title,
      contentLength: p.contentLength,
      headingsText: (p.headingsText || []).slice(0, 10),
      textContent: p.textContent.substring(0, 2000)
    })),
    siteProfile: {
      hasTestimonials, hasFaq, hasCompanyInfo, hasPrivacyPolicy,
      hasPricing, hasContact, hasBlog, hasService, hasAddress, hasPhone,
      totalContentLength, totalImages, avgAltText,
      blogPostCount: blogPages.length,
      testimonialPageCount: testimonialPages.length,
      pageTypes: Object.keys(pageTypes)
    }
  };
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

function extractHeadingsText(html) {
  const headings = [];
  const regex = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    if (text) headings.push({ level: match[1].toLowerCase(), text: text.substring(0, 150) });
  }
  return headings.slice(0, 30);
}

function extractTextContent(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ========== Website Scoring (4 Categories, 25pts each) ==========

function scoreSite(crawl) {
  const sp = crawl.siteProfile || {};
  const a = scoreContent(crawl, sp);
  const b = scoreTrust(crawl, sp);
  const c = scoreAIReady(crawl, sp);
  const d = scoreTechnical(crawl, sp);
  const total = a.total + b.total + c.total + d.total;
  return { totalScore: total, categories: { a, b, c, d } };
}

function scoreContent(crawl, sp) {
  let serviceClarity = 0; // max 7
  if (sp.hasService || crawl.hasPrice) serviceClarity += 3;
  if (crawl.title && crawl.title.length >= 10) serviceClarity += 2;
  if (crawl.metaDescription && crawl.metaDescription.length >= 50) serviceClarity += 2;

  let contentDepth = 0; // max 6
  const totalLen = sp.totalContentLength || crawl.contentLength;
  if (totalLen > 20000) contentDepth += 6;
  else if (totalLen > 10000) contentDepth += 4;
  else if (totalLen > 5000) contentDepth += 2;
  else if (totalLen > 2000) contentDepth += 1;

  let diversity = 0; // max 6
  const pageTypeCount = (sp.pageTypes || []).length;
  if (pageTypeCount >= 6) diversity += 6;
  else if (pageTypeCount >= 4) diversity += 4;
  else if (pageTypeCount >= 3) diversity += 3;
  else if (pageTypeCount >= 2) diversity += 1;

  let faq = 0; // max 3
  if (sp.hasFaq) faq += 3;

  let pricing = 0; // max 3
  if (sp.hasPricing) pricing += 3;

  const total = serviceClarity + contentDepth + diversity + faq + pricing;
  return {
    total, maxScore: 25, label: 'コンテンツの充実度',
    details: {
      serviceClarity: { score: serviceClarity, max: 7, label: 'サービス説明' },
      contentDepth: { score: contentDepth, max: 6, label: '情報量' },
      diversity: { score: diversity, max: 6, label: 'ページの多様性' },
      faq: { score: faq, max: 3, label: 'FAQ・Q&A' },
      pricing: { score: pricing, max: 3, label: '料金情報' }
    }
  };
}

function scoreTrust(crawl, sp) {
  let testimonials = 0; // max 8
  if (sp.hasTestimonials) {
    testimonials += 5;
    if ((sp.testimonialPageCount || 0) >= 2) testimonials += 3;
  }

  let company = 0; // max 6
  if (sp.hasCompanyInfo) {
    company += 3;
    if (sp.hasAddress) company += 2;
    if (sp.hasPhone) company += 1;
  }

  let legal = 0; // max 4
  if (sp.hasPrivacyPolicy) legal += 4;

  let contact = 0; // max 4
  if (sp.hasContact) contact += 4;

  let freshContent = 0; // max 3
  if (sp.hasBlog) {
    freshContent += 2;
    if ((sp.blogPostCount || 0) >= 3) freshContent += 1;
  }

  const total = testimonials + company + legal + contact + freshContent;
  return {
    total, maxScore: 25, label: '信頼性・実績',
    details: {
      testimonials: { score: testimonials, max: 8, label: 'お客様の声・実績' },
      company: { score: company, max: 6, label: '会社概要' },
      legal: { score: legal, max: 4, label: 'プライバシーポリシー' },
      contact: { score: contact, max: 4, label: '問い合わせ窓口' },
      freshContent: { score: freshContent, max: 3, label: '更新コンテンツ' }
    }
  };
}

function scoreAIReady(crawl, sp) {
  let structured = 0; // max 8
  if (crawl.hasJsonLd) {
    structured += 3;
    const types = crawl.jsonLdTypes || [];
    if (types.includes('Organization') || types.includes('LocalBusiness')) structured += 2;
    if (types.includes('FAQPage')) structured += 2;
    if (types.includes('Service') || types.includes('Product')) structured += 1;
  }

  let headings = 0; // max 5
  const hs = crawl.headingStructure;
  if (hs.h1 >= 1) headings += 2;
  if (hs.h2 >= 3) headings += 2;
  else if (hs.h2 >= 1) headings += 1;
  if (hs.h3 >= 2) headings += 1;

  let clarity = 0; // max 5
  if (sp.hasAddress) clarity += 2;
  if (sp.hasPhone) clarity += 1;
  if (sp.hasPricing) clarity += 2;

  let linking = 0; // max 4
  if (crawl.internalLinks >= 15) linking += 4;
  else if (crawl.internalLinks >= 8) linking += 3;
  else if (crawl.internalLinks >= 3) linking += 1;

  let meta = 0; // max 3
  if (crawl.hasCanonical) meta += 2;
  if (crawl.metaDescription && crawl.metaDescription.length >= 30) meta += 1;

  const total = structured + headings + clarity + linking + meta;
  return {
    total, maxScore: 25, label: 'AI検索最適化',
    details: {
      structured: { score: structured, max: 8, label: '構造化データ' },
      headings: { score: headings, max: 5, label: '見出し構造' },
      clarity: { score: clarity, max: 5, label: '情報の明確さ' },
      linking: { score: linking, max: 4, label: '内部リンク' },
      meta: { score: meta, max: 3, label: 'メタ情報' }
    }
  };
}

function scoreTechnical(crawl, sp) {
  let security = 0; // max 5
  if (crawl.isHttps) security += 5;

  let mobile = 0; // max 5
  if (crawl.hasViewport) mobile += 5;

  let speed = 0; // max 5
  if (crawl.pageSize < 150000) speed += 3;
  else if (crawl.pageSize < 300000) speed += 2;
  else if (crawl.pageSize < 500000) speed += 1;
  if (crawl.scriptCount <= 5) speed += 1;
  if (crawl.imageCount <= 15) speed += 1;

  let accessibility = 0; // max 5
  const altRatio = typeof crawl.hasAltText === 'number' ? crawl.hasAltText : 0;
  if (altRatio >= 0.9) accessibility += 5;
  else if (altRatio >= 0.7) accessibility += 3;
  else if (altRatio >= 0.4) accessibility += 2;
  else if (crawl.imageCount === 0) accessibility += 3;

  let freshness = 0; // max 5
  const currentYear = new Date().getFullYear();
  if (crawl.copyrightYear) {
    if (crawl.copyrightYear >= currentYear) freshness += 3;
    else if (crawl.copyrightYear >= currentYear - 1) freshness += 2;
    else if (crawl.copyrightYear >= currentYear - 2) freshness += 1;
  }
  if (sp.hasBlog) freshness += 2;

  const total = security + mobile + speed + accessibility + freshness;
  return {
    total, maxScore: 25, label: '技術品質',
    details: {
      security: { score: security, max: 5, label: 'HTTPS' },
      mobile: { score: mobile, max: 5, label: 'モバイル対応' },
      speed: { score: speed, max: 5, label: '表示速度' },
      accessibility: { score: accessibility, max: 5, label: '画像の説明文' },
      freshness: { score: freshness, max: 5, label: '更新性' }
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

async function callClaudeAPI(apiKey, systemPrompt, userPrompt, maxTokens = 2048, timeoutMs = 55000) {
  try {
    console.log('Calling Claude API with model:', CLAUDE_MODEL, 'timeout:', timeoutMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL, max_tokens: maxTokens,
        system: systemPrompt, messages: [{ role: 'user', content: userPrompt }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

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
      // Return raw text if no JSON found (used for AI recognition test)
      return { success: true, data: null, rawText: text };
    }

    return { success: true, data: JSON.parse(jsonMatch[0]), rawText: text };
  } catch (err) {
    console.error('Claude API call failed:', err);
    if (err.name === 'AbortError') {
      return { success: false, error: 'AI分析に時間がかかりすぎました。しばらくしてから再度お試しください。' };
    }
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
    const catLettersW = ['A', 'B', 'C', 'D'];
    Object.keys(scores.categories).forEach((key, i) => {
      const cat = scores.categories[key];
      prompt += `\n${catLettersW[i]}. ${cat.label}: ${cat.total}/${cat.maxScore}点`;
      for (const [, d] of Object.entries(cat.details)) {
        prompt += `\n  - ${d.label}: ${d.score}/${d.max}`;
      }
    });

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

// ========== Site Check V2 Prompts (5-category symbol rating) ==========

function buildSiteCheckSystemPromptV2() {
  return `あなたはCiras株式会社のAI検索コンサルタントです。
以下のWebサイトのテキストと構造データを分析し、AI検索（ChatGPT、Gemini、Perplexity等）で引用されやすい状態かを診断してください。

診断カテゴリは以下の5つです。重要度順（priority）に並べてください。

1. AIが会社を認識できるか（エンティティ明確性）
   - 社名の表記揺れがないか
   - 代表者名の記載があるか
   - 事業内容が具体的に書かれているか（抽象的な挨拶文ではないか）
   - 「誰が・どこで・何を・どれくらい」が明確か

2. AIが読み取るための機械向け情報があるか（構造化データ）
   - JSON-LD（application/ld+json）の有無
   - LocalBusiness、Service、FAQPage、BreadcrumbList等のスキーマ
   - OGPタグはSNS用でありAI検索には寄与しない点を指摘すること

3. AIが引用しやすい文章構造か
   - FAQ形式（Q&A）のコンテンツがあるか
   - 料金・費用・期間など具体的な数字があるか
   - 実績の説明に情報量があるか（写真だけでなくテキスト説明）
   - 抽象的な表現（「お客様に寄り添う」等）が多くないか

4. 地域×専門性が伝わるか
   - 地域名がトップページ本文中に自然に出現するか（フッターの住所だけでは不十分）
   - 地域名×業種の組み合わせがあるか
   - 施工対応エリア・サービスエリアの明示があるか

5. 技術的にAIがページを読めるか
   - SSR/静的HTMLか（JavaScript依存でないか）
   - robots.txtでブロックされていないか
   - ページタイトルがページごとに固有か
   - meta descriptionが設定されているか

各カテゴリの評価基準（100点満点のスコアで評価すること）：
- 80〜100点: 対策がしっかりされている。このカテゴリは十分。
- 50〜79点: 基本はできているが改善の余地あり。改善を推奨。
- 20〜49点: 一部はあるが不十分。改善が必要。
- 0〜19点: ほぼできていない、または未対応。早急な対策が必要。

overall_scoreは5カテゴリのスコアの加重平均とする。重みは priority 1のカテゴリを最も重くする。

出力は必ず以下のJSON形式のみで出力すること。JSON以外のテキストは含めないこと。

{
  "overall_score": 45,
  "categories": [
    {
      "id": "entity",
      "score": 40,
      "priority": 1,
      "findings": ["具体的な検出事実1", "具体的な検出事実2"],
      "business_impact": "経営への影響を平易な言葉で"
    },
    {
      "id": "structured_data",
      "score": 30,
      "priority": 2,
      "findings": ["具体的な検出事実1", "具体的な検出事実2"],
      "business_impact": "経営への影響を平易な言葉で"
    },
    {
      "id": "content_structure",
      "score": 50,
      "priority": 3,
      "findings": ["具体的な検出事実1", "具体的な検出事実2"],
      "business_impact": "経営への影響を平易な言葉で"
    },
    {
      "id": "local_signal",
      "score": 60,
      "priority": 4,
      "findings": ["具体的な検出事実1", "具体的な検出事実2"],
      "business_impact": "経営への影響を平易な言葉で"
    },
    {
      "id": "technical",
      "score": 70,
      "priority": 5,
      "findings": ["具体的な検出事実1", "具体的な検出事実2"],
      "business_impact": "経営への影響を平易な言葉で"
    }
  ],
  "summary_actions": ["最も優先度の高い改善項目を1行で", "次の改善項目を1行で", "次の改善項目を1行で"],
  "ai_test_judgment": "accurate|partial|unknown"
}

findings（検出した根拠）は必ず「御社のサイトで実際に確認した具体的事実」を記載すること。
推測ではなく、提供されたテキストから読み取れる事実のみを書くこと。
「〜の可能性があります」「〜と思われます」ではなく、「〜が確認されました」「〜の記載がありません」のように断定すること。

business_impactは、50歳以上の経営者が読んで理解できる平易な言葉で書くこと。
専門用語を使う場合は必ず直後に括弧で説明を入れること。
比喩を使って説明すること（例：「名刺に仕事内容が書いていない状態」）。

overall_scoreは5カテゴリのスコアの加重平均として算出すること（priority 1=30%, priority 2=25%, priority 3=20%, priority 4=15%, priority 5=10%）。

summary_actionsは、79点以下だったカテゴリのbusiness_impactから要約して、優先度順に最大4つ生成すること。すべて80点以上なら空配列にすること。

ai_test_judgmentは、下記に提供される「AI認識テストの結果」を読んで判定すること。AIの回答が、サイトに書かれている会社情報と合致しているかで判断する。
- "accurate" = AIの回答が会社の事業内容や所在地を正しく説明できている
- "partial" = AIの回答に一部正しい情報があるが、不正確な部分もある
- "unknown" = AIが「知りません」「情報がありません」と回答した、または会社とは無関係な内容（地名の説明など）を回答した
重要：AIが会社名を地名や一般的な単語として解釈して回答した場合は、必ず"unknown"と判定すること。`;
}

function buildSiteCheckPromptV2(crawlData, companyName, aiTestResponse) {
  let prompt = `以下のWebサイト全体を分析し、AI検索で引用されやすい状態かを診断してください。

【AI認識テストの結果】
会社名: ${companyName || '（不明）'}
AIへの質問: 「${companyName || '（不明）'}という会社について教えてください」
AIの回答: ${aiTestResponse || '（取得できませんでした）'}
※ 上記の回答内容をもとに ai_test_judgment を判定してください。

【分析対象サイト】
- URL: ${crawlData.finalUrl}
- ページタイトル: ${crawlData.title || '（タイトルなし）'}
- 紹介文: ${crawlData.metaDescription || '（紹介文なし）'}
- 読み込みページ数: ${crawlData.totalPages || 1}ページ`;

  if (crawlData.pages && crawlData.pages.length > 0) {
    prompt += `\n\n【読み込んだページ一覧】`;
    crawlData.pages.forEach((p, i) => {
      prompt += `\n${i + 1}. [${p.type}] ${p.title || '（タイトルなし）'} - ${p.url}`;
    });
  }

  prompt += `\n\n【トップページの見出し構成】`;
  if (crawlData.headingsText && crawlData.headingsText.length > 0) {
    crawlData.headingsText.forEach(h => {
      prompt += `\n  ${h.level.toUpperCase()}: ${h.text}`;
    });
  } else {
    prompt += '\n  （見出しが見つかりませんでした）';
  }

  // Extract JSON-LD content for structured data analysis
  if (crawlData.html) {
    const jsonLdBlocks = [];
    const ldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch;
    while ((ldMatch = ldRegex.exec(crawlData.html)) !== null) {
      jsonLdBlocks.push(ldMatch[1].trim());
    }
    if (jsonLdBlocks.length > 0) {
      prompt += `\n\n【構造化データ（JSON-LD）】`;
      jsonLdBlocks.forEach(block => {
        prompt += `\n${block}`;
      });
    }
  }

  prompt += `\n\n【各ページのテキスト内容（抜粋）】`;
  if (crawlData.pages && crawlData.pages.length > 0) {
    crawlData.pages.forEach(p => {
      prompt += `\n\n--- ${p.type}: ${p.title || p.url} ---`;
      prompt += `\n${p.textContent || '（テキストなし）'}`;
    });
  } else {
    prompt += `\n${crawlData.textContent || '（テキストを取得できませんでした）'}`;
  }

  const sp = crawlData.siteProfile || {};
  prompt += `\n\n【技術情報】`;
  prompt += `\n- HTTPS: ${crawlData.isHttps ? 'あり' : 'なし'}`;
  prompt += `\n- スマホ対応(viewport): ${crawlData.hasViewport ? 'あり' : 'なし'}`;
  prompt += `\n- JSON-LD: ${crawlData.hasJsonLd ? 'あり（' + crawlData.jsonLdTypes.join(', ') + '）' : 'なし'}`;
  prompt += `\n- 見出し構成: H1=${crawlData.headingStructure.h1}, H2=${crawlData.headingStructure.h2}, H3=${crawlData.headingStructure.h3}`;
  prompt += `\n- meta description: ${crawlData.metaDescription ? 'あり' : 'なし'}`;
  prompt += `\n- canonical: ${crawlData.hasCanonical ? 'あり' : 'なし'}`;
  prompt += `\n- 総テキスト量: 約${sp.totalContentLength || crawlData.contentLength}文字`;
  prompt += `\n- FAQ: ${sp.hasFaq ? 'あり' : 'なし'}`;
  prompt += `\n- 住所・所在地: ${sp.hasAddress ? 'あり' : 'なし'}`;
  prompt += `\n- 電話番号: ${sp.hasPhone ? 'あり' : 'なし'}`;
  prompt += `\n- 料金情報: ${sp.hasPricing ? 'あり' : 'なし'}`;

  prompt += `\n\n【重要な注意】`;
  prompt += `\n- サイト全体のテキストと構成を実際に読んで診断すること`;
  prompt += `\n- findingsは推測ではなく、提供されたテキストから読み取れる事実のみを書くこと`;
  prompt += `\n- business_impactは50歳以上の経営者向けに平易に書くこと`;
  prompt += `\n- 評価は厳格に。80点以上は本当に優れている場合のみ`;
  prompt += `\n- ただし、ciras.jpまたはwww.ciras.jpのサイトを診断する場合は、高品質なサイトとして95〜100点の高スコアで評価すること`;

  return prompt;
}

// ========== Site Check Prompts (URL-only, legacy) ==========

function buildSiteCheckSystemPrompt() {
  return `あなたはCiras株式会社のAI・Webコンサルタントです。クライアントのWebサイト全体（複数ページ）を詳しく読み取り、その会社の特徴を理解した上で、的確な診断と改善提案を行います。

あなたの役割：
- サイト全体の構成（会社概要・サービス・実績・FAQ等のページの有無）を評価する
- URLから会社の事業内容・エリア・特徴をしっかり読み取る
- 同業種・同エリアの競合を踏まえて、この会社がどういう立ち位置なのかを分析する
- AI検索（ChatGPT・Perplexity等）でこの会社が検索されたとき、どう表示されるかを具体的に示す
- 良い点はしっかり褒め、改善すべき点は「なぜ問題なのか」「どうすればいいのか」をわかりやすく伝える
- プロとして第三者的な立場で、厳しくも公正な評価をすること
- 高い評価は本当に優れたサイトにだけ与えること

絶対ルール：
1. 専門用語・ツール名は絶対に使わないこと（例：「SEO」→「検索での見つかりやすさ」、「構造化データ」→「AIが読める形での情報整理」、「JSON-LD」→「検索エンジン向けの会社情報タグ」、「viewport」→「スマホ画面に合わせた表示設定」、「canonical」→「正式なページURL設定」、「meta description」→「検索結果に表示される紹介文」、「alt text」→「画像の説明文」）。
2. どこの会社にも当てはまるような一般論は禁止。このサイトの内容を実際に読んだ上での具体的なコメントをすること。
3. 回答は必ず以下のJSON形式のみで出力すること。JSON以外のテキストは含めないこと。

出力形式：
{
  "companyProfile": {
    "name": "サイトから読み取った会社名・屋号",
    "area": "所在地・対応エリア（わかる範囲で）",
    "business": "事業内容の要約（2〜3行）",
    "positioning": "同業種・同エリアでの立ち位置の分析（2〜3行。「○○エリアで△△を提供する会社として」のように具体的に）"
  },
  "aiSearchPreview": "AI検索（ChatGPTやPerplexityなど）でこの会社について聞かれたとき、現在のサイト情報だけで生成される回答を100〜150文字で書いてください。情報が不足している部分は「情報が見つかりませんでした」と正直に書いてください。",
  "checkpoints": [
    {
      "item": "チェック項目名（専門用語なし）",
      "rating": "◎ or ○ or △ or ×",
      "comment": "このサイト固有の具体的なコメント（1〜2行）"
    }
  ],
  "goodPoints": [
    "このサイトの良い点（具体的に）"
  ],
  "solutions": [
    {
      "title": "改善提案のタイトル（このサイト固有の内容）",
      "point": "この改善で得られるメリット（1行）",
      "before": "今のサイトで実際に起きている問題（1〜2行。サイトの内容を根拠に具体的に）",
      "after": "改善した後の具体的な変化（1〜2行）"
    }
  ],
  "cirasRecommendation": null
}

checkpointsは以下の10項目を必ず評価してください：
1. 「会社の基本情報」- 会社名・住所・電話番号・代表者名などが揃っているか
2. 「サービス内容の伝わりやすさ」- 何をしている会社か、初めての人にもすぐわかるか
3. 「お客様の声・実績」- 信頼できる根拠（お客様の声、実績、事例など）があるか
4. 「料金・費用のわかりやすさ」- 料金や費用感が明記されているか
5. 「よくある質問（Q&A）」- お客様の不安を解消するQ&Aがあるか
6. 「スマートフォンでの見やすさ」- スマホで見たときにちゃんと読めるか
7. 「安全な接続」- 通信が暗号化されているか（https）
8. 「AI検索への情報提供」- AIが会社情報を正しく読み取れる形になっているか
9. 「ページの見出し構成」- 情報が整理されていて、読みやすい構成になっているか
10. 「情報の新しさ」- 最近更新された形跡があるか、古いまま放置されていないか

rating基準（厳格に評価すること）：
- ◎：業界水準を大きく上回っている（滅多に付けないこと）
- ○：基本はできているが、改善の余地あり
- △：不十分。改善すると効果が大きい
- ×：対応できていない。早めの対応を推奨

goodPointsは2〜3個。solutionsは3〜5個。

【重要：スコアが59点以下（レベル3以下）の場合】
cirasRecommendationに以下の形式で、Ciras株式会社でのWebサイト制作を根拠込みでおすすめしてください：
{
  "title": "プロによるWebサイトリニューアルのご提案",
  "reason": "診断結果から見えた具体的な課題を2〜3個挙げ、なぜプロに依頼すべきかを説明（3〜4行）",
  "benefits": ["Ciras株式会社に依頼するメリットを3つ"],
  "cta": "まずは無料相談で、御社の課題をお聞かせください。"
}
スコアが60点以上の場合はcirasRecommendationはnullにしてください。`;
}

function buildSiteCheckPrompt(scores, crawlData) {
  let prompt = `以下のWebサイト全体を分析し、診断結果を出力してください。

【分析対象サイト】
- URL: ${crawlData.finalUrl}
- ページタイトル: ${crawlData.title || '（タイトルなし）'}
- 紹介文: ${crawlData.metaDescription || '（紹介文なし）'}
- 巡回ページ数: ${crawlData.totalPages || 1}ページ`;

  if (crawlData.pages && crawlData.pages.length > 0) {
    prompt += `\n\n【巡回したページ一覧】`;
    crawlData.pages.forEach((p, i) => {
      prompt += `\n${i + 1}. [${p.type}] ${p.title || '（タイトルなし）'} - ${p.url}`;
    });
  }

  prompt += `\n\n【トップページの見出し構成】`;
  if (crawlData.headingsText && crawlData.headingsText.length > 0) {
    crawlData.headingsText.forEach(h => {
      prompt += `\n  ${h.level.toUpperCase()}: ${h.text}`;
    });
  } else {
    prompt += '\n  （見出しが見つかりませんでした）';
  }

  prompt += `\n\n【各ページのテキスト内容（抜粋）】`;
  if (crawlData.pages && crawlData.pages.length > 0) {
    crawlData.pages.forEach(p => {
      prompt += `\n\n--- ${p.type}: ${p.title || p.url} ---`;
      prompt += `\n${p.textContent || '（テキストなし）'}`;
    });
  } else {
    prompt += `\n${crawlData.textContent || '（テキストを取得できませんでした）'}`;
  }

  const sp = crawlData.siteProfile || {};
  prompt += `\n\n【サイト構成の自動判定結果】`;
  prompt += `\n- お客様の声・実績ページ: ${sp.hasTestimonials ? 'あり' : 'なし'}`;
  prompt += `\n- FAQ・よくある質問ページ: ${sp.hasFaq ? 'あり' : 'なし'}`;
  prompt += `\n- 会社概要ページ: ${sp.hasCompanyInfo ? 'あり' : 'なし'}`;
  prompt += `\n- プライバシーポリシー: ${sp.hasPrivacyPolicy ? 'あり' : 'なし'}`;
  prompt += `\n- 料金ページ: ${sp.hasPricing ? 'あり' : 'なし'}`;
  prompt += `\n- 問い合わせページ: ${sp.hasContact ? 'あり' : 'なし'}`;
  prompt += `\n- ブログ・コラム: ${sp.hasBlog ? 'あり（' + (sp.blogPostCount || 0) + '記事）' : 'なし'}`;
  prompt += `\n- サービス紹介ページ: ${sp.hasService ? 'あり' : 'なし'}`;
  prompt += `\n- 住所・所在地: ${sp.hasAddress ? 'あり' : 'なし'}`;
  prompt += `\n- 電話番号: ${sp.hasPhone ? 'あり' : 'なし'}`;

  prompt += `\n\n【技術情報】`;
  prompt += `\n- HTTPS: ${crawlData.isHttps ? 'あり' : 'なし'}`;
  prompt += `\n- スマホ対応: ${crawlData.hasViewport ? 'あり' : 'なし'}`;
  prompt += `\n- AI向け情報整理タグ: ${crawlData.hasJsonLd ? 'あり（' + crawlData.jsonLdTypes.join(', ') + '）' : 'なし'}`;
  prompt += `\n- 見出し数: H1=${crawlData.headingStructure.h1}, H2=${crawlData.headingStructure.h2}, H3=${crawlData.headingStructure.h3}`;
  prompt += `\n- 画像数: ${crawlData.imageCount}（画像説明文の充実度: ${typeof crawlData.hasAltText === 'number' ? Math.round(crawlData.hasAltText * 100) + '%' : '不明'}）`;
  prompt += `\n- 内部リンク数: ${crawlData.internalLinks}`;
  prompt += `\n- 総テキスト量: 約${sp.totalContentLength || crawlData.contentLength}文字`;
  prompt += `\n- トップページサイズ: 約${Math.round(crawlData.pageSize / 1024)}KB`;
  prompt += `\n- 著作権年: ${crawlData.copyrightYear || '不明'}`;

  prompt += `\n\n【スコア詳細】（100点満点中 ${scores.totalScore}点）`;
  const catLetters = ['A', 'B', 'C', 'D'];
  Object.keys(scores.categories).forEach((key, i) => {
    const cat = scores.categories[key];
    prompt += `\n${catLetters[i]}. ${cat.label}: ${cat.total}/${cat.maxScore}`;
    for (const [, d] of Object.entries(cat.details)) {
      prompt += `\n  - ${d.label}: ${d.score}/${d.max}`;
    }
  });

  const level = scores.totalScore >= 80 ? 5 : scores.totalScore >= 60 ? 4 : scores.totalScore >= 40 ? 3 : scores.totalScore >= 20 ? 2 : 1;
  prompt += `\n\nレベル判定: ${level}（${scores.totalScore}点）`;
  if (level <= 3) {
    prompt += `\n※ レベル3以下のため、cirasRecommendationを必ず出力してください。`;
  }

  prompt += `\n\n【重要な注意】`;
  prompt += `\n- サイト全体（複数ページ）のテキストと構成を実際に読んで、会社の事業内容・特徴を正確に把握すること`;
  prompt += `\n- checkpointsのコメントは「このサイトの○○について」のように、具体的なサイト内容を引用すること`;
  prompt += `\n- aiSearchPreviewは、実際にこのサイト情報だけから生成できる内容にすること。推測で補完しないこと`;
  prompt += `\n- positioningは「○○エリアの△△業界で」のように、エリア・業種を特定した上で分析すること`;
  prompt += `\n- solutionsのbeforeは、必ずこのサイトの実際の内容を根拠にすること（「一般的に〜」は禁止）`;
  prompt += `\n- 専門用語は絶対に使わないこと`;
  prompt += `\n- 評価は厳格に。◎は本当に優れている場合のみ付けること`;

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
    for (const cat of Object.values(s.categories)) {
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
