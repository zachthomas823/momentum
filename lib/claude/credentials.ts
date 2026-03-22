// ─── Claude OAuth credential management ──────────────────────────────────────
// TEMPORARY DEVELOPMENT HACK: This module manages Claude Max OAuth tokens for
// the Agent SDK integration. It reads credentials from either:
//   - CLAUDE_CREDENTIALS_JSON env var (Vercel production)
//   - ~/.claude/.credentials.json (local dev)
//
// When the access token is expired, it auto-refreshes using the refresh token
// via Claude's OAuth token endpoint (https://platform.claude.com/v1/oauth/token).
//
// ⚠️  FOR PRODUCTION: Use ANTHROPIC_API_KEY with the standard @anthropic-ai/sdk
// instead. OAuth token refresh is fragile (refresh tokens can be rotated/revoked
// by the local CLI, tokens expire every ~4 hours). This approach is only suitable
// for single-developer use during active development.

import fs from "fs";
import path from "path";
import os from "os";

const CLAUDE_TOKEN_ENDPOINT = "https://platform.claude.com/v1/oauth/token";
const CLAUDE_CLIENT_ID = "https://claude.ai/oauth/claude-code-client-metadata";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

interface ClaudeCredentials {
  claudeAiOauth: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType: string;
    rateLimitTier: string;
  };
}

/**
 * Refresh an expired Claude OAuth access token.
 * Returns updated credentials or null on failure.
 */
async function refreshAccessToken(
  creds: ClaudeCredentials
): Promise<ClaudeCredentials | null> {
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.claudeAiOauth.refreshToken,
      client_id: CLAUDE_CLIENT_ID,
    });

    const res = await fetch(CLAUDE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        `[claude/credentials] Token refresh failed (${res.status}): ${errText}`
      );
      return null;
    }

    const data = await res.json();
    const refreshed: ClaudeCredentials = {
      claudeAiOauth: {
        ...creds.claudeAiOauth,
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? creds.claudeAiOauth.refreshToken,
        expiresAt: Date.now() + (data.expires_in ?? 14400) * 1000,
      },
    };

    console.error(
      `[claude/credentials] Token refreshed, new expiry: ${new Date(refreshed.claudeAiOauth.expiresAt).toISOString()}`
    );
    return refreshed;
  } catch (e) {
    console.error("[claude/credentials] Refresh error:", e);
    return null;
  }
}

/**
 * Prepare Claude credentials for the Agent SDK subprocess.
 * Handles token refresh if expired. Returns the HOME dir to use.
 */
export async function prepareClaudeCredentials(): Promise<{ home: string } | null> {
  const credsJson = process.env.CLAUDE_CREDENTIALS_JSON;

  if (credsJson) {
    // Vercel / production: parse, refresh if needed, write to /tmp
    try {
      let creds: ClaudeCredentials = JSON.parse(credsJson);

      // Check if token is expired (with 5-min buffer)
      if (Date.now() >= creds.claudeAiOauth.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
        console.error("[claude/credentials] Access token expired, refreshing...");
        const refreshed = await refreshAccessToken(creds);
        if (refreshed) {
          creds = refreshed;
        } else {
          console.error("[claude/credentials] Refresh failed, using expired token (will likely fail)");
        }
      }

      const claudeDir = "/tmp/.claude";
      if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, ".credentials.json"),
        JSON.stringify(creds),
        "utf8"
      );
      return { home: "/tmp" };
    } catch (e) {
      console.error("[claude/credentials] Failed to prepare credentials:", e);
      return null;
    }
  }

  // Local dev: CLI manages its own credentials at ~/.claude/.credentials.json
  const defaultHome = os.homedir();
  const localCreds = path.join(defaultHome, ".claude", ".credentials.json");
  if (fs.existsSync(localCreds)) {
    return { home: defaultHome };
  }

  return null;
}
