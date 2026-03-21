import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthorizationUrl,
} from '@/lib/fitbit/oauth';

const PKCE_COOKIE_NAME = 'fitbit_pkce';
const PKCE_COOKIE_MAX_AGE = 600; // 10 minutes

export async function GET() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Store PKCE verifier + state in an httpOnly cookie
  const cookieStore = await cookies();
  cookieStore.set(PKCE_COOKIE_NAME, JSON.stringify({ codeVerifier, state }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: PKCE_COOKIE_MAX_AGE,
    path: '/',
  });

  const authUrl = buildAuthorizationUrl(codeChallenge, state);
  return NextResponse.redirect(authUrl);
}
