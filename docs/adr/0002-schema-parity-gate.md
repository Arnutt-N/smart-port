# ADR-0002: ยึด `database/tidb-init.sql` เป็น bootstrap เดียวของ production และมี gate กัน drift

- **Status**: Accepted
- **Date**: 2026-07-26

## Context

โปรเจกต์มีทางประกอบ schema อยู่ 3 ทางที่ต้องตรงกัน แต่ไม่มีอะไรบังคับ:

| ทาง | ใช้เมื่อ | กลไก |
|---|---|---|
| `docker-entrypoint-initdb.d` mount ใน `docker-compose.yaml` | dev เครื่องตัวเอง | MySQL รันไฟล์ที่ mount ตอนสร้าง volume ครั้งแรก |
| `backend/scripts/run-migrations.php` | container backend start | ไล่ `database/NN-*.sql` ที่ยังไม่อยู่ใน `schema_migrations` |
| `database/tidb-init.sql` | bootstrap TiDB ใหม่ (ตาม runbook) | import ไฟล์เดียวจบ |

ปัญหาที่ตรวจพบ (2026-07-26): production image (`backend/Dockerfile`) ตั้ง `RUN_MIGRATIONS=0` และ **ไม่ได้ copy `database/` เข้า image** เพราะ Render ตั้ง `rootDir: backend` ทำให้ `database/` อยู่นอก build context — production จึงไม่มีกลไกอัตโนมัติมาเติม schema ให้เลย ทุกอย่างต้องมาจาก `tidb-init.sql` หรือ apply มือ

แต่ `tidb-init.sql` drift ไปแล้ว **28 จุด**: ขาด 8 ตาราง (`audit_log`, `import_log`, `multiplier_experience`, `special_area_multiplier`, `api_rate_limit_hits`, `refresh_tokens`, `awards`, `royal_decorations`), ขาด view `vw_audit_log` และขาด generated column `org_name_hash`/`position_name_hash` ที่ `ImportService` ใช้ upsert นอกจากนี้ `docker-compose.yaml` และ CI ก็ mount migration ไม่ครบ (ตกหล่น 18–20) ทำให้นักพัฒนาที่รันแค่ `docker compose up -d db` ตามคู่มือได้ schema ไม่ครบและ integration test พังโดยไม่รู้สาเหตุ

## Decision

1. **`database/tidb-init.sql` คือ source of truth เดียวสำหรับการสร้าง schema ใหม่** — ต้องสร้างทุกตาราง/view/คอลัมน์ที่ migration ทั้งหมดสร้างรวมกัน
2. **ทุก migration ต้องถูก mount ทั้งใน `docker-compose.yaml` และ `.github/workflows/ci.yml`** ไม่พึ่ง `run-migrations.php` เป็นทางเดียว เพราะ dev และ CI ไม่ได้สตาร์ท container backend เสมอไป
3. **ยกเว้นไฟล์ที่ชื่อมี `test-seed`** — ควบคุมด้วย `APPLY_TEST_SEED_MIGRATIONS` ผ่าน runner เท่านั้น กันข้อมูลทดสอบขึ้น production
4. **`scripts/validate-schema-parity.mjs` เป็น gate ถาวร** ตรวจ 3 invariant นี้และ exit 1 เมื่อพบ drift — รันก่อน commit ที่แตะ schema
5. **ไม่ใส่ seed ที่ยังไม่ยืนยันแหล่งอ้างอิงลง `tidb-init.sql`** — master data พื้นที่พิเศษต้องผ่าน `scripts/validate-multiplier-phase0.mjs` ก่อน

## Consequences

**เชิงบวก**

- สร้าง production ใหม่จากไฟล์เดียวได้จริง และพิสูจน์ได้ด้วยการ import ลง DB เปล่า
- drift แบบเดิมจะถูกจับตั้งแต่ก่อน commit แทนที่จะไปโผล่ตอน deploy
- dev ที่ clone ใหม่ได้ schema ครบจาก `docker compose up -d db` ทางเดียว

**เชิงลบ / ข้อจำกัดที่ต้องรับ**

- เพิ่ม migration ใหม่ทีต้องแตะ 3 ที่ (ไฟล์ migration, `tidb-init.sql`, mount ทั้งสองไฟล์) — gate จะเตือนถ้าลืม แต่ก็ยังเป็นงานมือ
- validator ตรวจระดับ "ชื่อ table/view/column โผล่ในไฟล์หรือไม่" ไม่ได้เทียบชนิดข้อมูลหรือ constraint ทีละตัว จับ drift แบบลืมทั้งก้อนได้ แต่จับความต่างละเอียดไม่ได้
- validator ไม่ได้ตรวจว่า image ที่ deploy จริงมี migration ติดไปหรือไม่ — เรื่องนั้นแก้แยกใน "ภาคต่อ" ด้านล่าง

## ภาคต่อ (2026-07-27): ปิดต้นเหตุที่ production ไม่รัน migration เอง

ตอนเขียน ADR นี้ยังเหลือต้นเหตุค้างไว้ — production build จาก `backend/` ซึ่ง `database/` อยู่นอก context จึงต้อง apply schema มือตลอด แก้แล้วดังนี้:

1. **`render.yaml` build จาก repo root** (`rootDir: .`, `dockerfilePath: ./Dockerfile`) — `Dockerfile` ที่ root มี production hardening ครบเท่ากับ `backend/Dockerfile` ทุกข้อ (opcache, PassEnv, CGIPassAuth, charset, error settings) ต่างแค่ copy `database/` และตั้ง `RUN_MIGRATIONS=1` การสลับจึงไม่เสียอะไรเลย
   **ต้องเคลียร์ "Root Directory" ใน Render dashboard ให้ว่างด้วย** ค่าใน dashboard ทับ blueprint ได้ — ถ้าไม่เคลียร์ deploy จะกลับไปใช้ `backend/Dockerfile` (ยังทำงานได้ แต่ไม่มี migration)
2. **`migrationDirectory()` ไม่ยอมเงียบอีกต่อไป** — เดิมเช็คแค่ `is_dir()` จึงเลือก `/var/www/database` ที่ `backend/Dockerfile` สร้างไว้เปล่า ๆ แล้วรายงาน "No pending migrations." ทั้งที่ schema ไม่ถูกแตะ ตอนนี้ต้องมีไฟล์ migration อยู่จริงจึงจะยอมรับ และถ้า `MIGRATIONS_DIR` ถูกตั้งไว้ชัดเจนแต่ว่าง/ไม่มีอยู่ จะ throw ทันทีแทนการ fallback ไปโฟลเดอร์อื่นเงียบ ๆ
3. **`GET /` รายงาน `migrations_available`** — ดูจากภายนอกได้ทันทีว่า image ที่ deploy มี migration ติดไปกี่ไฟล์ (0 + `migrations_note` = ภาพถูก build ผิดทาง) endpoint นี้ตั้งใจไม่แตะ database และไม่ include `config.php` เพราะทั้งคู่ `exit` เมื่อ env/DB มีปัญหา ซึ่งจะทำให้ Render รีสตาร์ท service ที่ยังดีอยู่
4. ฟังก์ชันบริสุทธิ์ของ runner ย้ายไป `backend/scripts/migration-lib.php` เพื่อให้ unit test เรียกได้โดยไม่กระตุ้น main body ที่ต่อ database (`MigrationDirectoryTest`)

ยืนยันด้วยการ build ทั้งสองทางแล้ว: repo root → `migrations_available: 18` และ runner รันตอน container start จริง · `backend/Dockerfile` → `migrations_available: 0` พร้อมคำเตือน

## ภาคต่อ (2026-08-26): ปิด A2 — tidb-init.sql ถูก execute จริงใน CI + ci-local

- **A2 (review finding 2026-08-20)** คือจุดอ่อนที่เหลืออยู่ของ ADR นี้: `tidb-init.sql` ไม่เคยถูก execute จริง — validator เทียบชื่อเป็นสตริงเท่านั้น จับไม่ได้ถ้าไฟล์มี syntax error, FK อ้างตารางที่นิยามทีหลัง, INSERT seed พัง หรือ view compile ไม่ได้
- **แก้แล้ว**: job ใหม่ `tidb-init-bootstrap` ใน `.github/workflows/ci.yml` — `docker run mysql:8.0` mount **เฉพาะ** `database/tidb-init.sql` เข้า `/docker-entrypoint-initdb.d/` (ไม่ปน migration mounts ของ backend-tests; จุดประสงค์คือพิสูจน์ "สร้างจากไฟล์เดียว" ได้จริง) → wait แบบ TCP + `SELECT 1 FROM personnel` (บทเรียน #129) → assert แถวของตาราง seed 6 ตาราง (`personnel` · `users` · `organization` · `position` · `promotion_criteria` · `probation_program`) **แบบ fail-closed** — จำนวนตาราง seed ที่ว่างต้องเป็น 0 (SQL อยู่ไฟล์เดียว `scripts/sql/tidb-init-smoke-assert.sql` ใช้ร่วมกับ ci-local; รุ่นแรกแค่ print COUNT ซึ่งตารางว่างก็ผ่าน — แก้ตาม review 29 ส.ค.) → query ผ่านบน `vw_probation_dashboard` + `vw_audit_log` (พิสูจน์ว่า view compile — สิ่งที่ text-parity จับไม่ได้)
- **ท้องถิ่นด้วย**: step `tidb-init.sql Bootstrap Smoke` ใน `scripts/ci-local.sh` / `ci-local.ps1` (ชุดคำสั่งเดียวกัน, ข้ามด้วย `--skip-tidb-bootstrap` / `-SkipTidbBootstrap` — sandbox เทสของ ci-local ใช้ flag นี้) — กัน job "เขียวลอย" เพราะ GitHub Actions ปิด auto-trigger (workflow_dispatch-only) gate ที่บังคับจริงคือ pre-push + ci-local
- **ข้อจำกัดที่รับรู้**: พิสูจน์ด้วย MySQL 8 (common subset ที่ไฟล์เขียนมาให้รองรับ TiDB อยู่แล้ว) — ถ้าอนาคตเจอ drift ที่ MySQL จับไม่ได้แต่ TiDB จับได้ ค่อยเพิ่ม TiDB container จริงเป็น follow-up

## References

- Gate: `scripts/validate-schema-parity.mjs` + job `tidb-init-bootstrap` ใน `.github/workflows/ci.yml` (execute จริง)
- Assert SQL ของ smoke: `scripts/sql/tidb-init-smoke-assert.sql` (ไฟล์เดียวใช้ร่วม ci.yml + `ci-local.sh`/`ci-local.ps1`)
- Runbook: `docs/render-tidb-production.md`
- Runner + baseline: `backend/scripts/run-migrations.php`, `backend/tests/Unit/MigrationBaselineTest.php`
