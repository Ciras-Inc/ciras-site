import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generatePost } from '@/lib/ai/generate-post';
import type { GenerationRules, RuleTemplate } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { topic, inputId } = body;

  if (!topic) {
    return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
  }

  // Get rules
  const { data: rules } = await supabase
    .from('generation_rules')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!rules) {
    return NextResponse.json({ error: 'No generation rules found' }, { status: 400 });
  }

  // Get template
  const { data: template } = await supabase
    .from('rule_templates')
    .select('*')
    .eq('id', (rules as GenerationRules).active_template)
    .single();

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 400 });
  }

  // Get style profile
  let styleAnalysis = null;
  if ((rules as GenerationRules).style_profile_id) {
    const { data: profile } = await supabase
      .from('style_profiles')
      .select('analysis')
      .eq('id', (rules as GenerationRules).style_profile_id)
      .single();
    if (profile) styleAnalysis = profile.analysis;
  }

  // Get recent rejected for learning
  const { data: recentPosts } = await supabase
    .from('posts')
    .select('content_x, status, rejection_feedback')
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

  // Insert post
  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      user_id: user.id,
      content_x: generated.x,
      content_threads: generated.threads,
      status: 'pending',
      content_input_id: inputId || null,
      rule_template_id: (rules as GenerationRules).active_template,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Increment input used_count if inputId provided
  if (inputId) {
    const { data: inputData } = await supabase
      .from('content_inputs')
      .select('used_count')
      .eq('id', inputId)
      .single();
    if (inputData) {
      await supabase
        .from('content_inputs')
        .update({ used_count: (inputData.used_count || 0) + 1 })
        .eq('id', inputId);
    }
  }

  return NextResponse.json({ post });
}
