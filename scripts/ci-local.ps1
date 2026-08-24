#Requires -Version 5.1
<#
.SYNOPSIS
  Local CI gate — mirrors .github/workflows/ci.yml without GitHub Actions minutes.

.DESCRIPTION
  Local gates:
    0) Fast gates: schema parity + multiplier validator regression
    1) Frontend:  npm ci (optional) + npm audit (prod, high+) + npm test + npm run build
    1.5) CSP audit: bundle ตรวจว่าไม่มีอะไรชน CSP หลัง enforce (อ่าน frontend/dist)
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

# สองตัวนี้ไม่แตะ $failed — บอกว่า "ตรวจแล้วแต่เชื่อได้ไม่เต็มร้อย" กับ "ไม่ได้ตรวจ" ซึ่งไม่ใช่
# ความล้มเหลว แต่ก็ไม่ใช่ผ่าน · รูปแบบ prefix อยู่ที่เดียวกับ Write-Ok/Write-Fail เพื่อให้เทสที่
# จับ marker เหล่านี้ (scripts/tests/ci-local-csp-gate.test.mjs) ไม่ผูกกับสตริงที่กระจายหลายที่
function Write-Warn([string]$Msg) {
  Write-Host "WARN  $Msg" -ForegroundColor Yellow
}

function Write-Skip([string]$Msg) {
  Write-Host "SKIP  $Msg"
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
# ทุกไฟล์ในโฟลเดอร์นี้เป็น regression ที่ไม่ยิง production จริง (ใช้ mock origin) — รวมถึง
# mock-server regression ของ CSP gate (issue #113 R1) ซึ่งเคยมีบล็อกของตัวเองต่อท้ายบล็อกนี้
# แล้วถูกรันซ้ำสองรอบทุกครั้ง · glob ครอบอยู่แล้ว การไล่ชื่อซ้ำมีแต่ทำให้ CI ช้าลงเปล่า ๆ
Write-Step 'Script Regressions'
& node --test (Join-Path $Root 'scripts\tests\*.test.mjs')
if ($LASTEXITCODE -eq 0) {
  Write-Ok 'script regressions'
} else {
  Write-Fail 'script regressions'
  $failed += 'script-regressions'
}

# ---- 1) Frontend Build & Test ----------------------------------------------
# $frontendBuilt บันทึกว่า dist ที่จะตรวจในบล็อกถัดไปมาจาก build ของ **โค้ดรอบนี้** หรือไม่
# — "มี dist" กับ "dist ตรงกับโค้ดปัจจุบัน" เป็นคนละเรื่อง และ gate นี้สนใจอย่างหลัง
$frontendBuilt = $false
if (-not $SkipFrontend) {
  Write-Step 'Frontend Build & Test'
  Push-Location (Join-Path $Root 'frontend')
  try {
    if (-not $SkipInstall) {
      Write-Host 'npm ci ...'
      npm ci
      if ($LASTEXITCODE -ne 0) { throw "npm ci exited $LASTEXITCODE" }
    } else {
      # ตัวพิมพ์เล็กโดยตั้งใจ — บรรทัดนี้อยู่ระดับเดียวกับ 'npm ci ...' / 'npm test (vitest) ...'
      # คือรายงานความคืบหน้า *ภายใน* gate ไม่ใช่การตัดสินระดับ gate จึงไม่ใช้ Write-Skip
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
    $frontendBuilt = $true
  } catch {
    Write-Fail $_.Exception.Message
    $failed += 'frontend'
  } finally {
    Pop-Location
  }
} else {
  Write-Skip 'frontend (-SkipFrontend)'
}

# ---- 1.5) CSP bundle audit (ต้องรันหลัง build เพราะอ่าน frontend/dist) -------
# แยกสามสถานะ ไม่ใช่ผูกกับ **การมีอยู่ของ dist** อย่างเดียว (review รอบที่ 9 — M1):
#   ขั้น frontend ล้ม     → fail · dist ที่เหลืออยู่เป็นของรอบก่อน ตรวจแทนกันไม่ได้ (vitest ตก
#                          ก็นับด้วย ไม่ใช่เฉพาะ build — dist ที่ build จากโค้ดที่เทสไม่ผ่านก็เชื่อไม่ได้)
#   ไม่ได้ build แต่มี dist → ตรวจ แต่เตือนว่าอาจเป็นของเก่า ("ไม่รู้" ต้องไม่กลายเป็น "สะอาด")
#   ผ่านทั้งขั้น           → ตรวจตามปกติ
# ของเดิมรัน audit กับ dist เก่าเมื่อ build ล้มแล้วขึ้น OK ซึ่งคือ failure mode ที่ gate นี้มีไว้กัน
$distPath = Join-Path $Root 'frontend\dist'
if ((-not $SkipFrontend) -and (-not $frontendBuilt)) {
  Write-Fail 'csp bundle audit (ขั้น frontend ล้ม — dist ที่มีอยู่เป็นของรอบก่อน ตรวจแทนกันไม่ได้)'
  $failed += 'csp-bundle-audit'
} elseif (Test-Path -LiteralPath $distPath) {
  Write-Step 'CSP Bundle Audit'
  if (-not $frontendBuilt) {
    # ตรวจดีกว่าไม่ตรวจ แต่ต้องบอกว่าผลนี้อ้างถึง build ไหน ไม่งั้น OK จะถูกอ่านว่า
    # "โค้ดปัจจุบันสะอาด" ทั้งที่ dist อาจเก่ากว่านั้นหลายคอมมิต
    Write-Warn 'csp bundle audit: ตรวจ frontend/dist ที่มีอยู่เดิม (-SkipFrontend) — อาจไม่ตรงกับโค้ดปัจจุบัน'
  }
  & node (Join-Path $Root 'scripts\audit-bundle-csp.mjs')
  if ($LASTEXITCODE -eq 0) {
    Write-Ok 'csp bundle audit'
  } else {
    Write-Fail 'csp bundle audit'
    $failed += 'csp-bundle-audit'
  }
} elseif ($SkipFrontend) {
  # ข้ามได้เฉพาะเมื่อผู้ใช้สั่งข้าม build เอง **และ** ไม่มี dist ให้ตรวจจริง ๆ
  # ข้อความต้องบอกทั้งสิ่งที่ขาดและวิธีแก้ ไม่ใช่ข้ามเงียบ
  Write-Skip 'csp bundle audit: ไม่มี frontend/dist และสั่ง -SkipFrontend ไว้ — รัน npm run build ใน frontend/ ก่อน หรือเลิกใช้ -SkipFrontend'
} else {
  Write-Fail 'csp bundle audit (build เพิ่งรันแต่ไม่มี frontend/dist)'
  $failed += 'csp-bundle-audit'
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
  Write-Skip 'E2E (-SkipE2E)'
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
  Write-Skip 'backend (-SkipBackend)'
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
  Write-Skip 'docker (-SkipDocker)'
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
