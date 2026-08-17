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

  After triggering, runs the live header gate (scripts/verify-live-headers.mjs)
  in a retry loop until PASS or timeout — the hook is async, deploys take
  minutes, so checking immediately would false-fail. Exit 1 if the gate never
  passes (deploy rolled out broken headers, or deploy did not finish in time).

.EXAMPLE
  .\scripts\deploy-render.ps1
  .\scripts\deploy-render.ps1 -WhatIf
  .\scripts\deploy-render.ps1 -SkipVerify     # trigger only, no header gate
  .\scripts\deploy-render.ps1 -VerifyTimeoutMin 25
#>
param(
  [switch]$WhatIf,
  [switch]$Help,
  [switch]$SkipVerify,
  [int]$VerifyTimeoutMin = 15
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ($Help) {
  @"
Usage: .\scripts\deploy-render.ps1 [-WhatIf] [-SkipVerify] [-VerifyTimeoutMin <min>] [-Help]

Triggers Render Deploy Hook (POST). Set RENDER_DEPLOY_HOOK_URL in env or .env.
Then polls the live header gate (verify-live-headers.mjs) every 30s until it
PASSes or the timeout (-VerifyTimeoutMin, default 15) is hit. Exit 1 on fail.

Preferred long-term (no GH Actions):
  Render Dashboard -> each service (frontend + backend) -> Settings ->
  Build & Deploy -> Auto-Deploy = Yes  (branch: main)

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

if ($SkipVerify) {
  Write-Host 'SKIP  live header gate (-SkipVerify)' -ForegroundColor Yellow
  exit 0
}

$gate = Join-Path $Root 'scripts\verify-live-headers.mjs'
if (-not (Test-Path -LiteralPath $gate)) {
  Write-Host "FAIL  gate script not found: $gate" -ForegroundColor Red
  exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'FAIL  node not on PATH — cannot run the live header gate' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host 'Waiting for deploy to go live: verifying headers every 30s (timeout '"${VerifyTimeoutMin}"'min)'
$deadline = (Get-Date).AddMinutes($VerifyTimeoutMin)
$attempt = 0
while ($true) {
  $attempt++
  $gateOutput = & node $gate 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "OK  live header gate PASS (attempt $attempt)" -ForegroundColor Green
    exit 0
  }
  if ((Get-Date) -ge $deadline) {
    Write-Host "FAIL  live header gate still failing after ${VerifyTimeoutMin}min (attempt $attempt):" -ForegroundColor Red
    $gateOutput | Write-Host
    Write-Host '      หากเพิ่งแก้ render.yaml: blueprint sync จาก Render dashboard ก่อน (auto-deploy ไม่ re-sync)' -ForegroundColor Yellow
    exit 1
  }
  $deadlineText = Get-Date -Date $deadline -Format 'HH:mm:ss'
  Write-Host "  ... attempt $attempt failed, retry in 30s (deadline $deadlineText local)"
  Start-Sleep -Seconds 30
}
