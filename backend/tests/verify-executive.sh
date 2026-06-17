#!/usr/bin/env bash
# ============================================================================
# verify-executive.sh
# Integration verification สำหรับ executive track (อำนวยการ M1/M2 + บริหาร S1/S2)
# เทียบ qualification_date ที่ engine คำนวณ กับ golden values จาก Excel master-prep
#
# ใช้รันกับ Docker stack (db + backend) เท่านั้น — CI build image อย่างเดียว ไม่ start DB
# วิธีใช้:
#   docker compose up -d --build db backend
#   bash backend/tests/verify-executive.sh
#
# ตั้งค่าได้ผ่าน env: BASE_URL (default http://localhost:8000), USER, PASS
# golden cases อ้างอิง sample data ใน database/06-seed-data.sql (personnel 101-107)
# ============================================================================
set -u

BASE_URL="${BASE_URL:-http://localhost:8000}"
USER="${USER:-admin}"
PASS="${PASS:-admin123}"

TOKEN=""
for i in $(seq 1 8); do
  TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" \
    | grep -oE '"token":"[^"]+"' | sed 's/"token":"//;s/"$//')
  [ -n "$TOKEN" ] && break
  sleep 4
done
if [ -z "$TOKEN" ]; then echo "FATAL: login failed at $BASE_URL"; exit 2; fi

PASS_N=0; FAIL_N=0

# check <level> <personnel_id> <expected: YYYY-MM-DD | check_data>
check() {
  local level="$1" id="$2" expected="$3"
  local got
  got=$(curl -s "$BASE_URL/candidates/$level/$id" -H "Authorization: Bearer $TOKEN" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const r=JSON.parse(d).data;if(!r){console.log("null");return}console.log(r.status==="check_data"?"check_data":(r.qualification_date||"null"))}catch(e){console.log("parse_err")}})')
  if [ "$got" = "$expected" ]; then
    echo "  PASS  $level/$id => $got"
    PASS_N=$((PASS_N+1))
  else
    echo "  FAIL  $level/$id => got '$got', expected '$expected'"
    FAIL_N=$((FAIL_N+1))
  fi
}

echo "=== Executive track golden verification ==="
# M1 อำนวยการต้น: K3 +3ปี / O3 +6ปี + gate 3 ต่าง (MAX กับวันครบ 3 ต่าง)
check M1 101 2023-08-26   # K3 start 2020-08-26, 3ต่าง 2018-01-01 -> MAX = 2023-08-26
check M1 102 2024-03-28   # O3 start 2018-03-28 +6y
check M1 104 check_data   # K3 ไม่มี 3 ต่าง -> gate ปิด
# M2 อำนวยการสูง: multi-path เลือกวันเร็วสุด
check M2 103 2021-08-26   # M1 start 2020-08-26 +1y
check M2 105 2023-06-01   # combination M1+K3: prevK3 2019-06-01 +4y (เร็วกว่า M1+1=2024-01-01)
# S1 บริหารต้น: ดำรง +2ปี (K4 ต้องมีเทียบตำแหน่ง)
check S1 103 2022-08-26   # M1 start 2020-08-26 +2y
check S1 106 2024-01-01   # K4 start 2022-01-01 +2y + gate เทียบตำแหน่ง
# S2 บริหารสูง: S1 +1ปี
check S2 107 2025-01-01   # S1 start 2024-01-01 +1y

echo "=== Result: $PASS_N passed, $FAIL_N failed ==="
[ "$FAIL_N" -eq 0 ] || exit 1
