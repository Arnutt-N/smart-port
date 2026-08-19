#Requires -Version 5.1
<#
.SYNOPSIS
  Local CI gate — mirrors .github/workflows/ci.yml without GitHub Actions minutes.

.DESCRIPTION
  Local gates:
    0) Fast gates: schema parity + multiplier validator regression
    1) Frontend:  npm ci (optional) + npm audit (prod, high+) + npm test + npm run build
    2) E2E:       Playwright Chromium checks all sidebar menus (Docker db + backend)
    3) Backend:   bash backend/tests/run.sh  (Docker PHPUnit; needs Git Bash)
    4) Docker:    build frontend + backend images (no push)

  Prerequisites:
    - Node 24+, npm
    - Docker Desktop (backend + docker-build jobs)
    - Git Bash on PATH as `bash` (for backend/tests/run.sh)
    - Playwright Chromium: cd frontend; npx playwright install chromium
    - A local .env with the Docker Compose development values

.EXAMPLE
  .\scripts\ci-local.ps1
  .\scripts\ci-local.ps1 -SkipInstall
  .\scripts\ci-local.ps1 -SkipE2E
  .\scripts\ci-local.ps1 -SkipDocker
  .\scripts\ci-local.ps1 -SkipBackend -SkipDocker
#>
param(
  [switch]$SkipInstall,
  [switch]$SkipFrontend,
  [switch]$SkipE2E,
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
Usage: .\scripts\ci-local.ps1 [-SkipInstall] [-SkipFrontend] [-SkipE2E] [-SkipBackend] [-SkipDocker] [-Help]

Mirrors .github/workflows/ci.yml locally (no GitHub Actions minutes):
  0) Fast gates schema parity + multiplier validator regression
  1) Frontend   npm ci + npm audit (prod, high+) + vitest (forks/2) + build
  2) E2E        Docker db/backend + Playwright Chromium (all sidebar menus)
  3) Backend    bash backend/tests/run.sh
  4) Docker     build frontend + backend images

E2E prerequisites: Docker Desktop, frontend dependencies, Playwright Chromium,
and a local .env file. The Compose services remain running after the gate.

Examples:
  .\scripts\ci-local.ps1
  .\scripts\ci-local.ps1 -SkipInstall
  .\scripts\ci-local.ps1 -SkipE2E
  .\scripts\ci-local.ps1 -SkipDocker
  .\scripts\ci-local.ps1 -SkipBackend -SkipDocker
"@
  exit 0
}

Write-Host "smart-port local CI  (root: $Root)"
Write-Host "flags: SkipInstall=$SkipInstall SkipFrontend=$SkipFrontend SkipE2E=$SkipE2E SkipBackend=$SkipBackend SkipDocker=$SkipDocker"

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

# ---- 0) Schema parity (เร็ว รันก่อนเสมอ — fail เร็วดีกว่ารอ docker build) -----
Write-Step 'Schema Parity Gate'
& node (Join-Path $Root 'scripts\validate-schema-parity.mjs')
if ($LASTEXITCODE -eq 0) {
  Write-Ok 'schema parity'
} else {
  Write-Fail 'schema parity'
  $failed += 'schema-parity'
}

# รันทั้งโฟลเดอร์ด้วย glob แบบเดียวกับ .githooks/pre-push, ci.yml และ ci-local.sh
# PowerShell ไม่ขยาย glob ให้ native command แต่ node --test ขยายเองได้ (ยืนยันแล้ว)
# ทุกไฟล์ในโฟลเดอร์นี้เป็น regression ที่ไม่ยิง production จริง (ใช้ mock origin)
Write-Step 'Script Regressions'
& node --test (Join-Path $Root 'scripts\tests\*.test.mjs')
if ($LASTEXITCODE -eq 0) {
  Write-Ok 'script regressions'
} else {
  Write-Fail 'script regressions'
  $failed += 'script-regressions'
}

# mock-server regression ของ CSP gate — ไม่ยิง production จริง (issue #113 R1)
Write-Step 'CSP Violation Gate Regression'
& node --test (Join-Path $Root 'scripts\tests\check-csp-violations.test.mjs')
if ($LASTEXITCODE -eq 0) {
  Write-Ok 'csp violation gate regression'
} else {
  Write-Fail 'csp violation gate regression'
  $failed += 'csp-violation-gate-regression'
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

    # Severity policy: prod deps ต้องไม่มี advisory ระดับ high/critical
    # (moderate และ dev-only advisories ไม่บล็อก — triage ด้วยมือเป็นกรณีไป)
    Write-Host 'npm audit --omit=dev --audit-level=high ...'
    npm audit --omit=dev --audit-level=high
    if ($LASTEXITCODE -ne 0) { throw "npm audit found high/critical prod vulnerabilities - run 'npm audit fix' or triage and document the exception" }

    # pool/maxWorkers come from frontend/vitest.config.js (forks + 2 workers)
    Write-Host 'npm test (vitest) ...'
    npx vitest run --reporter=dot
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

# ---- 1.5) CSP bundle audit (ต้องรันหลัง build เพราะอ่าน frontend/dist) -------
if (-not $SkipFrontend) {
  Write-Step 'CSP Bundle Audit'
  & node (Join-Path $Root 'scripts\audit-bundle-csp.mjs')
  if ($LASTEXITCODE -eq 0) {
    Write-Ok 'csp bundle audit'
  } else {
    Write-Fail 'csp bundle audit'
    $failed += 'csp-bundle-audit'
  }
} else {
  Write-Host 'skip CSP bundle audit (ต้องมี frontend build ก่อน)'
}

# ---- 2) Playwright E2E: all sidebar menus ---------------------------------
if (-not $SkipE2E) {
  Write-Step 'E2E All Menus (Docker + Playwright Chromium)'
  if (-not (Test-Path -LiteralPath (Join-Path $Root '.env'))) {
    Write-Fail 'E2E requires a local .env file for Docker Compose'
    $failed += 'e2e'
  } else {
    try {
      docker compose --project-directory $Root up -d --build db backend
      if ($LASTEXITCODE -ne 0) { throw "docker compose up exited $LASTEXITCODE" }

      $backendReady = $false
      for ($attempt = 1; $attempt -le 60; $attempt++) {
        docker compose --project-directory $Root exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --silent -e ''SELECT 1 FROM personnel LIMIT 1'' "$MYSQL_DATABASE"' *> $null
        $schemaReady = $LASTEXITCODE -eq 0
        try {
          $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/' -TimeoutSec 2
          if ($schemaReady -and $response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
            $backendReady = $true
            break
          }
        } catch {}
        Start-Sleep -Seconds 5
      }
      if (-not $backendReady) { throw 'backend did not become ready within 5 minutes' }

      Push-Location (Join-Path $Root 'frontend')
      try {
        npm run test:e2e:menus
        if ($LASTEXITCODE -ne 0) { throw "Playwright exited $LASTEXITCODE" }
      } finally {
        Pop-Location
      }
      Write-Ok 'all sidebar menu destinations rendered'
    } catch {
      Write-Fail $_.Exception.Message
      $failed += 'e2e'
    }
  }
} else {
  Write-Host 'skip E2E (-SkipE2E)'
}

# ---- 3) Backend PHPUnit ----------------------------------------------------
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

# ---- 4) Docker Build Check -------------------------------------------------
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
