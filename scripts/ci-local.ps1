#Requires -Version 5.1
<#
.SYNOPSIS
  Local CI gate — mirrors .github/workflows/ci.yml without GitHub Actions minutes.

.DESCRIPTION
  Jobs (same as ci.yml):
    1) Frontend: npm ci (optional) + npm test + npm run build
    2) Backend:  bash backend/tests/run.sh  (Docker PHPUnit; needs Git Bash)
    3) Docker:   build frontend + backend images (no push)

  Prerequisites:
    - Node 20+, npm
    - Docker Desktop (backend + docker-build jobs)
    - Git Bash on PATH as `bash` (for backend/tests/run.sh)
    - For backend integration: docker compose up -d db

.EXAMPLE
  .\scripts\ci-local.ps1
  .\scripts\ci-local.ps1 -SkipInstall
  .\scripts\ci-local.ps1 -SkipDocker
  .\scripts\ci-local.ps1 -SkipBackend -SkipDocker
#>
param(
  [switch]$SkipInstall,
  [switch]$SkipFrontend,
  [switch]$SkipBackend,
  [switch]$SkipDocker,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$failed = @()
$started = Get-Date

function Write-Step([string]$Name) {
  Write-Host ""
  Write-Host "=== $Name ===" -ForegroundColor Cyan
}

function Write-Ok([string]$Msg) {
  Write-Host "OK  $Msg" -ForegroundColor Green
}

function Write-Fail([string]$Msg) {
  Write-Host "FAIL  $Msg" -ForegroundColor Red
}

if ($Help) {
  @"
Usage: .\scripts\ci-local.ps1 [-SkipInstall] [-SkipFrontend] [-SkipBackend] [-SkipDocker] [-Help]

Mirrors .github/workflows/ci.yml locally (no GitHub Actions minutes):
  1) Frontend  npm ci + vitest (forks/2) + build
  2) Backend   bash backend/tests/run.sh
  3) Docker    build frontend + backend images

Examples:
  .\scripts\ci-local.ps1
  .\scripts\ci-local.ps1 -SkipInstall
  .\scripts\ci-local.ps1 -SkipDocker
  .\scripts\ci-local.ps1 -SkipBackend -SkipDocker
"@
  exit 0
}

Write-Host "smart-port local CI  (root: $Root)"
Write-Host "flags: SkipInstall=$SkipInstall SkipFrontend=$SkipFrontend SkipBackend=$SkipBackend SkipDocker=$SkipDocker"

function Resolve-GitBash {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe'),
    'C:\Program Files\Git\bin\bash.exe',
    'C:\Program Files (x86)\Git\bin\bash.exe'
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath $c)) { return $c }
  }
  $cmd = Get-Command bash -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -notmatch '\\System32\\bash\.exe$') {
    return $cmd.Source
  }
  return $null
}

# ---- 1) Frontend Build & Test ----------------------------------------------
if (-not $SkipFrontend) {
  Write-Step 'Frontend Build & Test'
  Push-Location (Join-Path $Root 'frontend')
  try {
    if (-not $SkipInstall) {
      Write-Host 'npm ci ...'
      npm ci
      if ($LASTEXITCODE -ne 0) { throw "npm ci exited $LASTEXITCODE" }
    } else {
      Write-Host 'skip npm ci (-SkipInstall)'
    }

    # Windows Vitest: forks+maxWorkers avoids threads pool hang (see session handoff)
    Write-Host 'npm test (vitest --pool=forks --maxWorkers=2) ...'
    npx vitest run --pool=forks --maxWorkers=2 --reporter=dot
    if ($LASTEXITCODE -ne 0) { throw "vitest exited $LASTEXITCODE" }

    Write-Host 'npm run build ...'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "vite build exited $LASTEXITCODE" }

    Write-Ok 'frontend test + build'
  } catch {
    Write-Fail $_.Exception.Message
    $failed += 'frontend'
  } finally {
    Pop-Location
  }
} else {
  Write-Host 'skip frontend (-SkipFrontend)'
}

# ---- 2) Backend PHPUnit ----------------------------------------------------
if (-not $SkipBackend) {
  Write-Step 'Backend PHPUnit (via backend/tests/run.sh)'
  $bashExe = Resolve-GitBash
  if (-not $bashExe) {
    Write-Fail 'Git Bash not found (need LocalAppData\Programs\Git\bin\bash.exe — WSL bash.exe is not enough)'
    $failed += 'backend'
  } else {
    Write-Host "using: $bashExe"
    try {
      # D:\foo\bar → /d/foo/bar (Git Bash path; works with spaces)
      $rootUnix = '/' + $Root.Substring(0, 1).ToLowerInvariant() + ($Root.Substring(2) -replace '\\', '/')
      & $bashExe -lc "cd '$rootUnix' && bash backend/tests/run.sh"
      if ($LASTEXITCODE -ne 0) { throw "run.sh exited $LASTEXITCODE" }
      Write-Ok 'backend PHPUnit'
    } catch {
      Write-Fail $_.Exception.Message
      $failed += 'backend'
    }
  }
} else {
  Write-Host 'skip backend (-SkipBackend)'
}

# ---- 3) Docker Build Check -------------------------------------------------
if (-not $SkipDocker) {
  Write-Step 'Docker Build Check'
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) {
    Write-Fail 'docker not found on PATH'
    $failed += 'docker'
  } else {
    try {
      Write-Host 'docker build frontend ...'
      docker build -t smartport-frontend:ci (Join-Path $Root 'frontend')
      if ($LASTEXITCODE -ne 0) { throw "frontend image build exited $LASTEXITCODE" }

      Write-Host 'docker build backend ...'
      docker build -t smartport-backend:ci (Join-Path $Root 'backend')
      if ($LASTEXITCODE -ne 0) { throw "backend image build exited $LASTEXITCODE" }

      Write-Ok 'docker images built'
    } catch {
      Write-Fail $_.Exception.Message
      $failed += 'docker'
    }
  }
} else {
  Write-Host 'skip docker (-SkipDocker)'
}

# ---- Summary ---------------------------------------------------------------
$elapsed = [int]((Get-Date) - $started).TotalSeconds
Write-Host ""
Write-Host "=== Summary (${elapsed}s) ===" -ForegroundColor Cyan
if ($failed.Count -eq 0) {
  Write-Ok 'all selected jobs passed'
  exit 0
}

Write-Fail ("failed jobs: " + ($failed -join ', '))
exit 1
