#!/usr/bin/env bash
# ============================================================================
# ci-local.sh — Local CI gate (mirrors .github/workflows/ci.yml, no Actions minutes)
#
# Jobs:
#   1) Frontend: npm ci (optional) + vitest + build
#   2) Backend:  bash backend/tests/run.sh
#   3) Docker:   build frontend + backend images (no push)
#
# Usage:
#   bash scripts/ci-local.sh
#   bash scripts/ci-local.sh --skip-install
#   bash scripts/ci-local.sh --skip-docker
#   bash scripts/ci-local.sh --skip-backend --skip-docker
#   bash scripts/ci-local.sh --help
#
# Prereqs: Node 20+, Docker; for backend integration: docker compose up -d db
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_INSTALL=0
SKIP_FRONTEND=0
SKIP_BACKEND=0
SKIP_DOCKER=0
FAILED=()
STARTED=$(date +%s)

usage() {
  sed -n '2,18p' "$0" | sed 's/^# \?//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)  SKIP_INSTALL=1 ;;
    --skip-frontend) SKIP_FRONTEND=1 ;;
    --skip-backend)  SKIP_BACKEND=1 ;;
    --skip-docker)   SKIP_DOCKER=1 ;;
    -h|--help)       usage ;;
    *) echo "Unknown flag: $1 (try --help)"; exit 2 ;;
  esac
  shift
done

step() { printf '\n=== %s ===\n' "$1"; }
ok()   { printf 'OK  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED+=("$1"); }

echo "smart-port local CI  (root: ${ROOT})"
echo "flags: skip-install=${SKIP_INSTALL} skip-frontend=${SKIP_FRONTEND} skip-backend=${SKIP_BACKEND} skip-docker=${SKIP_DOCKER}"

# ---- 1) Frontend -----------------------------------------------------------
if [[ "${SKIP_FRONTEND}" -eq 0 ]]; then
  step 'Frontend Build & Test'
  (
    set -e
    cd "${ROOT}/frontend"
    if [[ "${SKIP_INSTALL}" -eq 0 ]]; then
      echo 'npm ci ...'
      npm ci
    else
      echo 'skip npm ci (--skip-install)'
    fi

    # forks+maxWorkers: stable on Windows Git Bash / saturated hosts
    echo 'npm test (vitest --pool=forks --maxWorkers=2) ...'
    npx vitest run --pool=forks --maxWorkers=2 --reporter=dot

    echo 'npm run build ...'
    npm run build
  ) && ok 'frontend test + build' || fail 'frontend'
else
  echo 'skip frontend (--skip-frontend)'
fi

# ---- 2) Backend ------------------------------------------------------------
if [[ "${SKIP_BACKEND}" -eq 0 ]]; then
  step 'Backend PHPUnit (via backend/tests/run.sh)'
  if bash "${ROOT}/backend/tests/run.sh"; then
    ok 'backend PHPUnit'
  else
    fail 'backend'
  fi
else
  echo 'skip backend (--skip-backend)'
fi

# ---- 3) Docker -------------------------------------------------------------
if [[ "${SKIP_DOCKER}" -eq 0 ]]; then
  step 'Docker Build Check'
  if ! command -v docker >/dev/null 2>&1; then
    fail 'docker (not on PATH)'
  else
    (
      set -e
      echo 'docker build frontend ...'
      docker build -t smartport-frontend:ci "${ROOT}/frontend"
      echo 'docker build backend ...'
      docker build -t smartport-backend:ci "${ROOT}/backend"
    ) && ok 'docker images built' || fail 'docker'
  fi
else
  echo 'skip docker (--skip-docker)'
fi

# ---- Summary ---------------------------------------------------------------
ELAPSED=$(( $(date +%s) - STARTED ))
printf '\n=== Summary (%ss) ===\n' "${ELAPSED}"
if [[ "${#FAILED[@]}" -eq 0 ]]; then
  ok 'all selected jobs passed'
  exit 0
fi
fail "failed jobs: ${FAILED[*]}"
exit 1
