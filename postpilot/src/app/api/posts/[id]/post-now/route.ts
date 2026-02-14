import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { executePostStep1 } from '@/lib/post-executor';
import type { Post } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const result = await executePostStep1(post as Post);

  return NextResponse.json({
    success: result.status !== 'failed',
    ...result,
  });
}
