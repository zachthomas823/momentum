#!/bin/bash
# ─── Auto-refresh Claude credentials to Vercel ───────────────────────────────
# TEMPORARY DEV HACK: Reads fresh credentials from ~/.claude/.credentials.json
# and pushes them to Vercel every 3 hours.
#
# Usage:
#   ./scripts/refresh-vercel-token.sh        # run once
#   ./scripts/refresh-vercel-token.sh --loop  # run every 3 hours
#
# For production: use ANTHROPIC_API_KEY instead.

INTERVAL=$((3 * 60 * 60))  # 3 hours in seconds

push_token() {
  # Resolve credentials path using node (works on Windows + Mac + Linux)
  CREDS_FILE=$(node -e "console.log(require('path').join(require('os').homedir(), '.claude', '.credentials.json'))")

  if [ ! -f "$CREDS_FILE" ]; then
    echo "[$(date)] ERROR: $CREDS_FILE not found"
    return 1
  fi

  # Check expiry
  REMAINING=$(node -e "
    const d = JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(), '.claude', '.credentials.json'), 'utf8'));
    console.log(Math.round((d.claudeAiOauth.expiresAt - Date.now()) / 1000 / 60));
  " 2>/dev/null)

  if [ -n "$REMAINING" ]; then
    if [ "$REMAINING" -lt 0 ] 2>/dev/null; then
      echo "[$(date)] Token expired ${REMAINING}m ago"
    else
      echo "[$(date)] Token valid for ${REMAINING}m"
    fi
  fi

  # Push to Vercel
  node -e "process.stdout.write(require('fs').readFileSync(require('path').join(require('os').homedir(), '.claude', '.credentials.json'), 'utf8'))" | npx vercel env add CLAUDE_CREDENTIALS_JSON production --force 2>&1 | grep -E "Overrode|Error"

  # Redeploy so the new env var takes effect
  echo "[$(date)] Triggering redeployment..."
  npx vercel --prod 2>&1 | grep -E "Production:|Error"

  echo "[$(date)] Done"
}

# Run once
push_token

# Loop mode
if [ "$1" = "--loop" ]; then
  echo ""
  echo "Loop mode: refreshing every 3 hours. Ctrl+C to stop."
  while true; do
    sleep $INTERVAL
    push_token
  done
fi
