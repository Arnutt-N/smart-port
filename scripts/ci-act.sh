#!/usr/bin/env bash
# ci-act.sh — run .github/workflows/ci.yml via nektos/act (no Actions minutes)
#
#   bash scripts/ci-act.sh
#   bash scripts/ci-act.sh --job frontend-build
#   bash scripts/ci-act.sh --list
#
# Install: https://nektosact.com  (brew install act / winget install nektos.act)
# Needs: Docker running; repo .actrc
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

JOB=""
LIST=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --job|-j) JOB="$2"; shift ;;
    --list|-l) LIST=1 ;;
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown flag: $1"; exit 2 ;;
  esac
  shift
done

if ! command -v act >/dev/null 2>&1; then
  echo "FAIL  act not found — install nektos/act then retry"
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL  docker not found (act needs Docker)"
  exit 1
fi

if [[ "${LIST}" -eq 1 ]]; then
  act -l -W .github/workflows/ci.yml
  exit $?
fi

ARGS=(workflow_dispatch -W .github/workflows/ci.yml)
[[ -n "${JOB}" ]] && ARGS+=(-j "${JOB}")
echo "act ${ARGS[*]}"
exec act "${ARGS[@]}"
