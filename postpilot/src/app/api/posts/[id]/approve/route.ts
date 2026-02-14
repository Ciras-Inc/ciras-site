import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { assignSchedule } from '@/lib/scheduler';
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

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Update to approved
  await supabase
    .from('posts')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', id);

  // Assign schedule
  const scheduledAt = await assignSchedule(id, user.id);

  // Synchronously replenish stock (Constraint 2: no background processing)
  await replenishOne(user.id);

  return NextResponse.json({ success: true, scheduledAt });
}
