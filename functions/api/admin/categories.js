/**
 * カテゴリ管理API
 * GET/POST/PUT/DELETE /api/admin/categories
 */
const headers = { 'Content-Type': 'application/json' };

export async function onRequestGet(context) {
  const DB = context.env.DB;
  const { results } = await DB.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
  return new Response(JSON.stringify(results), { headers });
}

export async function onRequestPost(context) {
  const DB = context.env.DB;
  const { name, sort_order } = await context.request.json();
  if (!name) return new Response(JSON.stringify({ error: 'カテゴリ名を入力してください。' }), { status: 400, headers });
  const result = await DB.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)').bind(name, sort_order || 0).run();
  return new Response(JSON.stringify({ id: result.meta.last_row_id, name, sort_order: sort_order || 0, is_active: 1 }), { status: 201, headers });
}

export async function onRequestPut(context) {
  const DB = context.env.DB;
  const { id, name, sort_order, is_active } = await context.request.json();
  if (!id || !name) return new Response(JSON.stringify({ error: 'IDとカテゴリ名は必須です。' }), { status: 400, headers });
  await DB.prepare('UPDATE categories SET name = ?, sort_order = ?, is_active = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .bind(name, sort_order ?? 0, is_active ?? 1, id).run();
  return new Response(JSON.stringify({ success: true }), { headers });
}

export async function onRequestDelete(context) {
  const DB = context.env.DB;
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'IDが必要です。' }), { status: 400, headers });
  const productCount = await DB.prepare('SELECT COUNT(*) as cnt FROM products WHERE category_id = ?').bind(id).first();
  if (productCount.cnt > 0) {
    return new Response(JSON.stringify({ error: 'このカテゴリに商品が登録されています。先に商品を移動または削除してください。' }), { status: 400, headers });
  }
  await DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ success: true }), { headers });
}
