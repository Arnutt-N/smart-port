#!/usr/bin/env bash
# ============================================================================
# ci-local.sh — Local CI gate (mirrors .github/workflows/ci.yml, no Actions minutes)
#
# Local gates:
#   0) Fast gates: schema parity + multiplier validator regression
#   1) Frontend:  npm ci (optional) + vitest + build
#   1.5) CSP audit: bundle ตรวจว่าไม่มีอะไรชน CSP หลัง enforce (อ่าน frontend/dist)
#   2) E2E:       Playwright Chromium checks all sidebar menus (Docker db + backend)
#   3) Backend:   bash backend/tests/run.sh
#   4) Docker:    build frontend + backend images (no push)
#
# Usage:
#   bash scripts/ci-local.sh
#   bash scripts/ci-local.sh --skip-install
#   bash scripts/ci-local.sh --skip-e2e
#   bash scripts/ci-local.sh --skip-docker
#   bash scripts/ci-local.sh --skip-backend --skip-docker
#   bash scripts/ci-local.sh --help
#
# Prereqs: Node 24+, Docker, local .env; run `npx playwright install chromium`
# in frontend once. Compose services remain running after the E2E gate.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_INSTALL=0
SKIP_FRONTEND=0
SKIP_E2E=0
SKIP_BACKEND=0
SKIP_DOCKER=0
SKIP_TIDB_BOOTSTRAP=0
FAILED=()
STARTED=$(date +%s)

usage() {
  # อ่านบล็อกคอมเมนต์หัวไฟล์ทั้งก้อนจนถึงบรรทัดแรกที่ไม่ใช่คอมเมนต์ — ไม่ผูกกับเลขบรรทัด
  # ตายตัว เพราะช่วง '2,18p' เดิมตัดบรรทัด --help หายทันทีที่มีคนเพิ่ม gate ในหัวไฟล์
  awk 'NR>1 { if (!/^#/) exit; sub(/^# ?/, ""); print }' "$0"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)  SKIP_INSTALL=1 ;;
    --skip-frontend) SKIP_FRONTEND=1 ;;
    --skip-e2e)      SKIP_E2E=1 ;;
    --skip-backend)  SKIP_BACKEND=1 ;;
    --skip-docker)   SKIP_DOCKER=1 ;;
    --skip-tidb-bootstrap) SKIP_TIDB_BOOTSTRAP=1 ;;
    -h|--help)       usage ;;
    *) echo "Unknown flag: $1 (try --help)"; exit 2 ;;
  esac
  shift
done

step() { printf '\n=== %s ===\n' "$1"; }
ok()   { printf 'OK  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED+=("$1"); }
# สองตัวนี้ไม่แตะ FAILED — บอกว่า "ตรวจแล้วแต่เชื่อได้ไม่เต็มร้อย" กับ "ไม่ได้ตรวจ" ซึ่งไม่ใช่
# ความล้มเหลว แต่ก็ไม่ใช่ผ่าน · รูปแบบ prefix อยู่ที่เดียวกับ ok/fail เพื่อให้เทสที่จับ marker
# เหล่านี้ (scripts/tests/ci-local-csp-gate.test.mjs) ไม่ผูกกับสตริงที่กระจายอยู่หลายที่
warn() { printf 'WARN  %s\n' "$1"; }
skip() { printf 'SKIP  %s\n' "$1"; }

echo "smart-port local CI  (root: ${ROOT})"
echo "flags: skip-install=${SKIP_INSTALL} skip-frontend=${SKIP_FRONTEND} skip-e2e=${SKIP_E2E} skip-backend=${SKIP_BACKEND} skip-docker=${SKIP_DOCKER} skip-tidb-bootstrap=${SKIP_TIDB_BOOTSTRAP}"

# ---- 0) Schema parity (เร็ว รันก่อนเสมอ — fail เร็วดีกว่ารอ docker build) -----
step 'Schema Parity Gate'
if node "${ROOT}/scripts/validate-schema-parity.mjs"; then
  ok 'schema parity'
else
  fail 'schema parity'
fi

# รันทั้งโฟลเดอร์ด้วย glob แบบเดียวกับ .githooks/pre-push และ ci.yml — ไล่ชื่อทีละไฟล์
# เคยทำให้เทสที่เพิ่มใหม่หลุดจากทางเข้านี้เงียบ ๆ (ไม่มีใครเห็นว่ามันไม่ถูกรัน)
# ทุกไฟล์ในโฟลเดอร์นี้เป็น regression ที่ไม่ยิง production จริง (ใช้ mock origin) — รวมถึง
# mock-server regression ของ CSP gate (issue #113 R1) ซึ่งเคยมีบล็อกของตัวเองต่อท้ายบล็อกนี้
# แล้วถูกรันซ้ำสองรอบทุกครั้ง · glob ครอบอยู่แล้ว การไล่ชื่อซ้ำมีแต่ทำให้ CI ช้าลงเปล่า ๆ
step 'Script Regressions'
if node --test "${ROOT}"/scripts/tests/*.test.mjs; then
  ok 'script regressions'
else
  fail 'script regressions'
fi

# ---- 0.5) tidb-init bootstrap (A2 — กัน "เขียวลอย") ---------------------------
# tidb-init.sql คือ bootstrap ตัวจริงของ production (Render ตั้ง RUN_MIGRATIONS=0) —
# พิสูจน์ว่า import ลง MySQL เปล่าแล้ว seed/view ใช้งานได้จริง (ดู ci.yml job เดียวกัน)
# ข้ามได้ด้วย --skip-tidb-bootstrap (เช่น sandbox เทสของ ci-local-csp-gate.test.mjs)
if [[ "${SKIP_TIDB_BOOTSTRAP}" -eq 0 ]]; then
  step 'tidb-init.sql Bootstrap Smoke'
  # MSYS (Git Bash บน Windows) แปลง arg ที่มี `:` เป็น path Windows — mount spec
  # กลายเป็นเพี้ยน (source โดนแยกที่ `;`) แล้ว entrypoint ไม่เห็นไฟล์ init เลย
  # ต้องใช้ Windows path จาก cygpath + ปิด path conversion; บน Linux รันแบบปกติ
  if command -v cygpath >/dev/null 2>&1; then
    TIDB_SRC="$(cygpath -w "${ROOT}/database/tidb-init.sql")"
    export MSYS_NO_PATHCONV=1
  else
    TIDB_SRC="${ROOT}/database/tidb-init.sql"
  fi
  # container ชื่อเดียวกับรอบก่อนอาจค้าง (เช่น engine หลุดกลางทางจน rm ไม่ทัน) —
  # ลบของเก่าทิ้งก่อนเสมอ ไม่งั้น docker run --name ชนและ step แดงทั้งที่ bootstrap ดี
  docker rm -f tidb-init-smoke >/dev/null 2>&1 || true
  CONTAINER=$(docker run -d --name tidb-init-smoke \
    -e MYSQL_ROOT_PASSWORD=rootpassword \
    -e MYSQL_DATABASE=civil_service_mgmt \
    -v "${TIDB_SRC}:/docker-entrypoint-initdb.d/tidb-init.sql" \
    mysql:8.0)
  # assert SQL อยู่ไฟล์เดียวกับ ci.yml — ห้าม copy inline (สำเนาเพี้ยนกันเองได้)
  ASSERT_SQL="${ROOT}/scripts/sql/tidb-init-smoke-assert.sql"
  BOOTSTRAP_OK=0
  # probe ก่อนแล้วค่อย sleep — ตรงกับ ci.yml (ของเดิม sleep 5s ก่อน probe แรก ทำให้
  # สอง mirror เหลื่อมกันโดยไม่จำเป็น)
  for _ in $(seq 1 60); do
    if docker exec "${CONTAINER}" mysql -h 127.0.0.1 -uroot -prootpassword --silent \
        -e 'SELECT 1 FROM personnel LIMIT 1' civil_service_mgmt >/dev/null 2>&1; then
      BOOTSTRAP_OK=1
      break
    fi
    sleep 5
  done
  # seed ต้องมีแถวจริง — assert จากไฟล์เดียวกับ ci.yml (แถวสุดท้ายของ output =
  # จำนวนตาราง seed ที่ว่าง ต้องเป็น 0; รุ่นก่อนหน้าแค่ print COUNT = "เขียวลอย")
  if [[ "${BOOTSTRAP_OK}" -eq 1 ]]; then
    EMPTY_TABLES=$(docker exec -i "${CONTAINER}" mysql -h 127.0.0.1 -uroot -prootpassword \
      --batch --skip-column-names civil_service_mgmt < "${ASSERT_SQL}" | tail -n 1)
    echo "seed tables with 0 rows: ${EMPTY_TABLES:-?}"
    # exec ล้ม/ตารางหาย → stdout ว่าง → ไม่ใช่ "0" → fail (fail-closed ทั้งกรณี)
    [[ "${EMPTY_TABLES:-x}" == "0" ]] || BOOTSTRAP_OK=0
  fi
  # view ต้อง compile ได้จริง — text-parity ตรวจไม่ได้
  if [[ "${BOOTSTRAP_OK}" -eq 1 ]] && \
      docker exec "${CONTAINER}" mysql -h 127.0.0.1 -uroot -prootpassword civil_service_mgmt \
      -e 'SELECT COUNT(*) FROM vw_probation_dashboard; SELECT COUNT(*) FROM vw_audit_log;' >/dev/null 2>&1; then
    ok 'tidb-init.sql bootstrap'
  else
    # พิมพ์ log ก่อนลบ container — ของเดิมดึง log แล้วทิ้ง แล้วบอกให้ไปดู log ที่กำลังจะหาย
    echo '--- docker logs tidb-init-smoke (tail 50) ---'
    docker logs "${CONTAINER}" 2>&1 | tail -n 50 || true
    fail 'tidb-init.sql bootstrap (log 50 บรรทัดท้ายอยู่ด้านบน)'
  fi
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
else
  skip 'tidb-init.sql bootstrap (--skip-tidb-bootstrap)'
fi

# ---- 1) Frontend -----------------------------------------------------------
# เช็กสถานะทีละคำสั่งเอง **ไม่พึ่ง `set -e`** — bash ปิด errexit ให้ทุกคำสั่งที่เป็นเงื่อนไขของ
# `if` / `&&` / `||` และการปิดนั้นทะลุเข้าไปใน subshell ด้วย แม้จะสั่ง `set -e` ซ้ำข้างในก็ตาม
# วัดแล้ว: vitest ตกกลางทางแต่ยังได้ `OK  frontend test + build` เพราะสถานะที่ได้คือของคำสั่ง
# สุดท้าย (`npm run build`) เท่านั้น · ทั้งรูป `( … ) && ok || fail` เดิมและรูป `if ( … )` มีปัญหา
# เดียวกัน ต่างกันแค่ตอนนี้ flag ตัวนี้ไปตัดสิน CSP gate ต่อ ผลจึงกลายเป็น "เทสตก แต่ gate เขียว"
# ฝั่ง ci-local.ps1 เช็ก $LASTEXITCODE ทีละคำสั่งอยู่แล้ว จึงไม่เคยมีอาการนี้
frontend_gate() {
  cd "${ROOT}/frontend" || return 1
  if [[ "${SKIP_INSTALL}" -eq 0 ]]; then
    echo 'npm ci ...'
    npm ci || return 1
  else
    # ตัวพิมพ์เล็กโดยตั้งใจ — บรรทัดนี้อยู่ระดับเดียวกับ `npm ci ...` / `npm test (vitest) ...`
    # คือรายงานความคืบหน้า *ภายใน* gate ไม่ใช่การตัดสินระดับ gate ที่ summary สนใจ จึงไม่ใช้ skip()
    echo 'skip npm ci (--skip-install)'
  fi

  # pool/maxWorkers come from frontend/vitest.config.js (forks + 2 workers)
  echo 'npm test (vitest) ...'
  npx vitest run --reporter=dot || return 1

  echo 'npm run build ...'
  npm run build || return 1
}

# FRONTEND_BUILT บันทึกว่า dist ที่จะตรวจในบล็อกถัดไปมาจาก build ของ **โค้ดรอบนี้** หรือไม่
# — "มี dist" กับ "dist ตรงกับโค้ดปัจจุบัน" เป็นคนละเรื่อง และ gate นี้สนใจอย่างหลัง
FRONTEND_BUILT=0
if [[ "${SKIP_FRONTEND}" -eq 0 ]]; then
  step 'Frontend Build & Test'
  # ห่อด้วย subshell เพื่อไม่ให้ `cd` ข้างในรั่วไปถึง gate ถัดไป
  if ( frontend_gate ); then
    ok 'frontend test + build'
    FRONTEND_BUILT=1
  else
    fail 'frontend'
  fi
else
  skip 'frontend (--skip-frontend)'
fi

# ---- 1.5) CSP bundle audit (ต้องรันหลัง build เพราะอ่าน frontend/dist) -------
# แยกสามสถานะ ไม่ใช่ผูกกับ **การมีอยู่ของ dist** อย่างเดียว (review รอบที่ 9 — M1):
#   ขั้น frontend ล้ม     → fail · dist ที่เหลืออยู่เป็นของรอบก่อน ตรวจแทนกันไม่ได้ (vitest ตก
#                          ก็นับด้วย ไม่ใช่เฉพาะ build — dist ที่ build จากโค้ดที่เทสไม่ผ่านก็เชื่อไม่ได้)
#   ไม่ได้ build แต่มี dist → ตรวจ แต่เตือนว่าอาจเป็นของเก่า ("ไม่รู้" ต้องไม่กลายเป็น "สะอาด")
#   ผ่านทั้งขั้น           → ตรวจตามปกติ
# ของเดิมรัน audit กับ dist เก่าเมื่อ build ล้มแล้วขึ้น OK ซึ่งคือ failure mode ที่ gate นี้มีไว้กัน
if [[ "${SKIP_FRONTEND}" -eq 0 && "${FRONTEND_BUILT}" -eq 0 ]]; then
  fail 'csp bundle audit (ขั้น frontend ล้ม — dist ที่มีอยู่เป็นของรอบก่อน ตรวจแทนกันไม่ได้)'
elif [[ -d "${ROOT}/frontend/dist" ]]; then
  step 'CSP Bundle Audit'
  if [[ "${FRONTEND_BUILT}" -eq 0 ]]; then
    # ตรวจดีกว่าไม่ตรวจ แต่ต้องบอกว่าผลนี้อ้างถึง build ไหน ไม่งั้น OK จะถูกอ่านว่า
    # "โค้ดปัจจุบันสะอาด" ทั้งที่ dist อาจเก่ากว่านั้นหลายคอมมิต
    warn 'csp bundle audit: ตรวจ frontend/dist ที่มีอยู่เดิม (--skip-frontend) — อาจไม่ตรงกับโค้ดปัจจุบัน'
  fi
  if node "${ROOT}/scripts/audit-bundle-csp.mjs"; then
    ok 'csp bundle audit'
  else
    fail 'csp bundle audit'
  fi
elif [[ "${SKIP_FRONTEND}" -eq 1 ]]; then
  # ข้ามได้เฉพาะเมื่อผู้ใช้สั่งข้าม build เอง **และ** ไม่มี dist ให้ตรวจจริง ๆ
  # ข้อความต้องบอกทั้งสิ่งที่ขาดและวิธีแก้ ไม่ใช่ข้ามเงียบ
  skip 'csp bundle audit: ไม่มี frontend/dist และสั่ง --skip-frontend ไว้ — รัน npm run build ใน frontend/ ก่อน หรือเลิกใช้ --skip-frontend'
else
  fail 'csp bundle audit (build เพิ่งรันแต่ไม่มี frontend/dist)'
fi

# ---- 2) Playwright E2E: all sidebar menus ---------------------------------
if [[ "${SKIP_E2E}" -eq 0 ]]; then
  step 'E2E All Menus (Docker + Playwright Chromium)'
  if [[ ! -f "${ROOT}/.env" ]]; then
    fail 'e2e (local .env is required for Docker Compose)'
  elif (
    set -e
    cd "${ROOT}"
    docker compose up -d --build db backend
    backend_ready=0
    for _ in $(seq 1 60); do
      if docker compose exec -T db sh -c \
          'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --silent -e "SELECT 1 FROM personnel LIMIT 1" "$MYSQL_DATABASE"' \
          >/dev/null 2>&1 \
        && curl --fail --silent http://127.0.0.1:8000/ >/dev/null; then
        backend_ready=1
        break
      fi
      sleep 5
    done
    if [[ "${backend_ready}" -ne 1 ]]; then
      echo 'backend did not become ready within 5 minutes'
      docker compose logs db backend
      exit 1
    fi
    cd frontend
    npm run test:e2e:menus
  ); then
    ok 'all sidebar menu destinations rendered'
  else
    fail 'e2e'
  fi
else
  skip 'E2E (--skip-e2e)'
fi

# ---- 3) Backend ------------------------------------------------------------
if [[ "${SKIP_BACKEND}" -eq 0 ]]; then
  step 'Backend PHPUnit (via backend/tests/run.sh)'
  if bash "${ROOT}/backend/tests/run.sh"; then
    ok 'backend PHPUnit'
  else
    fail 'backend'
  fi
else
  skip 'backend (--skip-backend)'
fi

# ---- 4) Docker -------------------------------------------------------------
if [[ "${SKIP_DOCKER}" -eq 0 ]]; then
  step 'Docker Build Check'
  if ! command -v docker >/dev/null 2>&1; then
    fail 'docker (not on PATH)'
  else
    (
      set -e
      echo 'docker build frontend ...'
      docker build -t smartport-frontend:ci "${ROOT}/frontend"
      echo 'docker build backend ...'
      docker build -t smartport-backend:ci "${ROOT}/backend"
    ) && ok 'docker images built' || fail 'docker'
  fi
else
  skip 'docker (--skip-docker)'
fi

# ---- Summary ---------------------------------------------------------------
ELAPSED=$(( $(date +%s) - STARTED ))
printf '\n=== Summary (%ss) ===\n' "${ELAPSED}"
if [[ "${#FAILED[@]}" -eq 0 ]]; then
  ok 'all selected jobs passed'
  exit 0
fi
fail "failed jobs: ${FAILED[*]}"
exit 1
