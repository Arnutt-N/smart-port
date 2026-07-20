#!/usr/bin/env bash
# install-git-hooks.sh — set local core.hooksPath=.githooks
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"
chmod +x .githooks/pre-push
git config core.hooksPath .githooks
echo "OK  core.hooksPath=$(git config --get core.hooksPath)"
echo "    skip: SKIP_PRE_PUSH=1 git push   or   git push --no-verify"
