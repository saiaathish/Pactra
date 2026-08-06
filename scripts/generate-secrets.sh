#!/usr/bin/env bash
# Generates the three security secrets for Pactra into .env.local.
# Values are never printed to the terminal.
set -euo pipefail

ENV_FILE=".env.local"

if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
fi

set_secret() {
  local name="$1"
  local value="$2"
  if grep -q "^${name}=." "$ENV_FILE"; then
    echo "  ${name}: already set (skipping)"
  elif grep -q "^${name}=$" "$ENV_FILE"; then
    # shellcheck disable=SC2086
    sed -i '' "s|^${name}=$|${name}=${value}|" "$ENV_FILE" 2>/dev/null || \
      sed -i "s|^${name}=$|${name}=${value}|" "$ENV_FILE"
    echo "  ${name}: generated"
  else
    printf '%s=%s\n' "$name" "$value" >> "$ENV_FILE"
    echo "  ${name}: generated"
  fi
}

echo "Generating secrets into ${ENV_FILE}:"
set_secret TOKEN_ENCRYPTION_KEY "$(openssl rand -base64 32)"
set_secret WORKER_SHARED_SECRET "$(openssl rand -base64 32)"
set_secret YOUTUBE_WEBHOOK_SECRET "$(openssl rand -hex 32)"
echo "Done."
