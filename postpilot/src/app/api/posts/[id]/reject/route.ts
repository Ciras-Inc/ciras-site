import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { replenishOne } from '@/lib/stock';

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

  const body = await request.json();
  const { feedback } = body;

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  await supabase
    .from('posts')
    .update({
      status: 'rejected',
      rejection_feedback: feedback || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  // Synchronously replenish stock
  await replenishOne(user.id);

  return NextResponse.json({ success: true });
}
