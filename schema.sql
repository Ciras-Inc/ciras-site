-- ============================================
-- 木村屋精肉店 予約管理システム
-- Cloudflare D1 (SQLite) スキーマ
-- ============================================

-- カテゴリ（牛肉、豚肉、鶏肉、惣菜・セット等）
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 商品
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  unit_type TEXT NOT NULL DEFAULT 'per_100g',
  min_quantity INTEGER DEFAULT 1,
  max_quantity INTEGER DEFAULT 50,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- クロスセル（おすすめ商品の紐付け）
CREATE TABLE IF NOT EXISTS cross_sell_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  suggested_product_id INTEGER NOT NULL,
  message TEXT DEFAULT 'こちらも一緒にいかがですか？',
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (suggested_product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 予約
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_note TEXT,
  visit_date TEXT NOT NULL,
  visit_time TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT,
  receipt_required INTEGER DEFAULT 0,
  receipt_name TEXT,
  is_early_bird INTEGER DEFAULT 0,
  subtotal INTEGER NOT NULL,
  discount_amount INTEGER DEFAULT 0,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 予約明細
CREATE TABLE IF NOT EXISTS reservation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_type TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  original_price INTEGER NOT NULL,
  line_total INTEGER NOT NULL,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

-- 店舗設定（Key-Value）
CREATE TABLE IF NOT EXISTS store_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 管理者
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_cross_sell_product ON cross_sell_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(visit_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_number ON reservations(reservation_number);
CREATE INDEX IF NOT EXISTS idx_reservation_items_reservation ON reservation_items(reservation_id);

-- 初期データ: デフォルト店舗設定
INSERT OR IGNORE INTO store_settings (key, value) VALUES
  ('store_name', '木村屋精肉店'),
  ('store_phone', ''),
  ('store_address', '愛媛県松山市'),
  ('business_hours_start', '10:00'),
  ('business_hours_end', '18:00'),
  ('closed_days', '[]'),
  ('closed_dates', '[]'),
  ('notification_email', ''),
  ('notification_line_webhook', ''),
  ('discount_rate', '5'),
  ('discount_deadline_hour', '16'),
  ('min_hours_before_visit', '3');

-- 初期データ: デフォルトカテゴリ
INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES
  (1, '牛肉', 1),
  (2, '豚肉', 2),
  (3, '鶏肉', 3),
  (4, '惣菜・セット', 4);

-- 初期データ: サンプル商品
INSERT OR IGNORE INTO products (id, category_id, name, description, price, unit_type, min_quantity) VALUES
  (1, 1, '国産牛切り落とし', '普段使いに最適。炒め物・すき焼き・肉じゃがなどに。', 580, 'per_100g', 1),
  (2, 1, '国産牛ステーキ用', '肉厚カットの赤身ステーキ。塩コショウでシンプルに。', 1280, 'per_100g', 1),
  (3, 1, '特選和牛すき焼き用', 'きめ細かなサシが入った上質な和牛。特別な日に。', 1980, 'per_100g', 1),
  (4, 2, '国産豚ロース', '生姜焼き・とんかつに最適な厚切りロース。', 380, 'per_100g', 1),
  (5, 2, '国産豚バラ', '角煮・焼肉・炒め物など万能に使える豚バラ。', 320, 'per_100g', 1),
  (6, 3, '若鶏もも肉', 'ジューシーな国産若鶏。唐揚げ・照り焼きに。', 198, 'per_100g', 1),
  (7, 3, '若鶏むね肉', 'ヘルシーで高タンパク。サラダチキンにも。', 128, 'per_100g', 1),
  (8, 4, '焼肉セット（2人前）', '牛カルビ・豚ロース・鶏もも・野菜付き。', 3980, 'set', 1),
  (9, 4, '自家製ハンバーグ（1個）', '合挽き肉を使った手ごねハンバーグ。約150g。', 350, 'set', 1),
  (10, 4, '手作りメンチカツ（1個）', 'サクサク衣の手作りメンチカツ。', 280, 'set', 1);

-- 初期データ: サンプルクロスセル
INSERT OR IGNORE INTO cross_sell_rules (product_id, suggested_product_id, message) VALUES
  (8, 1, '焼肉セットに追加のお肉はいかがですか？'),
  (1, 9, 'ハンバーグも一緒にいかがですか？'),
  (4, 10, 'メンチカツも一緒にいかがですか？');
