/**
 * Stripe Webhook ハンドラー
 *
 * POST /api/webhook
 *
 * Stripe Dashboard > Developers > Webhooks で以下を設定:
 *   エンドポイントURL: https://www.ciras.jp/api/webhook
 *   イベント: checkout.session.completed
 *
 * 環境変数:
 *   STRIPE_WEBHOOK_SECRET - Webhook 署名シークレット (whsec_...)
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const rawBody = await request.text();

  // Stripe 署名検証
  const isValid = await verifyStripeSignature(rawBody, signature, WEBHOOK_SECRET);
  if (!isValid) {
    console.error('Invalid Stripe signature');
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(rawBody);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const metadata = session.metadata || {};

      // 予約情報をログに記録
      console.log('=== 予約完了 ===');
      console.log('Session ID:', session.id);
      console.log('お客様名:', metadata.customer_name);
      console.log('電話番号:', metadata.customer_phone);
      console.log('メール:', session.customer_email);
      console.log('来店日:', metadata.visit_date);
      console.log('来店時間:', metadata.visit_time);
      console.log('早期割引:', metadata.is_early_bird);
      console.log('合計:', metadata.total_amount, '円');
      console.log('備考:', metadata.customer_note);
      console.log('支払い状態:', session.payment_status);
      console.log('================');

      // --- ここに追加処理を記述 ---
      // 例: メール通知、DB保存、スプレッドシート連携など
      // await sendNotificationEmail(metadata, session);
      // await saveToDatabase(metadata, session);

      break;
    }

    default:
      console.log('Unhandled event type:', event.type);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Stripe Webhook 署名の検証
 * stripe-signature ヘッダーの t= と v1= を使って HMAC-SHA256 で検証
 */
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

    // タイムスタンプが5分以内か確認（リプレイ攻撃防止）
    const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    if (age > 300) return false;

    const signedPayload = `${timestamp}.${payload}`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return computedSig === expectedSig;
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}
