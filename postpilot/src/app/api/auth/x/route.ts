import { NextResponse } from 'next/server';
import { getXRequestToken } from '@/lib/platforms/x';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { oauth_token, oauth_token_secret } = await getXRequestToken();

    const response = NextResponse.redirect(
      `https://api.x.com/oauth/authorize?oauth_token=${oauth_token}`
    );

    // Store oauth_token_secret in cookie for callback
    response.cookies.set('x_oauth_token_secret', oauth_token_secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('X auth error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=x_auth_failed`
    );
  }
}
