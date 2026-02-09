/**
 * 店舗設定API（管理者用）
 * GET/PUT /api/admin/settings
 */
const headers = { 'Content-Type': 'application/json' };

export async function onRequestGet(context) {
  const DB = context.env.DB;
  const { results } = await DB.prepare('SELECT key, value FROM store_settings').all();
  const settings = {};
  for (const row of results) {
    settings[row.key] = row.value;
  }
  return new Response(JSON.stringify(settings), { headers });
}

export async function onRequestPut(context) {
  const DB = context.env.DB;
  const body = await context.request.json();

  const allowedKeys = [
    'store_name', 'store_phone', 'store_address',
    'business_hours_start', 'business_hours_end',
    'closed_days', 'closed_dates',
    'notification_email', 'notification_line_webhook',
    'discount_rate', 'discount_deadline_hour', 'min_hours_before_visit'
  ];

  const batch = [];
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      batch.push(
        DB.prepare("INSERT OR REPLACE INTO store_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))")
          .bind(key, String(body[key]))
      );
    }
  }

  if (batch.length > 0) {
    await DB.batch(batch);
  }

  return new Response(JSON.stringify({ success: true }), { headers });
}
