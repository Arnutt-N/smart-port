#!/usr/bin/env bash
# ============================================================================
# ci-local.sh — Local CI gate (mirrors .github/workflows/ci.yml, no Actions minutes)
#
# Jobs:
#   1) Frontend: npm ci (optional) + vitest + build
#   2) E2E:      Playwright Chromium checks all 21 menus (Docker db + backend)
#   3) Backend:  bash backend/tests/run.sh
#   4) Docker:   build frontend + backend images (no push)
#
# Usage:
#   bash scripts/ci-local.sh
#   bash scripts/ci-local.sh --skip-install
#   bash scripts/ci-local.sh --skip-e2e
#   bash scripts/ci-local.sh --skip-docker
#   bash scripts/ci-local.sh --skip-backend --skip-docker
#   bash scripts/ci-local.sh --help
#
# Prereqs: Node 24+, Docker, local .env; run `npx playwright install chromium`
# in frontend once. Compose services remain running after the E2E gate.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_INSTALL=0
SKIP_FRONTEND=0
SKIP_E2E=0
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
    --skip-e2e)      SKIP_E2E=1 ;;
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
echo "flags: skip-install=${SKIP_INSTALL} skip-frontend=${SKIP_FRONTEND} skip-e2e=${SKIP_E2E} skip-backend=${SKIP_BACKEND} skip-docker=${SKIP_DOCKER}"

# ---- 0) Schema parity (เร็ว รันก่อนเสมอ — fail เร็วดีกว่ารอ docker build) -----
step 'Schema Parity Gate'
if node "${ROOT}/scripts/validate-schema-parity.mjs"; then
  ok 'schema parity'
else
  fail 'schema parity'
fi

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

    # pool/maxWorkers come from frontend/vitest.config.js (forks + 2 workers)
    echo 'npm test (vitest) ...'
    npx vitest run --reporter=dot

    echo 'npm run build ...'
    npm run build
  ) && ok 'frontend test + build' || fail 'frontend'
else
  echo 'skip frontend (--skip-frontend)'
fi

# ---- 2) Playwright E2E: all 21 menus --------------------------------------
if [[ "${SKIP_E2E}" -eq 0 ]]; then
  step 'E2E All Menus (Docker + Playwright Chromium)'
  if [[ ! -f "${ROOT}/.env" ]]; then
    fail 'e2e (local .env is required for Docker Compose)'
  elif (
    set -e
    cd "${ROOT}"
    docker compose up -d db backend
    backend_ready=0
    for _ in $(seq 1 60); do
      if docker compose exec -T db sh -c \
          'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --silent -e "SELECT 1 FROM personnel LIMIT 1" "$MYSQL_DATABASE"' \
          >/dev/null 2>&1 \
        && curl --fail --silent http://127.0.0.1:8000/ >/dev/null; then
        backend_ready=1
        break
      fi
      sleep 5
    done
    if [[ "${backend_ready}" -ne 1 ]]; then
      echo 'backend did not become ready within 5 minutes'
      docker compose logs db backend
      exit 1
    fi
    cd frontend
    npm run test:e2e:menus
  ); then
    ok 'all 21 menu destinations rendered'
  else
    fail 'e2e'
  fi
else
  echo 'skip E2E (--skip-e2e)'
fi

# ---- 3) Backend ------------------------------------------------------------
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

# ---- 4) Docker -------------------------------------------------------------
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
