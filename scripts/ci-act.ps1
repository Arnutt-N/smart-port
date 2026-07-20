#Requires -Version 5.1
<#
.SYNOPSIS
  Run .github/workflows/ci.yml locally via nektos/act (no GitHub Actions minutes).

.EXAMPLE
  .\scripts\ci-act.ps1
  .\scripts\ci-act.ps1 -Job frontend-build
  .\scripts\ci-act.ps1 -List
#>
param(
  [string]$Job = '',
  [switch]$List,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ($Help) {
  @"
Usage: .\scripts\ci-act.ps1 [-Job <name>] [-List] [-Help]

Runs .github/workflows/ci.yml with nektos/act + Docker (uses .actrc).
Jobs: frontend-build | backend-tests | docker-build

Prefer a single job first (full workflow is heavy / nested Docker):
  .\scripts\ci-act.ps1 -Job frontend-build

Install act if missing:
  winget install nektos.act
"@
  exit 0
}

$actCmd = Get-Command act -ErrorAction SilentlyContinue
if (-not $actCmd) {
  Write-Host 'FAIL  act not found on PATH' -ForegroundColor Red
  Write-Host 'Install: winget install nektos.act   (then reopen shell)'
  exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host 'FAIL  docker not found (act needs Docker Desktop)' -ForegroundColor Red
  exit 1
}

Push-Location $Root
try {
  # Avoid PowerShell eating short flags; never assign to automatic $args
  if ($List) {
    Write-Host 'act --list -W .github/workflows/ci.yml' -ForegroundColor Cyan
    & act --list -W '.github/workflows/ci.yml'
    exit $LASTEXITCODE
  }

  $actArgs = @('workflow_dispatch', '-W', '.github/workflows/ci.yml')
  if ($Job) { $actArgs += @('-j', $Job) }

  Write-Host ("act " + ($actArgs -join ' ')) -ForegroundColor Cyan
  & act @actArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
