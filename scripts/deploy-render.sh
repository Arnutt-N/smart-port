#!/usr/bin/env bash
# deploy-render.sh — POST Render deploy hook (URL never echoed)
#
#   export RENDER_DEPLOY_HOOK_URL='https://api.render.com/deploy/...'
#   bash scripts/deploy-render.sh
#
# Or put RENDER_DEPLOY_HOOK_URL=... in repo-root .env (gitignored).
#
# Preferred: enable Auto-Deploy on Render for branch main (no GH Actions).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,12p' "$0" | sed 's/^# \?//'
  exit 0
fi

URL="${RENDER_DEPLOY_HOOK_URL:-}"
if [[ -z "${URL}" && -f "${ROOT}/.env" ]]; then
  URL="$(grep -E '^\s*RENDER_DEPLOY_HOOK_URL\s*=' "${ROOT}/.env" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
fi

if [[ -z "${URL}" ]]; then
  echo "FAIL  RENDER_DEPLOY_HOOK_URL not set (env or .env)"
  echo "      Or enable Auto-Deploy in Render Dashboard (recommended)."
  exit 1
fi
if [[ "${URL}" != https://* ]]; then
  echo "FAIL  RENDER_DEPLOY_HOOK_URL must be an https URL"
  exit 1
fi

if [[ "${1:-}" == "--what-if" ]]; then
  echo "OK  would POST deploy hook (URL redacted)"
  exit 0
fi

echo "POST Render deploy hook ..."
curl -X POST "${URL}" --fail --silent --show-error >/dev/null
echo "OK  deploy triggered"
