#!/usr/bin/env bash
# ============================================================================
# run.sh — รัน PHPUnit ใน Docker (host ไม่มี php; production image ไม่มี dev deps)
#
#   Unit suite        : รันได้เสมอ (pure PHP, ไม่ต้อง DB)
#   Integration suite : ต่อ db service ถ้าขึ้นอยู่ — ไม่งั้น test markTestSkipped เอง
#
# วิธีใช้:
#   docker compose up -d --build db        # ครั้งแรกรอ db init (~ดู healthcheck)
#   bash backend/tests/run.sh              # รันทั้งหมด
#   bash backend/tests/run.sh --testsuite Unit          # เฉพาะ unit (ไม่ต้องมี db)
#   bash backend/tests/run.sh --filter it_computes      # filter ตามชื่อ test
#
# ส่ง argument ใดๆ ต่อท้าย → ถูก forward เข้า phpunit ตรงๆ
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${BACKEND_DIR}/.." && pwd)"
IMAGE="smartport-phpunit:local"

# Git Bash/MSYS (Windows): ปิด path conversion ของ docker args + แปลง host path
# เป็นรูป Windows (D:/...) — ป้องกัน /app กลายเป็น C:/Program Files/Git/app
DOCKER_SCRIPT_DIR="${SCRIPT_DIR}"
DOCKER_BACKEND_DIR="${BACKEND_DIR}"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    export MSYS_NO_PATHCONV=1
    DOCKER_SCRIPT_DIR="$(cd "${SCRIPT_DIR}" && pwd -W)"
    DOCKER_BACKEND_DIR="$(cd "${BACKEND_DIR}" && pwd -W)"
    ;;
esac

# ---- 1) build test image (cache หลังครั้งแรก) ------------------------------
echo "[run.sh] building test image ${IMAGE} ..."
docker build -t "${IMAGE}" -f "${DOCKER_SCRIPT_DIR}/Dockerfile.test" "${DOCKER_SCRIPT_DIR}" >/dev/null

# ---- 2) ตรวจ network ของ db (compose สร้าง <project>_smartport-net) --------
NET="$(docker network ls --format '{{.Name}}' | grep -E 'smartport-net$' | head -1 || true)"

NET_ARGS=()
ENV_ARGS=()
if [ -n "${NET}" ]; then
  # ดึงค่า DB จาก .env (root + root password = ต่อได้ทุก schema แน่นอน)
  get_env() { grep -E "^$1=" "${ROOT_DIR}/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r"' ; }
  DB_NAME="$(get_env MYSQL_DATABASE)"; DB_NAME="${DB_NAME:-civil_service_mgmt}"
  DB_PASS="$(get_env MYSQL_ROOT_PASSWORD)"; DB_PASS="${DB_PASS:-rootpassword}"

  NET_ARGS=(--network "${NET}")
  ENV_ARGS=(
    -e MYSQL_HOST=db
    -e "MYSQL_DATABASE=${DB_NAME}"
    -e MYSQL_USER=root
    -e "MYSQL_PASSWORD=${DB_PASS}"
  )
  echo "[run.sh] db network: ${NET} — integration suite จะรัน (db=${DB_NAME})"
else
  echo "[run.sh] ไม่พบ db network — integration จะถูก skip (unit suite อย่างเดียว)"
  echo "[run.sh] (ถ้าต้องการ integration: docker compose up -d --build db backend)"
fi

# ---- 3) composer install + phpunit ใน container ----------------------------
# ครั้งแรก lock ยังไม่มี phpunit → install ล้มเหลว → fallback เป็น update (เขียน lock ใหม่)
docker run --rm \
  "${NET_ARGS[@]}" \
  "${ENV_ARGS[@]}" \
  -v "${DOCKER_BACKEND_DIR}:/app" \
  -w /app \
  "${IMAGE}" \
  sh -c '
    set -e
    composer install --no-interaction --no-progress 2>/dev/null \
      || composer update --no-interaction --no-progress
    php vendor/bin/phpunit "$@"
  ' -- "$@"
