import { NextRequest, NextResponse } from 'next/server';
import {
  supabaseAdmin,
  executePostHobby,
  executePostStep1,
  executePublishThreadsOnly,
} from '@/lib/post-executor';
import type { Post } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isHobby = process.env.VERCEL_PLAN !== 'pro';
  const now = new Date().toISOString();

  try {
    if (isHobby) {
      // Hobby: process 1 scheduled post at a time (10s limit)
      // First: publish any pending Threads containers (30s+ old)
      const thirtySecsAgo = new Date(Date.now() - 30000).toISOString();
      const { data: pendingContainers } = await supabaseAdmin
        .from('posts')
        .select('*')
        .eq('status', 'posting')
        .not('threads_container_id', 'is', null)
        .lte('threads_container_created_at', thirtySecsAgo)
        .limit(1);

      if (pendingContainers?.length) {
        const post = pendingContainers[0] as Post;
        await executePublishThreadsOnly(post);
        return NextResponse.json({ action: 'threads_publish', postId: post.id });
      }

      // Then: process next scheduled post
      const { data: scheduled } = await supabaseAdmin
        .from('posts')
        .select('*')
        .eq('status', 'scheduled')
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(1);

      if (!scheduled?.length) {
        return NextResponse.json({ action: 'none' });
      }

      const post = scheduled[0] as Post;
      const result = await executePostHobby(post);
      return NextResponse.json({ action: 'post_hobby', postId: post.id, result });
    } else {
      // Pro: process up to 5 scheduled posts
      // First: publish containers older than 5s
      const fiveSecsAgo = new Date(Date.now() - 5000).toISOString();
      const { data: pendingContainers } = await supabaseAdmin
        .from('posts')
        .select('*')
        .eq('status', 'posting')
        .not('threads_container_id', 'is', null)
        .lte('threads_container_created_at', fiveSecsAgo)
        .limit(5);

      if (pendingContainers?.length) {
        for (const post of pendingContainers) {
          await executePublishThreadsOnly(post as Post);
        }
      }

      // Then: process scheduled posts
      const { data: scheduled } = await supabaseAdmin
        .from('posts')
        .select('*')
        .eq('status', 'scheduled')
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(5);

      if (!scheduled?.length) {
        return NextResponse.json({
          action: 'containers_only',
          containersPublished: pendingContainers?.length || 0,
        });
      }

      const results = [];
      for (const post of scheduled) {
        const result = await executePostStep1(post as Post);
        results.push({ postId: post.id, ...result });
      }

      return NextResponse.json({ action: 'post_pro', results });
    }
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json(
      { error: 'Cron execution failed' },
      { status: 500 }
    );
  }
}
