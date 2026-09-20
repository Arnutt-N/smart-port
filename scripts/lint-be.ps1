# ============================================================================
# lint-be.ps1 — php -l sweep over backend/**.php (host has no php; runs in the
# unit-test image, same as backend/tests/run.sh).
#
# Usage (repo root):
#   .\scripts\lint-be.ps1
#
# Exit 0 = all files parse; exit 1 = at least one syntax error (printed).
# Follow-up (not this script): full AST linters (phpstan/psalm) — repo-level
# decision, see PRP M14.
# ============================================================================
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$backendDir = Join-Path $root 'backend'
$testsDir = Join-Path $backendDir 'tests'
$image = 'smartport-phpunit:local'

Write-Output "[lint-be] building test image $image ..."
docker build -t $image -f (Join-Path $testsDir 'Dockerfile.test') $testsDir | Out-Null
if ($LASTEXITCODE -ne 0) { exit 1 }

# NOTE: inner double quotes are backslash-escaped — Windows PowerShell strips
# bare " when passing args to native exes, which would split this script mid-string.
$inner = 'fail=0; for f in $(find /app -name \"*.php\" -not -path \"*/vendor/*\" | sort); do out=$(php -l \"$f\" 2>&1) || { echo \"$out\"; fail=1; }; done; if [ \"$fail\" -eq 0 ]; then echo \"[lint-be] all files parse OK\"; fi; exit \"$fail\"'
docker run --rm -v "${backendDir}:/app" -w /app $image sh -c $inner
exit $LASTEXITCODE
