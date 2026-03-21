import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { fitbitTokens } from '@/lib/db/schema';
import { exchangeCodeForTokens } from '@/lib/fitbit/oauth';

const PKCE_COOKIE_NAME = 'fitbit_pkce';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle user denial or Fitbit errors
  if (error) {
    console.error('[fitbit] OAuth error from Fitbit:', error);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    return NextResponse.redirect(`${baseUrl}/?error=fitbit_denied`);
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: 'Missing code or state parameter' },
      { status: 400 }
    );
  }

  // Read and validate PKCE cookie
  const cookieStore = await cookies();
  const pkceCookie = cookieStore.get(PKCE_COOKIE_NAME);

  if (!pkceCookie?.value) {
    return NextResponse.json(
      { error: 'PKCE cookie missing — authorization may have expired (10 min timeout)' },
      { status: 400 }
    );
  }

  let storedData: { codeVerifier: string; state: string };
  try {
    storedData = JSON.parse(pkceCookie.value);
  } catch {
    return NextResponse.json(
      { error: 'Invalid PKCE cookie' },
      { status: 400 }
    );
  }

  // CSRF check: validate state matches
  if (state !== storedData.state) {
    console.error('[fitbit] State mismatch — possible CSRF attack');
    return NextResponse.json(
      { error: 'State mismatch — possible CSRF attack' },
      { status: 403 }
    );
  }

  // Exchange code for tokens
  const tokenResponse = await exchangeCodeForTokens(code, storedData.codeVerifier);

  // Upsert tokens in DB (single-user app — one row, keyed by user_id or just replace all)
  const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
  const db = getDb();

  // Delete any existing tokens, then insert fresh ones (simple upsert for single-user)
  await db.delete(fitbitTokens);
  await db.insert(fitbitTokens).values({
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt,
    scopes: tokenResponse.scope,
    userId: tokenResponse.user_id,
  });

  console.log('[fitbit] Tokens stored successfully for user:', tokenResponse.user_id);

  // Clear the PKCE cookie
  cookieStore.delete(PKCE_COOKIE_NAME);

  // Redirect home
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  return NextResponse.redirect(`${baseUrl}/`);
}
