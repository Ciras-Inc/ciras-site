/**
 * 予約管理API（管理者用）
 * GET/PUT /api/admin/reservations
 */
const headers = { 'Content-Type': 'application/json' };

export async function onRequestGet(context) {
  const DB = context.env.DB;
  const url = new URL(context.request.url);
  const date = url.searchParams.get('date');
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = 50;
  const offset = (page - 1) * limit;

  let where = [];
  let bindings = [];

  if (date) {
    where.push('r.visit_date = ?');
    bindings.push(date);
  }
  if (status && status !== 'all') {
    where.push('r.status = ?');
    bindings.push(status);
  }
  if (search) {
    where.push('(r.customer_name LIKE ? OR r.customer_phone LIKE ? OR r.reservation_number LIKE ?)');
    const q = '%' + search + '%';
    bindings.push(q, q, q);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  // 件数
  const countQuery = `SELECT COUNT(*) as total FROM reservations r ${whereClause}`;
  const countStmt = bindings.length > 0 ? DB.prepare(countQuery).bind(...bindings) : DB.prepare(countQuery);
  const countResult = await countStmt.first();

  // 予約一覧
  const listQuery = `
    SELECT r.* FROM reservations r
    ${whereClause}
    ORDER BY r.visit_date DESC, r.visit_time ASC
    LIMIT ? OFFSET ?
  `;
  const listBindings = [...bindings, limit, offset];
  const { results: reservations } = await DB.prepare(listQuery).bind(...listBindings).all();

  // 各予約の明細を取得
  for (const r of reservations) {
    const { results: items } = await DB.prepare(
      'SELECT * FROM reservation_items WHERE reservation_id = ?'
    ).bind(r.id).all();
    r.items = items;
  }

  return new Response(JSON.stringify({
    reservations,
    total: countResult.total,
    page,
    totalPages: Math.ceil(countResult.total / limit)
  }), { headers });
}

// 予約ステータス更新（お渡し済み・キャンセル・決済状況変更）
export async function onRequestPut(context) {
  const DB = context.env.DB;
  const body = await context.request.json();
  const { id, status, payment_status } = body;

  if (!id) return new Response(JSON.stringify({ error: 'IDが必要です。' }), { status: 400, headers });

  const updates = [];
  const binds = [];

  if (status) {
    if (!['confirmed', 'picked_up', 'cancelled'].includes(status)) {
      return new Response(JSON.stringify({ error: '無効なステータスです。' }), { status: 400, headers });
    }
    updates.push('status = ?');
    binds.push(status);
  }
  if (payment_status) {
    if (!['pending', 'paid', 'refunded'].includes(payment_status)) {
      return new Response(JSON.stringify({ error: '無効な決済ステータスです。' }), { status: 400, headers });
    }
    updates.push('payment_status = ?');
    binds.push(payment_status);
  }

  if (updates.length === 0) {
    return new Response(JSON.stringify({ error: '更新する項目がありません。' }), { status: 400, headers });
  }

  updates.push("updated_at = datetime('now')");
  binds.push(id);

  await DB.prepare(`UPDATE reservations SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
  return new Response(JSON.stringify({ success: true }), { headers });
}
