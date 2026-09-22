#!/usr/bin/env bash
# ============================================================================
# lint-be.sh — php -l sweep over backend/**.php (host has no php; runs in the
# unit-test image, same as backend/tests/run.sh).
#
# Usage (repo root):
#   bash scripts/lint-be.sh
#
# Exit 0 = all files parse; exit 1 = at least one syntax error (printed).
# Follow-up (not this script): full AST linters (phpstan/psalm) — repo-level
# decision, see PRP M14.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
TESTS_DIR="${BACKEND_DIR}/tests"
IMAGE="smartport-phpunit:local"

DOCKER_BACKEND_DIR="${BACKEND_DIR}"
DOCKER_TESTS_DIR="${TESTS_DIR}"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    export MSYS_NO_PATHCONV=1
    DOCKER_BACKEND_DIR="$(cd "${BACKEND_DIR}" && pwd -W)"
    DOCKER_TESTS_DIR="$(cd "${TESTS_DIR}" && pwd -W)"
    ;;
esac

echo "[lint-be] building test image ${IMAGE} ..."
docker build -t "${IMAGE}" -f "${DOCKER_TESTS_DIR}/Dockerfile.test" "${DOCKER_TESTS_DIR}" >/dev/null

docker run --rm \
  -v "${DOCKER_BACKEND_DIR}:/app" \
  -w /app \
  "${IMAGE}" \
  sh -c '
    fail=0
    for f in $(find /app -name "*.php" -not -path "*/vendor/*" | sort); do
      out=$(php -l "$f" 2>&1) || { echo "$out"; fail=1; }
    done
    if [ "$fail" -eq 0 ]; then echo "[lint-be] all files parse OK"; fi
    exit "$fail"
  '
