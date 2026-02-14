import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { analyzeStyle } from '@/lib/ai/analyze-style';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { samplePosts, profileName, sampleSource, sourceHandle } = body;

  if (!samplePosts || samplePosts.length < 5) {
    return NextResponse.json(
      { error: 'At least 5 sample posts required' },
      { status: 400 }
    );
  }

  const analysis = await analyzeStyle(samplePosts);

  const { data: profile, error } = await supabase
    .from('style_profiles')
    .upsert(
      {
        user_id: user.id,
        profile_name: profileName || 'default',
        sample_posts: samplePosts,
        sample_source: sampleSource || 'manual',
        source_handle: sourceHandle || null,
        analysis,
        analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Set as active profile in generation rules
  await supabase
    .from('generation_rules')
    .update({ style_profile_id: profile.id })
    .eq('user_id', user.id);

  return NextResponse.json({ profile });
}
