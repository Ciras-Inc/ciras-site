import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { exchangeThreadsCode, getThreadsProfile } from '@/lib/platforms/threads';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=threads_denied`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=missing_params`
      );
    }

    // Constraint 7: Verify state from cookie (CSRF protection)
    const savedState = request.cookies.get('threads_oauth_state')?.value;
    if (!savedState || savedState !== state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=invalid_state`
      );
    }

    const { accessToken, userId: threadsUserId } = await exchangeThreadsCode(code);

    // Get profile info
    const profile = await getThreadsProfile(accessToken);

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login`
      );
    }

    // Token expires in ~60 days
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    await supabase
      .from('social_accounts')
      .upsert(
        {
          user_id: user.id,
          platform: 'threads',
          platform_user_id: threadsUserId || profile.id,
          account_handle: `@${profile.username}`,
          encrypted_access_token: encrypt(accessToken),
          token_expires_at: tokenExpiresAt,
        },
        { onConflict: 'user_id,platform' }
      );

    const response = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?success=threads_connected`
    );

    // Clear the state cookie
    response.cookies.delete('threads_oauth_state');

    return response;
  } catch (error) {
    console.error('Threads callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=threads_callback_failed`
    );
  }
}
