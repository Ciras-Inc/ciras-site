/**
 * Stripe Checkout Session 作成 API
 *
 * POST /api/create-checkout-session
 *
 * 環境変数（Cloudflare Pages Settings > Environment Variables）:
 *   STRIPE_SECRET_KEY    - Stripe シークレットキー (sk_live_... or sk_test_...)
 *   STRIPE_WEBHOOK_SECRET - Stripe Webhook 署名シークレット (whsec_...)
 *   SITE_URL             - サイトURL (例: https://www.ciras.jp)
 */

const DISCOUNT_RATE = 0.05;

// 商品マスタ（フロントエンドと同一の定価を保持）
const PRODUCT_MASTER = {
  'beef-slices':   { name: '国産牛切り落とし',       price: 580,  unit: '100g' },
  'beef-steak':    { name: '国産牛ステーキ用',       price: 1280, unit: '100g' },
  'wagyu-sukiyaki':{ name: '特選和牛すき焼き用',     price: 1980, unit: '100g' },
  'pork-loin':     { name: '国産豚ロース',           price: 380,  unit: '100g' },
  'pork-belly':    { name: '国産豚バラ',             price: 320,  unit: '100g' },
  'chicken-thigh': { name: '若鶏もも肉',             price: 198,  unit: '100g' },
  'hamburg':       { name: '自家製ハンバーグ',       price: 350,  unit: '1個' },
  'menchi':        { name: '手作りメンチカツ',       price: 280,  unit: '1個' },
  'yakitori-set':  { name: '焼き鳥セット（5本入）', price: 680,  unit: '1パック' },
};

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS ヘッダー
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json();
    const { visitDate, visitTime, customerName, customerPhone, customerEmail, customerNote, items } = body;

    // --- バリデーション ---
    if (!visitDate || !visitTime || !customerName || !customerPhone || !customerEmail) {
      return jsonResponse(400, { error: '必須項目が不足しています。' }, corsHeaders);
    }
    if (!items || items.length === 0) {
      return jsonResponse(400, { error: '商品が選択されていません。' }, corsHeaders);
    }

    // 来店日時の解析
    const visitDateTime = new Date(`${visitDate}T${visitTime}:00+09:00`); // JST
    const now = new Date();
    // 現在時刻を JST に変換して比較
    const nowJST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

    // 過去チェック
    if (visitDateTime <= nowJST) {
      return jsonResponse(400, { error: '過去の日時は選択できません。' }, corsHeaders);
    }

    // 3時間前チェック
    const threeHoursBefore = new Date(visitDateTime.getTime() - 3 * 60 * 60 * 1000);
    if (nowJST > threeHoursBefore) {
      return jsonResponse(400, { error: 'ご来店時間の3時間前を過ぎています。別の日時をお選びください。' }, corsHeaders);
    }

    // 前日16:00までなら早期割引
    const dayBefore4pm = new Date(`${visitDate}T00:00:00+09:00`);
    dayBefore4pm.setDate(dayBefore4pm.getDate() - 1);
    dayBefore4pm.setHours(16, 0, 0, 0);
    const isEarlyBird = nowJST <= dayBefore4pm;

    // --- Line Items の構築（サーバー側で価格を決定）---
    const lineItems = [];
    let totalAmount = 0;

    for (const item of items) {
      const master = PRODUCT_MASTER[item.id];
      if (!master) {
        return jsonResponse(400, { error: `不明な商品: ${item.id}` }, corsHeaders);
      }
      if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99) {
        return jsonResponse(400, { error: `数量が不正です: ${item.id}` }, corsHeaders);
      }

      // サーバー側で価格決定（改ざん防止）
      const unitPrice = isEarlyBird
        ? Math.floor(master.price * (1 - DISCOUNT_RATE))
        : master.price;

      totalAmount += unitPrice * item.qty;

      const productName = isEarlyBird
        ? `${master.name}（5%OFF適用）`
        : master.name;

      lineItems.push({
        price_data: {
          currency: 'jpy',
          product_data: {
            name: productName,
            description: `${master.unit}あたり ¥${unitPrice.toLocaleString()}`,
          },
          unit_amount: unitPrice,
        },
        quantity: item.qty,
      });
    }

    // --- Stripe Checkout Session 作成 ---
    const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
      return jsonResponse(500, { error: 'Stripe設定が未完了です。管理者にお問い合わせください。' }, corsHeaders);
    }

    const SITE_URL = env.SITE_URL || 'https://www.ciras.jp';

    const stripeBody = new URLSearchParams();
    stripeBody.append('mode', 'payment');
    stripeBody.append('success_url', `${SITE_URL}/reservation-success.html?session_id={CHECKOUT_SESSION_ID}`);
    stripeBody.append('cancel_url', `${SITE_URL}/reservation-cancel.html`);
    stripeBody.append('customer_email', customerEmail);
    stripeBody.append('locale', 'ja');
    stripeBody.append('payment_method_types[0]', 'card');

    // メタデータ（予約情報の記録）
    stripeBody.append('metadata[visit_date]', visitDate);
    stripeBody.append('metadata[visit_time]', visitTime);
    stripeBody.append('metadata[customer_name]', customerName);
    stripeBody.append('metadata[customer_phone]', customerPhone);
    stripeBody.append('metadata[customer_note]', customerNote || '');
    stripeBody.append('metadata[is_early_bird]', isEarlyBird ? 'yes' : 'no');
    stripeBody.append('metadata[total_amount]', String(totalAmount));

    // Line Items
    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i];
      stripeBody.append(`line_items[${i}][price_data][currency]`, li.price_data.currency);
      stripeBody.append(`line_items[${i}][price_data][product_data][name]`, li.price_data.product_data.name);
      stripeBody.append(`line_items[${i}][price_data][product_data][description]`, li.price_data.product_data.description);
      stripeBody.append(`line_items[${i}][price_data][unit_amount]`, String(li.price_data.unit_amount));
      stripeBody.append(`line_items[${i}][quantity]`, String(li.quantity));
    }

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: stripeBody.toString(),
    });

    const stripeData = await stripeResponse.json();

    if (!stripeResponse.ok) {
      console.error('Stripe error:', JSON.stringify(stripeData));
      return jsonResponse(500, { error: '決済セッションの作成に失敗しました。' }, corsHeaders);
    }

    return jsonResponse(200, { url: stripeData.url, sessionId: stripeData.id }, corsHeaders);

  } catch (err) {
    console.error('Server error:', err);
    return jsonResponse(500, { error: 'サーバーエラーが発生しました。' }, corsHeaders);
  }
}

// OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}
