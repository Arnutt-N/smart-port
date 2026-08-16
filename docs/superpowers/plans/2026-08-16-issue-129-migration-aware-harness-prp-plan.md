# PRP Plan — Issue #129: Test harness ให้ integration run เป็น migration-aware

วันที่: 2026-08-16 · Branch: `issue-129-migration-aware-harness` · Severity: Low (test-harness accuracy)

## Problem

จาก review ของ #124: assertion `migrations_pending === 0` ใน
`backend/tests/Integration/ReadyzTest.php` ว่างเปล่าเชิงโครงสร้างใน automated run ทุกที่:

1. `run.sh` และ `ci.yml` mount เฉพาะ `backend/` เข้า `/app` → ทั้งสอง candidate ของ
   `migrationDirectory()` (`/var/www/database`, `/database`) พลาด → throw →
   `readyzReport()` catch แล้วตั้ง `bundled = []` → `pending` เป็น **0 เสมอ**
2. CI MySQL ไม่มี `schema_migrations` (provision ผ่าน init mounts อย่างเดียว)

ผล: test จับ DB ที่ยัง migrate ไม่ครบไม่ได้เลย

## Context ที่ตรวจแล้ว

- `migrationDirectory()` รองรับ env override `MIGRATIONS_DIR` และเลือก candidate
  `/var/www/database` หรือ `dirname(__DIR__,2).'/database'` (= `/database` เมื่อ backend อยู่ที่ `/app`)
- `run-migrations.php` มี baseline seeding: DB ที่ provision แล้ว (มี `personnel`/`users`)
  จะได้ baseline rows ถึง `25-ensure-multiplier-tables.sql` แล้ว apply เฉพาะไฟล์ใหม่กว่า (26–30)
- **DB state ที่ตรวจจริง:**
  - Local dev DB (`db-data` volume): มี `schema_migrations` ครบ 03–30 แล้ว → runner จะ
    "No pending migrations." ไม่มี re-apply risk
  - CI MySQL (fresh ทุก run): init mounts 01–25, 27–30 → baseline 03–25 + apply 26–30 → pending 0 จริง
- `26-e2e-admin-test-seed.sql` ไม่มีคำว่า `test-seed` ในชื่อ? — **มี** (`e2e-admin-test-seed`)
  → runner ไม่ gate (ไม่มี substring `test-seed`... ตรวจ: `str_contains('26-e2e-admin-test-seed.sql','test-seed')` = **true**)
  → runner จะ SKIP เว้นแต่ `APPLY_TEST_SEED_MIGRATIONS=1` และ readyz ก็นับข้ามด้วยเงื่อนไขเดียวกัน
  → ทั้งสองฝั่ง consistent เสมอไม่ว่าจะเปิด env หรือไม่

## Changes

### 1. `backend/tests/run.sh`

- คำนวณ `DOCKER_ROOT_DIR` (รูป Windows เมื่อ MSYS เหมือน `DOCKER_BACKEND_DIR`)
- เพิ่ม mount `-v "${DOCKER_ROOT_DIR}/database:/database"`
- ใน `sh -c` block: ถ้ามี DB (`[ -n "$MYSQL_HOST" ]`) รัน
  `php scripts/run-migrations.php` ก่อน phpunit — ล้มเหลว = fail ทั้ง run (fail-fast
  คือจุดประสงค์ของ issue นี้)

### 2. `.github/workflows/ci.yml` (backend-tests job)

- เพิ่ม step "Run migrations" หลัง build image: `docker run smartport-phpunit:ci`
  แบบ `--network host` + env เดียวกับ step phpunit + mount `$PWD/database:/database` +
  `$PWD/backend:/app` → `php scripts/run-migrations.php`
  (ไม่ต้อง composer install — runner ใช้แค่ PDO)
- step phpunit เองก็ต้อง mount `$PWD/database:/database` ด้วย (ไม่อย่างนั้น
  ReadyzTest เรียก `migrationDirectory()` ตรง ๆ แล้ว throw — reviewer finding C2)

### 2b. `backend/scripts/migration-lib.php` (แก้ตาม review)

- **C1/I1:** ขยับ `MIGRATION_BASELINE_THROUGH` จาก `25-ensure-multiplier-tables.sql`
  เป็น `30-photo-blob-storage.sql` — init mounts (compose + CI + tidb-init) ครอบถึง 30
  แล้ว ถ้า baseline ตัดที่ 25 runner จะ re-apply 30 (ALTER TABLE ADD COLUMN ล้วน ๆ)
  บน fresh volume → Duplicate column → gate พัง ตรวจพิสูจน์แล้ว: ลบ row 30 จำลอง →
  runner "Baselined 1 historical migration(s)" + "No pending migrations." (ไม่ re-apply)
- candidate path: `rtrim(dirname(__DIR__, 2), '/\\')` กัน `//database` เมื่อ backend
  ถูก mount ที่ `/app` (test container)
- `MigrationBaselineTest.php` ขยับตาม (ค่าคงที่ + placeholder 31 + เพิ่ม 27/30 ใน historical list)

### 2c. แก้ตาม deep review รอบสอง

- **I-1:** CI wait probe เพิ่ม `-h 127.0.0.1` (ระหว่าง init mysql:8.0 รัน socket-only
  temporary server — probe socket ผ่านก่อน init จบ) + step "Run migrations" มี retry 3 ครั้ง
- **I-2:** docs/render-tidb-production.md — อัปเดต baseline เป็น through 30 + ⚠️ dumps
  เก่าใน repo (export-*.sql/reimport-data.sql) predates 27–30: restore แล้ว runner จะ
  baseline ทับโดยไม่ apply — ต้องลบ rows ≥26 หรือใช้ dump ปัจจุบัน
- **M-1:** docblock run-migrations.php (25-* → 30-*)
- **M-3:** run.sh — migrate มี retry 3 ครั้ง (db กำลัง init/restart) กัน foot-gun
- **N-1/N-2/N-3:** empty-list guard ใน negative test + comment applied_at + คำอธิบาย rtrim
- ไม่แก้: M-2 (APPLY_TEST_SEED forward — ทั้งสองฝั่ง consistent เมื่อ unset), N-4 (ย้าย
  test-seed skip ลง lib), N-5 (array expansion — bash ≥4.4 บนเครื่องนี้/CI พอ)

### 3. `backend/tests/Integration/ReadyzTest.php`

- ลบ comment เรื่อง harness limitation (หมดจริงแล้ว)
- เพิ่ม assert: `migrations_bundled > 0` และเท่ากับ `count(listMigrationFiles(migrationDirectory()))`
  (กัน bundled=[] regression ตรง ๆ)
- เพิ่ม negative test `test_report_detects_missing_migration_row`:
  DELETE row สุดท้าย (natural order) จาก `schema_migrations` →
  assert `status === 'migrations_pending'` + `migrations_pending === 1` →
  INSERT คืน (try/finally กันค้างถ้า assert พังกลางทาง)

### ไม่แก้

- `Dockerfile.test` — ไม่เกี่ยว (mount ระดับ `docker run`)
- `readyz.php` — พฤติกรรมถูกแล้ว ช่องว่างอยู่ที่ harness

## Acceptance criteria

- [x] `bash backend/tests/run.sh` → integration suite รัน, ReadyzTest ผ่านด้วย
      `migrations_bundled > 0`, `migrations_pending === 0` จริง (ไม่ว่างเปล่า)
- [x] Negative test ผ่าน: ลบ row → pending 1 / status migrations_pending → restore
- [x] `ci.yml` backend-tests: step migrations ใหม่ + `pending === 0` มีความหมาย
      (ตรวจด้วยตา; GH Actions ไม่ถูก dispatch — local gate เท่านั้น)
- [x] Unit suite ยังเขียว, full suite 354 tests / 951 assertions เขียว (1 skip เดิม)
- [x] C1/I1 simulation: ลบ row 30 → runner baseline คืน ไม่ re-apply ALTER
- [ ] Full local CI gate ผ่าน

## Risks

- DB ที่ provision เก่ากว่า init set ปัจจุบัน (ไม่มีคอลัมน์ของ 30 แต่ถูก baseline ครอบ):
  เกิดได้เฉพาะ volume ที่สร้างก่อนยุค #112 แล้วไม่เคยรัน runner — runner จะไม่ apply 30
  (baseline) แต่คอลัมน์ไม่มีจริง → readyz ยัง ready. ยอมรับ: ทุก env จริง (compose/CI/TiDB)
  ผ่าน init ที่ครอบถึง 30 หรือมี row ครบแล้ว
- Negative test แตะตาราง shared → try/finally restore + ใช้ migration สุดท้ายที่ไม่ใช่ test-seed

## Skills ที่ใช้ (per `.claude/skill-collections-20260815.md`)

`ecc:plan-prd` (plan นี้) · `ecc:database-migrations` + `ecc:mysql-patterns` (migration runner/baseline) ·
`addyosmani:ci-cd-and-automation` (run.sh/ci.yml) · `superpowers:test-driven-development` (negative test) ·
`superpowers:requesting-code-review` + `ecc:php-review` (reviewer subagent)
