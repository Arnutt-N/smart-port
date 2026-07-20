#Requires -Version 5.1
<#
.SYNOPSIS
  Trigger Render deploy via deploy hook URL (replaces disabled GitHub deploy.yml auto-run).

.DESCRIPTION
  Reads RENDER_DEPLOY_HOOK_URL from (first match):
    1) process env
    2) repo-root .env  (gitignored)

  Never prints the URL. Prefer enabling Auto-Deploy on Render dashboard for main
  so this script is only needed for manual/ad-hoc deploys.

.EXAMPLE
  .\scripts\deploy-render.ps1
  .\scripts\deploy-render.ps1 -WhatIf
#>
param(
  [switch]$WhatIf,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ($Help) {
  @"
Usage: .\scripts\deploy-render.ps1 [-WhatIf] [-Help]

Triggers Render Deploy Hook (POST). Set RENDER_DEPLOY_HOOK_URL in env or .env.

Preferred long-term (no GH Actions):
  Render Dashboard → each service (frontend + backend) → Settings →
  Build & Deploy → Auto-Deploy = Yes  (branch: main)

Then push/merge to main deploys without deploy.yml.
"@
  exit 0
}

function Get-DeployHookUrl {
  if ($env:RENDER_DEPLOY_HOOK_URL -and $env:RENDER_DEPLOY_HOOK_URL.Trim()) {
    return $env:RENDER_DEPLOY_HOOK_URL.Trim()
  }
  $envFile = Join-Path $Root '.env'
  if (Test-Path -LiteralPath $envFile) {
    $line = Get-Content -LiteralPath $envFile -ErrorAction SilentlyContinue |
      Where-Object { $_ -match '^\s*RENDER_DEPLOY_HOOK_URL\s*=' } |
      Select-Object -First 1
    if ($line) {
      $val = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
      if ($val) { return $val }
    }
  }
  return $null
}

$url = Get-DeployHookUrl
if (-not $url) {
  Write-Host 'FAIL  RENDER_DEPLOY_HOOK_URL not set (env or .env)' -ForegroundColor Red
  Write-Host '      Or enable Auto-Deploy in Render Dashboard (recommended).'
  exit 1
}
if ($url -notmatch '^https://') {
  Write-Host 'FAIL  RENDER_DEPLOY_HOOK_URL must be an https URL' -ForegroundColor Red
  exit 1
}

if ($WhatIf) {
  Write-Host 'OK  would POST deploy hook (URL redacted)' -ForegroundColor Yellow
  exit 0
}

Write-Host 'POST Render deploy hook ...'
try {
  Invoke-WebRequest -Uri $url -Method POST -UseBasicParsing | Out-Null
  Write-Host 'OK  deploy triggered' -ForegroundColor Green
} catch {
  Write-Host "FAIL  deploy hook request failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
