import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getXAccessToken } from '@/lib/platforms/x';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const oauthToken = searchParams.get('oauth_token');
    const oauthVerifier = searchParams.get('oauth_verifier');

    if (!oauthToken || !oauthVerifier) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=missing_params`
      );
    }

    const oauthTokenSecret = request.cookies.get('x_oauth_token_secret')?.value;
    if (!oauthTokenSecret) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=missing_secret`
      );
    }

    const tokens = await getXAccessToken(oauthToken, oauthTokenSecret, oauthVerifier);

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login`
      );
    }

    // Upsert social account
    await supabase
      .from('social_accounts')
      .upsert(
        {
          user_id: user.id,
          platform: 'x',
          platform_user_id: tokens.user_id,
          account_handle: `@${tokens.screen_name}`,
          encrypted_access_token: encrypt(tokens.oauth_token),
          encrypted_access_token_secret: encrypt(tokens.oauth_token_secret),
        },
        { onConflict: 'user_id,platform' }
      );

    const response = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?success=x_connected`
    );

    // Clear the oauth secret cookie
    response.cookies.delete('x_oauth_token_secret');

    return response;
  } catch (error) {
    console.error('X callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=x_callback_failed`
    );
  }
}
