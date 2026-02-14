import { supabaseAdmin } from '@/lib/supabase/admin';
import { generatePost } from '@/lib/ai/generate-post';
import type { GenerationRules, RuleTemplate, ContentInput } from '@/types';

const STOCK_THRESHOLD = 10;

export async function replenishOne(userId: string): Promise<boolean> {
  // Check current stock level
  const { count } = await supabaseAdmin
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['pending', 'approved', 'scheduled']);

  if ((count || 0) >= STOCK_THRESHOLD) {
    return false;
  }

  // Get rules
  const { data: rules } = await supabaseAdmin
    .from('generation_rules')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!rules) return false;

  // Get template
  const { data: template } = await supabaseAdmin
    .from('rule_templates')
    .select('*')
    .eq('id', (rules as GenerationRules).active_template)
    .single();

  if (!template) return false;

  // Get style profile if set
  let styleAnalysis = null;
  if ((rules as GenerationRules).style_profile_id) {
    const { data: profile } = await supabaseAdmin
      .from('style_profiles')
      .select('analysis')
      .eq('id', (rules as GenerationRules).style_profile_id)
      .single();
    if (profile) styleAnalysis = profile.analysis;
  }

  // Get content input with lowest used_count
  const { data: inputs } = await supabaseAdmin
    .from('content_inputs')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('used_count', { ascending: true })
    .limit(1);

  const input = inputs?.[0] as ContentInput | undefined;
  const topic = input?.content || input?.original_content || 'ビジネスに関する有益な情報';

  // Get recent rejected posts for learning
  const { data: recentPosts } = await supabaseAdmin
    .from('posts')
    .select('content_x, status, rejection_feedback')
    .eq('user_id', userId)
    .eq('status', 'rejected')
    .order('created_at', { ascending: false })
    .limit(5);

  const generated = await generatePost({
    topic,
    template: template as RuleTemplate,
    rules: rules as GenerationRules,
    styleAnalysis,
    recentPosts: recentPosts || [],
  });

  await supabaseAdmin.from('posts').insert({
    user_id: userId,
    content_x: generated.x,
    content_threads: generated.threads,
    status: 'pending',
    content_input_id: input?.id || null,
    rule_template_id: (rules as GenerationRules).active_template,
  });

  // Increment used_count
  if (input) {
    await supabaseAdmin
      .from('content_inputs')
      .update({ used_count: (input.used_count || 0) + 1 })
      .eq('id', input.id);
  }

  return true;
}
