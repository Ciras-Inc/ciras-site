/**
 * 公開 予約作成API
 * POST /api/reservations
 * PayPay・現金の場合はここで予約を直接作成
 * クレジットカードの場合は /api/create-checkout-session へ誘導
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const DB = env.DB;
  const headers = { 'Content-Type': 'application/json' };

  try {
    const body = await request.json();
    const {
      visitDate, visitTime, customerName, customerPhone, customerEmail,
      customerNote, paymentMethod, receiptRequired, receiptName, items
    } = body;

    // バリデーション
    if (!visitDate || !visitTime || !customerName || !customerPhone || !customerEmail) {
      return new Response(JSON.stringify({ error: '必須項目が不足しています。' }), { status: 400, headers });
    }
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: '商品が選択されていません。' }), { status: 400, headers });
    }
    if (!['credit_card', 'paypay', 'cash'].includes(paymentMethod)) {
      return new Response(JSON.stringify({ error: '無効な決済方法です。' }), { status: 400, headers });
    }

    // クレジットカードは別のエンドポイントへ
    if (paymentMethod === 'credit_card') {
      return new Response(JSON.stringify({ error: 'クレジットカード決済は /api/create-checkout-session をご利用ください。' }), { status: 400, headers });
    }

    // 店舗設定の取得
    const settings = await getSettings(DB);
    const minHours = parseInt(settings.min_hours_before_visit || '3', 10);
    const discountRate = parseInt(settings.discount_rate || '5', 10) / 100;
    const deadlineHour = parseInt(settings.discount_deadline_hour || '16', 10);

    // 日時検証
    const visitDateTime = new Date(`${visitDate}T${visitTime}:00+09:00`);
    const now = new Date();
    const nowJST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

    if (visitDateTime <= nowJST) {
      return new Response(JSON.stringify({ error: '過去の日時は選択できません。' }), { status: 400, headers });
    }
    const minTime = new Date(visitDateTime.getTime() - minHours * 60 * 60 * 1000);
    if (nowJST > minTime) {
      return new Response(JSON.stringify({ error: `ご来店時間の${minHours}時間前を過ぎています。` }), { status: 400, headers });
    }

    // 早期割引判定
    const dayBefore = new Date(`${visitDate}T00:00:00+09:00`);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(deadlineHour, 0, 0, 0);
    const isEarlyBird = nowJST <= dayBefore;

    // 商品検証・価格計算（サーバー側で決定）
    let subtotal = 0;
    let originalTotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = await DB.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').bind(item.productId).first();
      if (!product) {
        return new Response(JSON.stringify({ error: `商品が見つかりません (ID: ${item.productId})` }), { status: 400, headers });
      }
      if (!Number.isInteger(item.quantity) || item.quantity < product.min_quantity || item.quantity > product.max_quantity) {
        return new Response(JSON.stringify({ error: `${product.name} の数量が不正です。` }), { status: 400, headers });
      }

      const unitPrice = isEarlyBird ? Math.floor(product.price * (1 - discountRate)) : product.price;
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      originalTotal += product.price * item.quantity;

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
    const reservationNumber = generateReservationNumber();

    // 予約保存
    const result = await DB.prepare(`
      INSERT INTO reservations (
        reservation_number, customer_name, customer_phone, customer_email, customer_note,
        visit_date, visit_time, payment_method, payment_status,
        receipt_required, receipt_name, is_early_bird,
        subtotal, discount_amount, total_amount, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 'confirmed')
    `).bind(
      reservationNumber, customerName, customerPhone, customerEmail, customerNote || '',
      visitDate, visitTime, paymentMethod,
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

    // 通知（非同期で実行、エラーがあっても予約は成立させる）
    sendNotifications(env, settings, { reservationNumber, customerName, visitDate, visitTime, totalAmount: subtotal, paymentMethod }).catch(console.error);

    return new Response(JSON.stringify({
      reservationNumber,
      totalAmount: subtotal,
      discountAmount,
      isEarlyBird,
      paymentMethod,
    }), { status: 201, headers });

  } catch (err) {
    console.error('Reservation error:', err);
    return new Response(JSON.stringify({ error: '予約の作成に失敗しました。' }), { status: 500, headers });
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

// ===== ヘルパー =====

function generateReservationNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return 'R' + date + '-' + rand;
}

async function getSettings(DB) {
  const { results } = await DB.prepare('SELECT key, value FROM store_settings').all();
  const settings = {};
  for (const row of results) settings[row.key] = row.value;
  return settings;
}

async function sendNotifications(env, settings, reservation) {
  const promises = [];

  // メール通知
  if (settings.notification_email) {
    // MailChannels API (Cloudflare Workers 無料)
    promises.push(
      fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: settings.notification_email }] }],
          from: { email: 'noreply@ciras.jp', name: settings.store_name || '精肉店予約システム' },
          subject: `【新規予約】${reservation.customerName}様 ${reservation.visitDate} ${reservation.visitTime}`,
          content: [{
            type: 'text/plain',
            value: [
              `新しい予約が入りました。`,
              ``,
              `予約番号: ${reservation.reservationNumber}`,
              `お客様名: ${reservation.customerName}`,
              `来店日時: ${reservation.visitDate} ${reservation.visitTime}`,
              `合計金額: ¥${reservation.totalAmount.toLocaleString()}`,
              `決済方法: ${reservation.paymentMethod === 'paypay' ? 'PayPay' : '現金'}`,
              ``,
              `管理画面で詳細を確認してください。`,
            ].join('\n'),
          }],
        }),
      }).catch(console.error)
    );
  }

  // LINE通知
  if (settings.notification_line_webhook) {
    const payMethodLabel = reservation.paymentMethod === 'paypay' ? 'PayPay' : '現金';
    promises.push(
      fetch(settings.notification_line_webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `【新規予約】\n${reservation.customerName}様\n${reservation.visitDate} ${reservation.visitTime}\n¥${reservation.totalAmount.toLocaleString()}\n決済: ${payMethodLabel}\n予約番号: ${reservation.reservationNumber}`,
        }),
      }).catch(console.error)
    );
  }

  await Promise.allSettled(promises);
}
