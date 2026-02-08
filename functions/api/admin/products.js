/**
 * 商品管理API
 * GET/POST/PUT/DELETE /api/admin/products
 */
const headers = { 'Content-Type': 'application/json' };

export async function onRequestGet(context) {
  const DB = context.env.DB;
  const url = new URL(context.request.url);
  const categoryId = url.searchParams.get('category_id');

  let query = `
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
  `;
  const bindings = [];

  if (categoryId) {
    query += ' WHERE p.category_id = ?';
    bindings.push(categoryId);
  }
  query += ' ORDER BY p.sort_order, p.id';

  const stmt = bindings.length > 0
    ? DB.prepare(query).bind(...bindings)
    : DB.prepare(query);
  const { results } = await stmt.all();
  return new Response(JSON.stringify(results), { headers });
}

export async function onRequestPost(context) {
  const DB = context.env.DB;
  const body = await context.request.json();
  const { category_id, name, description, price, unit_type, min_quantity, max_quantity, sort_order } = body;

  if (!category_id || !name || price === undefined) {
    return new Response(JSON.stringify({ error: 'カテゴリ・商品名・価格は必須です。' }), { status: 400, headers });
  }

  const result = await DB.prepare(`
    INSERT INTO products (category_id, name, description, price, unit_type, min_quantity, max_quantity, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    category_id, name, description || '', price,
    unit_type || 'per_100g', min_quantity || 1, max_quantity || 50, sort_order || 0
  ).run();

  return new Response(JSON.stringify({ id: result.meta.last_row_id }), { status: 201, headers });
}

export async function onRequestPut(context) {
  const DB = context.env.DB;
  const body = await context.request.json();
  const { id, category_id, name, description, price, unit_type, min_quantity, max_quantity, is_active, sort_order } = body;

  if (!id || !name || price === undefined) {
    return new Response(JSON.stringify({ error: 'ID・商品名・価格は必須です。' }), { status: 400, headers });
  }

  await DB.prepare(`
    UPDATE products SET
      category_id = ?, name = ?, description = ?, price = ?,
      unit_type = ?, min_quantity = ?, max_quantity = ?,
      is_active = ?, sort_order = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    category_id, name, description || '', price,
    unit_type || 'per_100g', min_quantity || 1, max_quantity || 50,
    is_active ?? 1, sort_order || 0, id
  ).run();

  return new Response(JSON.stringify({ success: true }), { headers });
}

export async function onRequestDelete(context) {
  const DB = context.env.DB;
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'IDが必要です。' }), { status: 400, headers });

  // 関連するクロスセルルールも削除
  await DB.prepare('DELETE FROM cross_sell_rules WHERE product_id = ? OR suggested_product_id = ?').bind(id, id).run();
  await DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ success: true }), { headers });
}
