/**
 * Stripe Webhook ハンドラー（DB連携版）
 * checkout.session.completed → 予約の payment_status を 'paid' に更新
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  const DB = env.DB;

  const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature', { status: 400 });
  }

  const rawBody = await request.text();

  const isValid = await verifyStripeSignature(rawBody, signature, WEBHOOK_SECRET);
  if (!isValid) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(rawBody);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const reservationNumber = session.metadata?.reservation_number;

    if (reservationNumber) {
      // 決済完了 → payment_status を paid に更新
      await DB.prepare(
        "UPDATE reservations SET payment_status = 'paid', updated_at = datetime('now') WHERE reservation_number = ? AND payment_method = 'credit_card'"
      ).bind(reservationNumber).run();

      console.log(`Payment completed for reservation: ${reservationNumber}`);

      // 通知送信
      try {
        const settings = await getSettings(DB);
        const reservation = await DB.prepare('SELECT * FROM reservations WHERE reservation_number = ?').bind(reservationNumber).first();
        if (reservation) {
          await sendNotifications(env, settings, reservation);
        }
      } catch (e) {
        console.error('Notification error:', e);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getSettings(DB) {
  const { results } = await DB.prepare('SELECT key, value FROM store_settings').all();
  const s = {};
  for (const r of results) s[r.key] = r.value;
  return s;
}

async function sendNotifications(env, settings, reservation) {
  const payLabel = 'クレジットカード（決済済み）';
  const promises = [];

  if (settings.notification_email) {
    promises.push(
      fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: settings.notification_email }] }],
          from: { email: 'noreply@ciras.jp', name: settings.store_name || '精肉店予約システム' },
          subject: `【新規予約・決済済】${reservation.customer_name}様 ${reservation.visit_date} ${reservation.visit_time}`,
          content: [{ type: 'text/plain', value: `新しい予約が入りました（カード決済済み）。\n\n予約番号: ${reservation.reservation_number}\nお客様: ${reservation.customer_name}\n来店: ${reservation.visit_date} ${reservation.visit_time}\n合計: ¥${reservation.total_amount}\n決済: ${payLabel}` }],
        }),
      }).catch(console.error)
    );
  }

  if (settings.notification_line_webhook) {
    promises.push(
      fetch(settings.notification_line_webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `【新規予約・決済済】\n${reservation.customer_name}様\n${reservation.visit_date} ${reservation.visit_time}\n¥${reservation.total_amount}\n決済: ${payLabel}\n予約番号: ${reservation.reservation_number}`,
        }),
      }).catch(console.error)
    );
  }

  await Promise.allSettled(promises);
}

async function verifyStripeSignature(payload, sigHeader, secret) {
  try {
    const parts = sigHeader.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key.trim()] = value;
      return acc;
    }, {});
    const timestamp = parts['t'];
    const expectedSig = parts['v1'];
    if (!timestamp || !expectedSig) return false;
    if (Math.floor(Date.now() / 1000) - parseInt(timestamp, 10) > 300) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`));
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    return computed === expectedSig;
  } catch { return false; }
}
