#Requires -Version 5.1
<#
.SYNOPSIS
  Point this repo at .githooks (local core.hooksPath only — not global).
#>
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$hooks = Join-Path $Root '.githooks'

if (-not (Test-Path -LiteralPath (Join-Path $hooks 'pre-push'))) {
  Write-Host "FAIL  missing $hooks\pre-push" -ForegroundColor Red
  exit 1
}

# Ensure executable bit for Git Bash / WSL checkouts (best-effort on Windows)
$bash = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe'),
  'C:\Program Files\Git\bin\bash.exe'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

Push-Location $Root
try {
  git config core.hooksPath .githooks
  if ($bash) {
    & $bash -lc "cd '/$(($Root.Substring(0,1).ToLowerInvariant()) + ($Root.Substring(2) -replace '\\','/'))' && chmod +x .githooks/pre-push"
  }
  $path = git config --get core.hooksPath
  Write-Host "OK  core.hooksPath=$path" -ForegroundColor Green
  Write-Host "    pre-push runs frontend vitest on git push"
  Write-Host "    skip: SKIP_PRE_PUSH=1 git push   or   git push --no-verify"
} finally {
  Pop-Location
}
