import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { fitbitTokens } from '@/lib/db/schema';
import { refreshAccessToken } from './oauth';

// ─── Custom error for re-auth requirement ────────────────────────────────────

export class FitbitReauthRequired extends Error {
  constructor(message = 'Fitbit re-authorization required') {
    super(message);
    this.name = 'FitbitReauthRequired';
  }
}

// ─── Token management helpers ────────────────────────────────────────────────

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

interface StoredToken {
  id: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/** Read the single token row from the DB. Throws FitbitReauthRequired if none exists. */
async function getStoredToken(): Promise<StoredToken> {
  const db = getDb();
  const rows = await db.select().from(fitbitTokens).limit(1);
  if (rows.length === 0) {
    throw new FitbitReauthRequired('No Fitbit tokens found — user must authorize first');
  }
  return rows[0] as StoredToken;
}

/** Check whether a token is expired (with 5-min buffer). */
function isExpired(expiresAt: Date): boolean {
  return Date.now() >= expiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS;
}

/**
 * Refresh the token and persist new tokens BEFORE returning them.
 * If refresh fails (e.g. 401), clears the token row and throws FitbitReauthRequired.
 */
async function refreshAndPersist(token: StoredToken): Promise<string> {
  try {
    console.log('[fitbit] Refreshing expired access token…');
    const newTokens = await refreshAccessToken(token.refreshToken);
    const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

    const db = getDb();
    await db
      .update(fitbitTokens)
      .set({
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token,
        expiresAt,
        scopes: newTokens.scope,
        userId: newTokens.user_id,
        updatedAt: new Date(),
      })
      .where(eq(fitbitTokens.id, token.id));

    console.log('[fitbit] Token refreshed successfully, new expiry:', expiresAt.toISOString());
    return newTokens.access_token;
  } catch (err) {
    // Refresh failed — token is likely revoked. Clear it so we don't retry with bad creds.
    console.error('[fitbit] Token refresh failed, clearing stored tokens:', (err as Error).message);
    const db = getDb();
    await db.delete(fitbitTokens).where(eq(fitbitTokens.id, token.id));
    throw new FitbitReauthRequired(`Token refresh failed: ${(err as Error).message}`);
  }
}

// ─── Authenticated fetch wrapper ─────────────────────────────────────────────

/**
 * Make an authenticated request to the Fitbit API.
 *
 * - Automatically reads tokens from DB
 * - Refreshes expired tokens (with 5-min buffer) BEFORE the request
 * - Sets Accept-Language: en_US to get weight in lbs
 * - Logs rate limit warnings when remaining < 20
 * - Throws FitbitReauthRequired on refresh failure (not a silent swallow)
 *
 * @param path - API path (e.g. '/1/user/-/body/log/weight/date/2024-01-01.json')
 * @param options - Optional fetch options (method, body, etc.)
 */
export async function fitbitFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const token = await getStoredToken();

  // Refresh if expired (with buffer)
  let accessToken = token.accessToken;
  if (isExpired(token.expiresAt)) {
    accessToken = await refreshAndPersist(token);
  }

  const url = path.startsWith('http')
    ? path
    : `https://api.fitbit.com${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Accept-Language': 'en_US',
      ...options?.headers,
    },
  });

  // Log rate limit warnings
  const rateLimitRemaining = res.headers.get('Fitbit-Rate-Limit-Remaining');
  if (rateLimitRemaining !== null) {
    const remaining = parseInt(rateLimitRemaining, 10);
    if (remaining < 20) {
      console.warn(`[fitbit] Rate limit warning: ${remaining} requests remaining`);
    }
  }

  // If we get a 401 back, the token may have been revoked externally
  if (res.status === 401) {
    console.error('[fitbit] Got 401 from Fitbit API — token may be revoked');
    const db = getDb();
    await db.delete(fitbitTokens).where(eq(fitbitTokens.id, token.id));
    throw new FitbitReauthRequired('Fitbit API returned 401 — re-authorization required');
  }

  return res;
}
