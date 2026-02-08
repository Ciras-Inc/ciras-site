/**
 * Stripe Checkout Session 作成 API（DB連携版）
 *
 * POST /api/create-checkout-session
 * クレジットカード決済時に呼ばれる。
 * 予約をDBに保存 → Stripe Checkout Session作成 → URLを返す
 *
 * 環境変数:
 *   STRIPE_SECRET_KEY    - Stripe シークレットキー
 *   SITE_URL             - サイトURL
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  const DB = env.DB;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json();
    const {
      visitDate, visitTime, customerName, customerPhone, customerEmail,
      customerNote, receiptRequired, receiptName, items
    } = body;

    // バリデーション
    if (!visitDate || !visitTime || !customerName || !customerPhone || !customerEmail) {
      return jsonResponse(400, { error: '必須項目が不足しています。' }, corsHeaders);
    }
    if (!items || items.length === 0) {
      return jsonResponse(400, { error: '商品が選択されていません。' }, corsHeaders);
    }

    // 店舗設定
    const settings = await getSettings(DB);
    const minHours = parseInt(settings.min_hours_before_visit || '3', 10);
    const discountRate = parseInt(settings.discount_rate || '5', 10) / 100;
    const deadlineHour = parseInt(settings.discount_deadline_hour || '16', 10);

    // 日時検証
    const visitDateTime = new Date(`${visitDate}T${visitTime}:00+09:00`);
    const now = new Date();
    const nowJST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

    if (visitDateTime <= nowJST) {
      return jsonResponse(400, { error: '過去の日時は選択できません。' }, corsHeaders);
    }
    const minTime = new Date(visitDateTime.getTime() - minHours * 60 * 60 * 1000);
    if (nowJST > minTime) {
      return jsonResponse(400, { error: `ご来店時間の${minHours}時間前を過ぎています。` }, corsHeaders);
    }

    // 早期割引判定
    const dayBefore = new Date(`${visitDate}T00:00:00+09:00`);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(deadlineHour, 0, 0, 0);
    const isEarlyBird = nowJST <= dayBefore;

    // 商品検証・Stripe Line Items構築
    const lineItems = [];
    const validatedItems = [];
    let subtotal = 0;
    let originalTotal = 0;

    for (const item of items) {
      const product = await DB.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').bind(item.productId).first();
      if (!product) {
        return jsonResponse(400, { error: `商品が見つかりません (ID: ${item.productId})` }, corsHeaders);
      }
      if (!Number.isInteger(item.quantity) || item.quantity < product.min_quantity || item.quantity > product.max_quantity) {
        return jsonResponse(400, { error: `${product.name} の数量が不正です。` }, corsHeaders);
      }

      const unitPrice = isEarlyBird ? Math.floor(product.price * (1 - discountRate)) : product.price;
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      originalTotal += product.price * item.quantity;

      const unitLabel = product.unit_type === 'per_100g' ? '100g' : 'セット';
      const productName = isEarlyBird ? `${product.name}（${Math.round(discountRate * 100)}%OFF）` : product.name;

      lineItems.push({
        name: productName,
        description: `${unitLabel}あたり ¥${unitPrice.toLocaleString()}`,
        unitAmount: unitPrice,
        quantity: item.quantity,
      });

      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        unit_type: product.unit_type,
        unit_price: unitPrice,
        original_price: product.price,
        line_total: lineTotal,
      });
    }

    const discountAmount = isEarlyBird ? originalTotal - subtotal : 0;

    // 予約番号生成
    const reservationNumber = 'R' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

    // Stripe Checkout Session 作成
    const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
      return jsonResponse(500, { error: 'Stripe設定が未完了です。' }, corsHeaders);
    }
    const SITE_URL = env.SITE_URL || 'https://www.ciras.jp';

    const stripeBody = new URLSearchParams();
    stripeBody.append('mode', 'payment');
    stripeBody.append('success_url', `${SITE_URL}/reservation-success.html?reservation=${reservationNumber}`);
    stripeBody.append('cancel_url', `${SITE_URL}/reservation-cancel.html`);
    stripeBody.append('customer_email', customerEmail);
    stripeBody.append('locale', 'ja');
    stripeBody.append('payment_method_types[0]', 'card');
    stripeBody.append('metadata[reservation_number]', reservationNumber);

    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i];
      stripeBody.append(`line_items[${i}][price_data][currency]`, 'jpy');
      stripeBody.append(`line_items[${i}][price_data][product_data][name]`, li.name);
      stripeBody.append(`line_items[${i}][price_data][product_data][description]`, li.description);
      stripeBody.append(`line_items[${i}][price_data][unit_amount]`, String(li.unitAmount));
      stripeBody.append(`line_items[${i}][quantity]`, String(li.quantity));
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: stripeBody.toString(),
    });

    const stripeData = await stripeRes.json();
    if (!stripeRes.ok) {
      console.error('Stripe error:', JSON.stringify(stripeData));
      return jsonResponse(500, { error: '決済セッションの作成に失敗しました。' }, corsHeaders);
    }

    // DB に予約保存（決済はまだ pending）
    const result = await DB.prepare(`
      INSERT INTO reservations (
        reservation_number, customer_name, customer_phone, customer_email, customer_note,
        visit_date, visit_time, payment_method, payment_status, stripe_session_id,
        receipt_required, receipt_name, is_early_bird,
        subtotal, discount_amount, total_amount, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'credit_card', 'pending', ?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).bind(
      reservationNumber, customerName, customerPhone, customerEmail, customerNote || '',
      visitDate, visitTime, stripeData.id,
      receiptRequired ? 1 : 0, receiptName || '',
      isEarlyBird ? 1 : 0,
      subtotal, discountAmount, subtotal
    ).run();

    const reservationId = result.meta.last_row_id;

    // 明細保存
    const itemBatch = validatedItems.map(item =>
      DB.prepare(`
        INSERT INTO reservation_items (reservation_id, product_id, product_name, quantity, unit_type, unit_price, original_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(reservationId, item.product_id, item.product_name, item.quantity, item.unit_type, item.unit_price, item.original_price, item.line_total)
    );
    await DB.batch(itemBatch);

    return jsonResponse(200, { url: stripeData.url, reservationNumber }, corsHeaders);

  } catch (err) {
    console.error('Server error:', err);
    return jsonResponse(500, { error: 'サーバーエラーが発生しました。' }, corsHeaders);
  }
}

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
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

async function getSettings(DB) {
  const { results } = await DB.prepare('SELECT key, value FROM store_settings').all();
  const settings = {};
  for (const row of results) settings[row.key] = row.value;
  return settings;
}
