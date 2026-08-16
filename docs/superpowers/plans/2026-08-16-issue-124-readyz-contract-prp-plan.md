# PRP Plan — Issue #124: readyz contract accuracy

วันที่: 2026-08-16 · Branch: `issue-124-readyz-contract` · Parent audit: review ของ #110–#115 (range `720dda6..a1fafa1`), findings 2 + 8

## Problem

1. **DB-down shape เป็น dead code:** `handleReadyz()` จับ DB failure เพื่อคืน
   `{"status":"not_ready","db":"unreachable"}` (503) แต่ `getDB()` ใน config.php
   `exit` ด้วย `{"error":"Database connection failed"}` ก่อนถึง handler เสมอ —
   monitor ที่ parse ฟิลด์ `status` ไม่เคยเห็น `not_ready` จริง
2. **ReadyzTest assert อ่อนกว่าชื่อ:** test "ready with zero pending" assert แค่
   `migrations_pending >= 0` ไม่ใช่ `0` และ runbook ไม่เตือนว่า `ready` +
   `migrations_bundled: 0` อาจแปลว่า image ไม่ได้ bundle `database/` ไว้

## Decision: Option (a) — ทำให้ readyz ผลิต documented shape จริง

เหตุผล: contract ที่เอกสาร/runbook ระบุไว้มีประโยชน์ต่อ monitor (ฟิลด์ `status`
เสถียร) การยอมให้ config.php exit ทับ shape = ลดคุณภาพ monitoring โดยไม่มี gain;
การเพิ่ม non-exiting probe เปลี่ยนแปลงน้อยและ backward-compatible กับทุก route อื่น

## Changes

### 1. `backend/config.php` — แยก connection attempt ออกจาก exit

- แตก `getDB()` เป็น:
  - `attemptDbConnection(): ?PDO` — env/DSN/options/retry loop เดิมทั้งหมด คืน
    `PDO|null` (log error เดิมอยู่ที่นี่) ไม่ exit ไม่ echo
  - `tryGetDB(): ?PDO` — lazy cache ใน `$pdo` global เหมือนเดิม คืน null เมื่อต่อไม่ได้
  - `getDB(): PDO` — เรียก `tryGetDB()`; null → พฤติกรรมเดิมทุกประการ
    (error message แยก local/prod, 503, `exit`)
- ทุก route เดิมเรียก `getDB()` = พฤติกรรมไม่เปลี่ยน

### 2. `backend/routes/readyz.php` — รับ nullable PDO

- `handleReadyz(?PDO $pdo, string $method)`: `$pdo === null` → 503
  `{"status":"not_ready","release":...,"db":"unreachable"}` (shape เดิมที่เคย dead)
- ดึง emitter ร่วม `emitNotReady()` ใช้ทั้ง null case และ catch case (query fail กลางทาง)

### 3. `backend/api.php` — readyz ใช้ probe

- `case 'readyz': handleReadyz(tryGetDB(), $method);`

### 4. Tests

- `tests/Integration/ReadyzTest.php`: migrated-DB test assert
  `migrations_pending === 0` และ `status === 'ready'` (strict ตามชื่อ test)
- ใหม่ `tests/Unit/ReadyzHandlerTest.php` (ไม่ต้องมี DB): `handleReadyz(null, 'GET')`
  → ob_start จับ output, assert 503 + shape `not_ready`/`db:"unreachable"`/มี `release`;
  method อื่นไม่ใช่ GET ยัง 405

### 5. `docs/render-tidb-production.md`

- แก้บรรทัด DB-down: ระบุ shape จริง `503 {"status":"not_ready","release":"...","db":"unreachable"}`
  (ลบ "(or a 503 from the connection layer)" ที่ไม่จริงอีกต่อไป)
- เพิ่ม note: `ready` + `migrations_bundled: 0` = image อาจไม่ได้ bundle `database/` —
  เช็ค `migrations_available` จาก `/` ประกอบ

## Verification

1. `php -l` ทุกไฟล์ที่แก้ (docker smartport-phpunit:local)
2. `bash backend/tests/run.sh --filter "Readyz"` — integration (ต้องต่อ DB ได้) + unit
3. Live smoke: `docker compose up -d db backend` → `curl -i localhost:8000/readyz`
   (happy path); DB-down path ตรวจผ่าน unit test (stop db = slow, unit พอ)
4. Full CI gate: `scripts/ci-local.ps1 -SkipInstall`

## Acceptance

- [ ] readyz คืน `{"status":"not_ready","db":"unreachable"}` 503 เมื่อ DB ต่อไม่ได้จริง (unit test + code path)
- [ ] ทุก route อื่นยังได้พฤติกรรม 503/exit เดิมจาก `getDB()`
- [ ] ReadyzTest assert `migrations_pending === 0` และ `status === 'ready'` และเขียวบน migrated DB
- [ ] Runbook ระบุ DB-down shape จริง + caveat `migrations_bundled: 0`
- [ ] CI gate ผ่าน
