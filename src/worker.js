// Ciras Diagnostic Tool - Cloudflare Worker
// Handles API routes for AI diagnosis, admin, and report pages

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
    if (path === '/admin') {
      return env.ASSETS.fetch(new Request(new URL('/admin.html', url.origin), request));
    }

    // API routes
    if (path === '/api/ai-check' && request.method === 'POST') {
      return handleAiCheck(request, env);
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
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7);
  return token === env.ADMIN_PASSWORD;
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
    const body = await request.json();

    // Validate required fields
    const required = ['q1_position', 'q2_industry', 'q3_employees', 'q4_interests', 'q6_ai_status'];
    for (const field of required) {
      if (!body[field] || (Array.isArray(body[field]) && body[field].length === 0)) {
        return jsonResponse({ error: `${field} は必須です` }, 400);
      }
    }
    if (Array.isArray(body.q4_interests) && body.q4_interests.length > 2) {
      return jsonResponse({ error: 'Q4は最大2つまで選択できます' }, 400);
    }

    // Call Claude API
    const result = await callClaudeAPI(env.ANTHROPIC_API_KEY, body);
    if (!result.success) {
      return jsonResponse({
        error: 'ただいま診断が混み合っています。しばらくしてからお試しください。'
      }, 503);
    }

    // Generate diagnosis ID and save to KV
    const id = crypto.randomUUID();
    const diagnosis = {
      id,
      type: 'ai-check',
      answers: body,
      result: result.data,
      email: null,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    await env.DIAGNOSES.put(`diag:${id}`, JSON.stringify(diagnosis), {
      metadata: {
        type: 'ai-check',
        created: diagnosis.createdAt,
        status: 'pending',
        position: body.q1_position,
        industry: body.q2_industry
      }
    });

    return jsonResponse({ id, result: result.data });
  } catch (err) {
    console.error('handleAiCheck error:', err);
    return jsonResponse({
      error: 'ただいま診断が混み合っています。しばらくしてからお試しください。'
    }, 503);
  }
}

// ========== Email Handler ==========

async function handleAddEmail(request, env, id) {
  try {
    const body = await request.json();
    if (!body.email || !body.email.includes('@')) {
      return jsonResponse({ error: '有効なメールアドレスを入力してください' }, 400);
    }

    const raw = await env.DIAGNOSES.get(`diag:${id}`);
    if (!raw) {
      return jsonResponse({ error: '診断結果が見つかりません' }, 404);
    }

    const diagnosis = JSON.parse(raw);
    diagnosis.email = body.email;

    await env.DIAGNOSES.put(`diag:${id}`, JSON.stringify(diagnosis), {
      metadata: {
        type: diagnosis.type,
        created: diagnosis.createdAt,
        status: diagnosis.status,
        position: diagnosis.answers.q1_position,
        industry: diagnosis.answers.q2_industry,
        email: body.email
      }
    });

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
      id: key.name.replace('diag:', ''),
      ...key.metadata
    }));
    // Sort by created date descending
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
    if (!raw) {
      return jsonResponse({ error: '診断結果が見つかりません' }, 404);
    }
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
    if (!raw) {
      return jsonResponse({ error: '診断結果が見つかりません' }, 404);
    }

    const diagnosis = JSON.parse(raw);
    if (body.status) diagnosis.status = body.status;
    if (body.reportContent !== undefined) diagnosis.reportContent = body.reportContent;

    await env.DIAGNOSES.put(`diag:${id}`, JSON.stringify(diagnosis), {
      metadata: {
        type: diagnosis.type,
        created: diagnosis.createdAt,
        status: diagnosis.status,
        position: diagnosis.answers.q1_position,
        industry: diagnosis.answers.q2_industry,
        email: diagnosis.email || undefined
      }
    });

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
      return new Response(generateNotFoundHTML(), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    const diagnosis = JSON.parse(raw);
    const html = generateReportHTML(diagnosis);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (err) {
    console.error('handleReportPage error:', err);
    return new Response(generateErrorHTML(), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// ========== Claude API ==========

async function callClaudeAPI(apiKey, answers) {
  const prompt = buildPrompt(answers);

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      console.error('Claude API error:', response.status, await response.text());
      return { success: false };
    }

    const data = await response.json();
    const text = data.content[0].text;

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to parse Claude response as JSON:', text);
      return { success: false };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return { success: true, data: parsed };
  } catch (err) {
    console.error('Claude API call failed:', err);
    return { success: false };
  }
}

function buildSystemPrompt() {
  return `あなたはCiras株式会社のAIコンサルタントです。中小企業の経営者や担当者に対して、AI活用の具体的な提案を行います。

提案のルールを必ず守ってください：
1. 事実と推論を明確に分けること。「〜という事例があります」「〜が広く使われています」は事実。「〜が期待できます」「〜につながる可能性があります」は推論。
2. 専門用語は使わず、経営層に直感的かつ理論的に理解しやすい表現にすること。
3. できないことを「できる」と言わないこと。AIの限界も正直に伝えること。
4. 各提案は実際に今すぐ着手できる具体性のあるものにすること。
5. 回答は必ず以下のJSON形式のみで出力すること。JSON以外のテキストは含めないこと。

出力形式：
{
  "solutions": [
    {
      "title": "提案タイトル（1行、具体的に）",
      "description": "説明（3〜4行。なぜ有効か、どう始められるか、期待される効果を含む）"
    }
  ]
}`;
}

function buildPrompt(answers) {
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
  prompt += `\n\n興味分野（${answers.q4_interests.join('、')}）に直結する提案を5つ出力してください。`;

  return prompt;
}

// ========== HTML Generators ==========

function generateReportHTML(diagnosis) {
  const a = diagnosis.answers;
  const r = diagnosis.result;
  const date = new Date(diagnosis.createdAt).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const solutionsHTML = r.solutions.map((s, i) => `
        <div class="solution-card">
          <div class="solution-num">${String(i + 1).padStart(2, '0')}</div>
          <h3 class="solution-title">${escapeHTML(s.title)}</h3>
          <p class="solution-desc">${escapeHTML(s.description)}</p>
        </div>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI活用レベルチェック 診断レポート｜Ciras（シラス）株式会社</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" href="/images/favicon.ico" sizes="any">
  <link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&family=Shippori+Mincho:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
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
  </style>
</head>
<body>
  <header class="report-header">
    <div class="report-header-inner">
      <img src="/images/logo-white.png" alt="Ciras株式会社" class="report-logo">
      <p class="report-label">DIAGNOSTIC REPORT</p>
      <h1 class="report-title">AI活用レベルチェック 診断レポート</h1>
      <p class="report-date">${escapeHTML(date)}</p>
    </div>
  </header>

  <main class="report-body">
    <section class="report-section">
      <h2 class="report-section-title">回答内容</h2>
      <div class="answer-grid">
        <div class="answer-item">
          <p class="answer-label">立場</p>
          <p class="answer-value">${escapeHTML(a.q1_position)}</p>
        </div>
        <div class="answer-item">
          <p class="answer-label">業種</p>
          <p class="answer-value">${escapeHTML(a.q2_industry)}${a.q2_industry_other ? '（' + escapeHTML(a.q2_industry_other) + '）' : ''}</p>
        </div>
        <div class="answer-item">
          <p class="answer-label">従業員数</p>
          <p class="answer-value">${escapeHTML(a.q3_employees)}</p>
        </div>
        <div class="answer-item">
          <p class="answer-label">AI活用状況</p>
          <p class="answer-value">${escapeHTML(a.q6_ai_status)}</p>
        </div>
      </div>
      <div style="margin-top:1rem">
        <div class="answer-item">
          <p class="answer-label">AI活用の興味分野</p>
          <p class="answer-value">${escapeHTML(a.q4_interests.join('、'))}</p>
        </div>
      </div>
      ${a.q5_details ? `<div style="margin-top:1rem"><div class="answer-item"><p class="answer-label">詳細</p><p class="answer-value">${escapeHTML(a.q5_details)}</p></div></div>` : ''}
    </section>

    <section class="report-section">
      <h2 class="report-section-title">AIが提案する5つの解決案</h2>
      ${solutionsHTML}
    </section>
  </main>

  <section class="report-cta">
    <div class="report-cta-inner">
      <h2 class="report-cta-title mincho">この診断結果について、詳しく相談しませんか？</h2>
      <p class="report-cta-text">
        Ciras株式会社では、月額33,000円のAI顧問サービスで、<br>
        御社に合ったAI活用を一緒に考え、実行まで伴走します。
      </p>
      <a href="/contact.html" class="btn btn-primary">無料相談する</a>
      <a href="https://lin.ee/s2u6VUw" class="btn btn-secondary">LINEで相談</a>
    </div>
  </section>

  <footer class="report-footer">
    <p>&copy; 2026 Ciras Inc.（シラス株式会社）</p>
  </footer>
</body>
</html>`;
}

function generateNotFoundHTML() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>レポートが見つかりません｜Ciras株式会社</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600&family=Shippori+Mincho:wght@600&display=swap" rel="stylesheet">
  <style>
    :root{--green:#2D5A27;--black:#1A1A1A;--gray-dark:#4A4A4A;--bg:#FAFAFA}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Noto Sans JP',sans-serif;color:var(--black);line-height:1.9;background:var(--bg);font-size:15px;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem;text-align:center}
    h1{font-family:'Shippori Mincho',serif;font-size:1.5rem;margin-bottom:1rem;color:var(--green)}
    p{color:var(--gray-dark);margin-bottom:1.5rem}
    a{color:var(--green);font-weight:500}
  </style>
</head>
<body>
  <div>
    <h1>レポートが見つかりません</h1>
    <p>指定されたレポートは存在しないか、URLが正しくない可能性があります。</p>
    <a href="/">Ciras株式会社 トップページへ</a>
  </div>
</body>
</html>`;
}

function generateErrorHTML() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>エラー｜Ciras株式会社</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Noto Sans JP',sans-serif;color:#1A1A1A;line-height:1.9;background:#FAFAFA;font-size:15px;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem;text-align:center}
    h1{font-size:1.5rem;margin-bottom:1rem;color:#2D5A27}
    p{color:#4A4A4A;margin-bottom:1.5rem}
    a{color:#2D5A27;font-weight:500}
  </style>
</head>
<body>
  <div>
    <h1>エラーが発生しました</h1>
    <p>申し訳ございません。しばらくしてから再度お試しください。</p>
    <a href="/">トップページへ</a>
  </div>
</body>
</html>`;
}

// ========== Utilities ==========

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
