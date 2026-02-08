/**
 * 公開 商品一覧API
 * GET /api/products
 * カテゴリ・商品・クロスセルをまとめて返す
 */
export async function onRequestGet(context) {
  const DB = context.env.DB;
  const headers = { 'Content-Type': 'application/json' };

  const { results: categories } = await DB.prepare(
    'SELECT id, name FROM categories WHERE is_active = 1 ORDER BY sort_order, id'
  ).all();

  const { results: products } = await DB.prepare(
    'SELECT id, category_id, name, description, price, unit_type, min_quantity, max_quantity FROM products WHERE is_active = 1 ORDER BY sort_order, id'
  ).all();

  const { results: crossSell } = await DB.prepare(`
    SELECT cs.product_id, cs.suggested_product_id, cs.message
    FROM cross_sell_rules cs
    JOIN products p ON cs.suggested_product_id = p.id AND p.is_active = 1
    WHERE cs.is_active = 1
    ORDER BY cs.sort_order
  `).all();

  // 店舗設定も返す
  const { results: settingsRows } = await DB.prepare('SELECT key, value FROM store_settings').all();
  const settings = {};
  for (const row of settingsRows) {
    settings[row.key] = row.value;
  }

  return new Response(JSON.stringify({ categories, products, crossSell, settings }), { headers });
}
