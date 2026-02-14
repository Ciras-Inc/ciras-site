export interface User {
  id: string;
  email: string;
  display_name: string | null;
  plan: string;
  timezone: string;
  created_at: string;
}

export interface SocialAccount {
  id: string;
  user_id: string;
  platform: 'x' | 'threads';
  platform_user_id: string | null;
  account_handle: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  encrypted_access_token_secret: string | null;
  token_expires_at: string | null;
  x_api_key: string | null;
  encrypted_x_api_secret: string | null;
  created_at: string;
}

export interface StyleProfile {
  id: string;
  user_id: string;
  profile_name: string;
  sample_posts: string[];
  sample_source: 'manual' | 'own_threads';
  source_handle: string | null;
  analysis: StyleAnalysis | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StyleAnalysis {
  tone: string;
  sentence_endings: string[];
  avg_length: number;
  line_break_style: string;
  emoji_usage: string;
  hashtag_style: string;
  vocabulary_level: string;
  recurring_themes: string[];
  hooks: string[];
  cta_style: string;
  personality_traits: string[];
  avoid_patterns: string[];
  summary: string;
}

export interface RuleTemplate {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  example_posts: string[] | null;
  is_system: boolean;
  user_id: string | null;
  created_at: string;
}

export interface GenerationRules {
  id: string;
  user_id: string;
  active_template: string;
  x_min_chars: number;
  x_max_chars: number;
  threads_min_chars: number;
  threads_max_chars: number;
  custom_rules: string | null;
  hashtag_min: number;
  hashtag_max: number;
  fixed_hashtags: string[] | null;
  emoji_usage: 'none' | 'minimal' | 'moderate' | 'heavy';
  prohibited_words: string[] | null;
  prohibited_topics: string[] | null;
  style_profile_id: string | null;
  updated_at: string;
}

export interface ContentInput {
  id: string;
  user_id: string;
  input_type: 'keyword' | 'topic' | 'text' | 'file' | 'url';
  content: string | null;
  original_content: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  source_url: string | null;
  extracted_data: Record<string, unknown> | null;
  used_count: number;
  is_active: boolean;
  created_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  content_x: string | null;
  content_threads: string | null;
  status: PostStatus;
  scheduled_at: string | null;
  posted_at: string | null;
  has_media: boolean;
  media_url: string | null;
  media_alt_text: string | null;
  content_input_id: string | null;
  rule_template_id: string | null;
  rejection_reason: string | null;
  rejection_feedback: string | null;
  generation_context: Record<string, unknown> | null;
  x_post_id: string | null;
  threads_post_id: string | null;
  threads_container_id: string | null;
  threads_container_created_at: string | null;
  x_metrics: Record<string, number> | null;
  threads_metrics: Record<string, number> | null;
  created_at: string;
  updated_at: string;
}

export type PostStatus =
  | 'generating'
  | 'pending'
  | 'approved'
  | 'scheduled'
  | 'posting'
  | 'posted'
  | 'partial'
  | 'failed'
  | 'rejected';

export interface ScheduleSettings {
  id: string;
  user_id: string;
  scheduling_mode: 'manual' | 'best_time' | 'fixed' | 'hybrid';
  day_posts: Record<string, number>;
  fixed_times: string[] | null;
  min_interval_hours: number;
  blackout_hours: number[];
  best_time_source: 'general' | 'self_learning' | 'both';
  timezone: string;
  updated_at: string;
}

export interface PostPerformance {
  id: string;
  post_id: string;
  user_id: string;
  platform: string;
  posted_at: string;
  day_of_week: number;
  hour_of_day: number;
  impressions: number;
  likes: number;
  reposts: number;
  replies: number;
  engagement_score: number;
  template_used: string;
  content_length: number;
  has_media: boolean;
  recorded_at: string;
}

export interface BestTime {
  id: string;
  user_id: string;
  source: 'general' | 'self_learning';
  day_of_week: number;
  hour: number;
  score: number;
  sample_size: number;
  updated_at: string;
}
