import { supabaseAdmin } from '@/lib/supabase/admin';
// crypto used internally by platform libs
import { postToX } from '@/lib/platforms/x';
import {
  createThreadsContainer,
  publishThreadsContainer,
  refreshThreadsToken,
} from '@/lib/platforms/threads';
import type { Post, SocialAccount } from '@/types';

export { supabaseAdmin };

export async function getDecryptedAccount(
  userId: string,
  platform: 'x' | 'threads'
): Promise<SocialAccount | null> {
  const { data } = await supabaseAdmin
    .from('social_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', platform)
    .single();

  if (!data) return null;

  // Check Threads token expiry and refresh if needed
  if (platform === 'threads' && data.token_expires_at) {
    const expiresAt = new Date(data.token_expires_at);
    const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (expiresAt < oneDayFromNow) {
      await refreshThreadsToken(data as SocialAccount, supabaseAdmin);
      const { data: refreshed } = await supabaseAdmin
        .from('social_accounts')
        .select('*')
        .eq('id', data.id)
        .single();
      return refreshed as SocialAccount;
    }
  }

  return data as SocialAccount;
}

function determineStatus(
  hasXAccount: boolean,
  hasThreadsAccount: boolean,
  xOk: boolean,
  thOk: boolean
): 'posted' | 'partial' | 'failed' {
  // Constraint 6: if only connected platforms succeeded, it's "posted"
  const allConnectedOk = (!hasXAccount || xOk) && (!hasThreadsAccount || thOk);
  if (allConnectedOk) return 'posted';

  const anyOk = xOk || thOk;
  if (anyOk) return 'partial';
  return 'failed';
}

/**
 * Hobby plan: X post + Threads container creation (+ text-only publish with 2s wait)
 */
export async function executePostHobby(post: Post): Promise<{
  status: string;
  xPostId?: string;
  threadsPostId?: string;
  threadsContainerId?: string;
  needsThreadsPublish: boolean;
}> {
  const xAccount = await getDecryptedAccount(post.user_id, 'x');
  const thAccount = await getDecryptedAccount(post.user_id, 'threads');

  let xOk = false;
  let thOk = false;
  let xPostId: string | undefined;
  let threadsPostId: string | undefined;
  let threadsContainerId: string | undefined;
  let needsThreadsPublish = false;

  // Post to X
  if (xAccount && post.content_x) {
    const result = await postToX(post.content_x, xAccount, post.media_url || undefined);
    if (result) {
      xOk = true;
      xPostId = result.id;
    }
  }

  // Create Threads container
  if (thAccount && post.content_threads) {
    const container = await createThreadsContainer(
      post.content_threads,
      thAccount,
      post.media_url || undefined
    );
    if (container) {
      threadsContainerId = container.id;

      if (!post.has_media) {
        // Text-only: wait 2s then publish immediately
        await new Promise(r => setTimeout(r, 2000));
        const published = await publishThreadsContainer(thAccount, container.id);
        if (published) {
          thOk = true;
          threadsPostId = published.id;
        }
      } else {
        // Image: save container, publish later
        needsThreadsPublish = true;
        await supabaseAdmin
          .from('posts')
          .update({
            threads_container_id: container.id,
            threads_container_created_at: new Date().toISOString(),
          })
          .eq('id', post.id);
      }
    }
  }

  const status = determineStatus(!!xAccount, !!thAccount, xOk, thOk || needsThreadsPublish);

  const updateData: Record<string, unknown> = {
    status: needsThreadsPublish ? 'posting' : status,
    posted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (xPostId) updateData.x_post_id = xPostId;
  if (threadsPostId) updateData.threads_post_id = threadsPostId;

  await supabaseAdmin.from('posts').update(updateData).eq('id', post.id);

  await logPerformance(post, xOk, thOk);

  return { status, xPostId, threadsPostId, threadsContainerId, needsThreadsPublish };
}

/**
 * Pro plan step 1: X post + Threads container (no publish)
 */
export async function executePostStep1(post: Post): Promise<{
  status: string;
  xPostId?: string;
  threadsContainerId?: string;
  needsThreadsPublish: boolean;
}> {
  const xAccount = await getDecryptedAccount(post.user_id, 'x');
  const thAccount = await getDecryptedAccount(post.user_id, 'threads');

  let xOk = false;
  let xPostId: string | undefined;
  let threadsContainerId: string | undefined;
  let needsThreadsPublish = false;

  // Post to X
  if (xAccount && post.content_x) {
    const result = await postToX(post.content_x, xAccount, post.media_url || undefined);
    if (result) {
      xOk = true;
      xPostId = result.id;
    }
  }

  // Create Threads container only
  if (thAccount && post.content_threads) {
    const container = await createThreadsContainer(
      post.content_threads,
      thAccount,
      post.media_url || undefined
    );
    if (container) {
      threadsContainerId = container.id;
      needsThreadsPublish = true;
      await supabaseAdmin
        .from('posts')
        .update({
          threads_container_id: container.id,
          threads_container_created_at: new Date().toISOString(),
        })
        .eq('id', post.id);
    }
  }

  const updateData: Record<string, unknown> = {
    status: needsThreadsPublish ? 'posting' : (xOk ? 'posted' : 'failed'),
    posted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (xPostId) updateData.x_post_id = xPostId;

  await supabaseAdmin.from('posts').update(updateData).eq('id', post.id);

  return { status: updateData.status as string, xPostId, threadsContainerId, needsThreadsPublish };
}

/**
 * Publish Threads container only (step 2)
 */
export async function executePublishThreadsOnly(post: Post): Promise<{
  success: boolean;
  threadsPostId?: string;
}> {
  if (!post.threads_container_id) {
    return { success: false };
  }

  const thAccount = await getDecryptedAccount(post.user_id, 'threads');
  if (!thAccount) return { success: false };

  const published = await publishThreadsContainer(thAccount, post.threads_container_id);
  if (!published) {
    await supabaseAdmin
      .from('posts')
      .update({ status: 'partial', updated_at: new Date().toISOString() })
      .eq('id', post.id);
    return { success: false };
  }

  const xAccount = await getDecryptedAccount(post.user_id, 'x');
  const xOk = !!post.x_post_id;
  const status = determineStatus(!!xAccount, true, xOk, true);

  await supabaseAdmin
    .from('posts')
    .update({
      status,
      threads_post_id: published.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', post.id);

  await logPerformance(post, xOk, true);

  return { success: true, threadsPostId: published.id };
}

export async function logPerformance(
  post: Post,
  xOk: boolean,
  thOk: boolean
): Promise<void> {
  const now = new Date();
  const records = [];

  if (xOk && post.content_x) {
    records.push({
      post_id: post.id,
      user_id: post.user_id,
      platform: 'x',
      posted_at: now.toISOString(),
      day_of_week: now.getDay(),
      hour_of_day: now.getHours(),
      template_used: post.rule_template_id,
      content_length: post.content_x.length,
      has_media: post.has_media,
    });
  }

  if (thOk && post.content_threads) {
    records.push({
      post_id: post.id,
      user_id: post.user_id,
      platform: 'threads',
      posted_at: now.toISOString(),
      day_of_week: now.getDay(),
      hour_of_day: now.getHours(),
      template_used: post.rule_template_id,
      content_length: post.content_threads.length,
      has_media: post.has_media,
    });
  }

  if (records.length > 0) {
    await supabaseAdmin.from('post_performance').insert(records);
  }
}
