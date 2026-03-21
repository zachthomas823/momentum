import { createHash, randomBytes } from 'crypto';

// ─── Environment helpers ─────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} environment variable is not set`);
  return val;
}

// ─── PKCE helpers ────────────────────────────────────────────────────────────

/** Generate a cryptographically random code_verifier (128 bytes → base64url, 43-128 chars). */
export function generateCodeVerifier(): string {
  return randomBytes(96)
    .toString('base64url');
}

/** Derive a code_challenge from a code_verifier (SHA-256 → base64url). */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

/** Generate a random state string for CSRF protection. */
export function generateState(): string {
  return randomBytes(32).toString('base64url');
}

// ─── Authorization URL ──────────────────────────────────────────────────────

const FITBIT_AUTH_URL = 'https://www.fitbit.com/oauth2/authorize';

const SCOPES = ['weight', 'sleep', 'activity', 'heartrate', 'profile'];

/** Build the full Fitbit authorization URL with PKCE params. */
export function buildAuthorizationUrl(codeChallenge: string, state: string): string {
  const clientId = requireEnv('FITBIT_CLIENT_ID');
  const baseUrl = requireEnv('NEXT_PUBLIC_BASE_URL');
  const redirectUri = `${baseUrl}/api/fitbit/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  return `${FITBIT_AUTH_URL}?${params.toString()}`;
}

// ─── Token types ─────────────────────────────────────────────────────────────

export interface FitbitTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
  scope: string;
  user_id: string;
}

// ─── Token exchange ──────────────────────────────────────────────────────────

const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';

function getBasicAuthHeader(): string {
  const clientId = requireEnv('FITBIT_CLIENT_ID');
  const clientSecret = requireEnv('FITBIT_CLIENT_SECRET');
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

/**
 * Exchange an authorization code for tokens using PKCE.
 * POST to Fitbit token endpoint with Basic auth header.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<FitbitTokenResponse> {
  const baseUrl = requireEnv('NEXT_PUBLIC_BASE_URL');
  const redirectUri = `${baseUrl}/api/fitbit/callback`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(FITBIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: getBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Fitbit token exchange failed (${res.status}): ${errorBody}`);
  }

  return res.json() as Promise<FitbitTokenResponse>;
}

/**
 * Refresh an access token using a refresh token.
 * Fitbit uses single-use refresh token rotation — the response contains a NEW refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<FitbitTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(FITBIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: getBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Fitbit token refresh failed (${res.status}): ${errorBody}`);
  }

  return res.json() as Promise<FitbitTokenResponse>;
}
