CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  plan TEXT DEFAULT 'free',
  timezone TEXT DEFAULT 'Asia/Tokyo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('x', 'threads')),
  platform_user_id TEXT,
  account_handle TEXT NOT NULL,
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  encrypted_access_token_secret TEXT,
  token_expires_at TIMESTAMPTZ,
  x_api_key TEXT,
  encrypted_x_api_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

CREATE TABLE style_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  profile_name TEXT NOT NULL,
  sample_posts TEXT[] NOT NULL,
  sample_source TEXT DEFAULT 'manual' CHECK (sample_source IN ('manual', 'own_threads')),
  source_handle TEXT,
  analysis JSONB,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rule_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  example_posts TEXT[],
  is_system BOOLEAN DEFAULT TRUE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO rule_templates (id, name, description, system_prompt) VALUES
('business', 'ビジネス・専門家', '信頼感のある専門的な投稿。', '以下のルールで投稿文を作成してください：
- 専門家としての信頼感がある文体
- 具体的な数字や事例を可能な限り含める
- 断定的すぎず、読者に考える余地を残す
- 改行を効果的に使い、読みやすくする
- 最後に行動を促すか、問いかけで終わる'),
('casual', 'カジュアル・親しみやすい', '友人に話しかけるような温かみのある文体。', '以下のルールで投稿文を作成してください：
- 友人に話しかけるような自然な口調
- 日常の体験や気づきから始める
- 共感を誘うフレーズを入れる
- 読んだ人がほっこりするような終わり方'),
('educational', '教育・解説系', '「なるほど！」と思わせる知識共有型。', '以下のルールで投稿文を作成してください：
- 1投稿1テーマに絞る
- 最初の1文で「おっ」と思わせる事実や問いかけ
- 専門用語は必ず噛み砕いて説明
- 箇条書きは使わず、ストーリーで語る'),
('provocative', '問題提起・議論喚起', '業界の常識に一石を投じる挑戦的な投稿。', '以下のルールで投稿文を作成してください：
- 業界の「当たり前」に疑問を投げかける
- 具体的な根拠を必ず添える
- 攻撃的にならず、建設的な議論を促す
- 最後は問いかけで終わる'),
('storytelling', 'ストーリーテリング', '体験談やエピソードで共感を生む投稿。', '以下のルールで投稿文を作成してください：
- 具体的なエピソードから始める
- 場面が目に浮かぶような描写を入れる
- 起承転結の流れを意識する
- 最後に学びや気づきをさりげなく添える');

CREATE TABLE generation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  active_template TEXT DEFAULT 'business',
  x_min_chars INT DEFAULT 60, x_max_chars INT DEFAULT 140,
  threads_min_chars INT DEFAULT 80, threads_max_chars INT DEFAULT 300,
  custom_rules TEXT,
  hashtag_min INT DEFAULT 0, hashtag_max INT DEFAULT 3,
  fixed_hashtags TEXT[],
  emoji_usage TEXT DEFAULT 'moderate' CHECK (emoji_usage IN ('none', 'minimal', 'moderate', 'heavy')),
  prohibited_words TEXT[], prohibited_topics TEXT[],
  style_profile_id UUID REFERENCES style_profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE content_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  input_type TEXT NOT NULL CHECK (input_type IN ('keyword', 'topic', 'text', 'file', 'url')),
  content TEXT, original_content TEXT,
  file_path TEXT, file_name TEXT, file_type TEXT, source_url TEXT,
  extracted_data JSONB, used_count INT DEFAULT 0, is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_x TEXT, content_threads TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('generating','pending','approved','scheduled','posting','posted','partial','failed','rejected')),
  scheduled_at TIMESTAMPTZ, posted_at TIMESTAMPTZ,
  has_media BOOLEAN DEFAULT FALSE, media_url TEXT, media_alt_text TEXT,
  content_input_id UUID REFERENCES content_inputs(id) ON DELETE SET NULL,
  rule_template_id TEXT REFERENCES rule_templates(id) ON DELETE SET NULL,
  rejection_reason TEXT, rejection_feedback TEXT, generation_context JSONB,
  x_post_id TEXT, threads_post_id TEXT,
  threads_container_id TEXT, threads_container_created_at TIMESTAMPTZ,
  x_metrics JSONB, threads_metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE schedule_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  scheduling_mode TEXT DEFAULT 'hybrid' CHECK (scheduling_mode IN ('manual','best_time','fixed','hybrid')),
  day_posts JSONB DEFAULT '{"mon":2,"tue":2,"wed":2,"thu":2,"fri":2,"sat":1,"sun":1}',
  fixed_times JSONB, min_interval_hours FLOAT DEFAULT 3,
  blackout_hours INT[] DEFAULT '{0,1,2,3,4,5}',
  best_time_source TEXT DEFAULT 'general' CHECK (best_time_source IN ('general','self_learning','both')),
  timezone TEXT DEFAULT 'Asia/Tokyo', updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE post_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT, posted_at TIMESTAMPTZ, day_of_week INT, hour_of_day INT,
  impressions INT DEFAULT 0, likes INT DEFAULT 0, reposts INT DEFAULT 0, replies INT DEFAULT 0,
  engagement_score FLOAT, template_used TEXT, content_length INT, has_media BOOLEAN,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE best_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT CHECK (source IN ('general','self_learning')),
  day_of_week INT, hour INT, score FLOAT, sample_size INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, source, day_of_week, hour)
);

CREATE TABLE default_best_times (
  source TEXT DEFAULT 'general', day_of_week INT NOT NULL, hour INT NOT NULL, score FLOAT NOT NULL
);

INSERT INTO default_best_times (day_of_week, hour, score) VALUES
(1,7,6.0),(1,8,8.0),(1,12,9.0),(1,17,7.0),(1,18,8.5),(1,19,8.0),(1,20,7.5),(1,21,6.5),
(2,7,6.5),(2,8,8.5),(2,12,9.5),(2,17,7.5),(2,18,8.5),(2,19,8.0),(2,20,7.5),(2,21,7.0),
(3,7,6.0),(3,8,8.0),(3,12,9.0),(3,17,7.0),(3,18,8.0),(3,19,7.5),(3,20,7.0),(3,21,6.5),
(4,7,6.5),(4,8,8.0),(4,12,9.5),(4,17,7.5),(4,18,9.0),(4,19,8.5),(4,20,7.5),(4,21,7.0),
(5,7,6.0),(5,8,7.5),(5,12,9.0),(5,17,7.0),(5,18,8.0),(5,19,7.5),(5,20,7.0),(5,21,6.0),
(6,9,6.0),(6,10,7.0),(6,11,7.5),(6,12,7.0),(6,14,6.5),(6,15,7.0),(6,16,7.0),(6,17,7.5),
(0,9,5.5),(0,10,6.5),(0,11,7.0),(0,12,6.5),(0,15,6.5),(0,16,7.0),(0,17,6.5),(0,20,6.0);

-- auth.users → public.users auto-sync trigger
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email) VALUES (NEW.id, NEW.email);
  INSERT INTO public.generation_rules (user_id) VALUES (NEW.id);
  INSERT INTO public.schedule_settings (user_id) VALUES (NEW.id);
  INSERT INTO public.best_times (user_id, source, day_of_week, hour, score)
    SELECT NEW.id, source, day_of_week, hour, score FROM public.default_best_times;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE best_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_templates ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE tbl TEXT; BEGIN
  FOR tbl IN SELECT unnest(ARRAY['social_accounts','style_profiles','generation_rules','content_inputs','posts','schedule_settings','post_performance','best_times']) LOOP
    EXECUTE format('CREATE POLICY "users_own_data" ON %I FOR ALL USING (user_id = auth.uid())', tbl);
  END LOOP;
END $$;

CREATE POLICY "templates_read" ON rule_templates FOR SELECT USING (is_system = TRUE OR user_id = auth.uid());
CREATE POLICY "templates_write" ON rule_templates FOR ALL USING (user_id = auth.uid());
