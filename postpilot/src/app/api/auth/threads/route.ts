import { NextResponse } from 'next/server';
import { getThreadsAuthUrl } from '@/lib/platforms/threads';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Constraint 7: Generate state for CSRF protection and store in cookie
    const state = crypto.randomBytes(32).toString('hex');

    const authUrl = getThreadsAuthUrl(state);

    const response = NextResponse.redirect(authUrl);

    response.cookies.set('threads_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Threads auth error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=threads_auth_failed`
    );
  }
}
