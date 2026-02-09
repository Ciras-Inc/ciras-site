/**
 * クロスセル管理API
 * GET/POST/PUT/DELETE /api/admin/cross-sell
 */
const headers = { 'Content-Type': 'application/json' };

export async function onRequestGet(context) {
  const DB = context.env.DB;
  const { results } = await DB.prepare(`
    SELECT cs.*,
      p1.name as product_name,
      p2.name as suggested_product_name,
      p2.price as suggested_product_price,
      p2.unit_type as suggested_product_unit_type
    FROM cross_sell_rules cs
    LEFT JOIN products p1 ON cs.product_id = p1.id
    LEFT JOIN products p2 ON cs.suggested_product_id = p2.id
    ORDER BY cs.product_id, cs.sort_order
  `).all();
  return new Response(JSON.stringify(results), { headers });
}

export async function onRequestPost(context) {
  const DB = context.env.DB;
  const { product_id, suggested_product_id, message, sort_order } = await context.request.json();

  if (!product_id || !suggested_product_id) {
    return new Response(JSON.stringify({ error: '対象商品とおすすめ商品を選択してください。' }), { status: 400, headers });
  }
  if (product_id === suggested_product_id) {
    return new Response(JSON.stringify({ error: '同じ商品は設定できません。' }), { status: 400, headers });
  }

  const result = await DB.prepare(
    'INSERT INTO cross_sell_rules (product_id, suggested_product_id, message, sort_order) VALUES (?, ?, ?, ?)'
  ).bind(product_id, suggested_product_id, message || 'こちらも一緒にいかがですか？', sort_order || 0).run();

  return new Response(JSON.stringify({ id: result.meta.last_row_id }), { status: 201, headers });
}

export async function onRequestPut(context) {
  const DB = context.env.DB;
  const { id, product_id, suggested_product_id, message, sort_order, is_active } = await context.request.json();

  if (!id) return new Response(JSON.stringify({ error: 'IDが必要です。' }), { status: 400, headers });

  await DB.prepare(`
    UPDATE cross_sell_rules SET
      product_id = ?, suggested_product_id = ?, message = ?,
      sort_order = ?, is_active = ?
    WHERE id = ?
  `).bind(product_id, suggested_product_id, message || 'こちらも一緒にいかがですか？', sort_order || 0, is_active ?? 1, id).run();

  return new Response(JSON.stringify({ success: true }), { headers });
}

export async function onRequestDelete(context) {
  const DB = context.env.DB;
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'IDが必要です。' }), { status: 400, headers });
  await DB.prepare('DELETE FROM cross_sell_rules WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ success: true }), { headers });
}
