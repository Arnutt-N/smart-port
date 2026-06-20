# Deploy Runbook — HR Import Phase 2 (PR #12)

> รันบน **TiDB Cloud (prod)** — apply เองจาก local ไม่ได้ (ต้อง prod credential). ทำตามลำดับ; แต่ละขั้นมี verify

## 0. ก่อนเริ่ม (ทำครั้งเดียว)
- ตั้ง env **`MYSQL_SSL_CA`** บน Render = path ไป CA bundle ของ TiDB (PR-0 fail-closed จะ throw ถ้า `MYSQL_SSL=true` แต่ไม่มี CA) แล้ว redeploy backend → health check ว่าต่อ DB ผ่าน SSL verify
- ตั้ง `MYSQL_SSL=true` (ถ้ายังไม่ตั้ง) สำหรับ TiDB

## 1. Verify-prod (ตรวจก่อน apply migration — ต้องสะอาด)
```sql
-- ชื่อ org/position ซ้ำ? (ถ้ามี ต้อง dedup ก่อน UNIQUE ไม่งั้น ALTER fail)
SELECT org_name, COUNT(*) c FROM organization GROUP BY org_name HAVING c > 1;
SELECT position_name, COUNT(*) c FROM `position` GROUP BY position_name HAVING c > 1;
-- data ปนเปื้อน id=1 จาก Phase 1? (ถ้า > 0 และไม่ใช่ seed personnel_id 1-7 → ต้อง backfill)
SELECT COUNT(*) FROM personnel WHERE current_org_id = 1 OR current_position_id = 1;
```
ตาม memory: Phase 1 ยังไม่ import จริง → คาดว่า org/position มีแค่ seed (ไม่ซ้ำ) + ไม่มี contaminated

## 2. Dedup (เฉพาะถ้า §1 พบชื่อซ้ำ)
```sql
-- ตัวอย่าง: ชี้ FK ของแถวซ้ำไปยัง id ตัวแรก แล้วลบตัวซ้ำ (ปรับตามผลจริง)
-- UPDATE personnel p JOIN (SELECT MIN(org_id) keep_id, org_name FROM organization GROUP BY org_name HAVING COUNT(*)>1) d
--   ON p.current_org_id IN (SELECT org_id FROM organization WHERE org_name=d.org_name)
--   SET p.current_org_id = d.keep_id;
-- DELETE o FROM organization o JOIN (...) ... WHERE o.org_id <> keep_id;
```

## 3. Apply migrations (ตามลำดับ)
> ⚠️ prod อยู่แค่ #11 → **ต้อง apply 10 ด้วย** (verify 2026-06-20: import_log ยังไม่มีบน prod)
```sql
SOURCE database/10-import-log.sql;            -- ตาราง import_log (audit + rate limit) — ต้องมาก่อน 12
SOURCE database/11-import-constraints.sql;   -- UNIQUE (generated STORED column) + FK indexes
SOURCE database/12-import-log-fk.sql;         -- FK import_log.user_id → users (ต้องมี import_log ก่อน)
```
**migration 11 ใช้ generated STORED column** (`org_name_hash`/`position_name_hash` = `SHA2(name,256)`) + UNIQUE บน column นั้น — เลือกแทน functional index `((SHA2(...)))` เพราะ TiDB รองรับ generated/stored ตรงๆ ส่วน expression index ต้อง `tidb_enable_expression_index=ON` (อาจ restricted บน Serverless)

## 4. Verify หลัง apply
```sql
SHOW INDEX FROM organization WHERE Key_name='uq_org_name_hash';   -- ต้องมี, Non_unique=0
SHOW INDEX FROM `position` WHERE Key_name='uq_position_name_hash';
SHOW INDEX FROM personnel WHERE Key_name LIKE 'idx_personnel_%';   -- 2 แถว
SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_NAME='fk_import_log_user';                      -- ต้องมี
```

## 5. Fallback (ถ้า TiDB ไม่รับ generated column / SHA2)
resolver ใช้ **SELECT-then-insert + in-batch cache** → กัน dup ระดับ app ได้อยู่แล้ว (admin-only, single-user → race แทบไม่เกิด). ถ้า §3 migration 11 ส่วน UNIQUE fail บน TiDB:
- ข้าม UNIQUE (apply เฉพาะ FK indexes ในไฟล์) → ระบบยังทำงานถูก (UNIQUE เป็น defense-in-depth เท่านั้น)
- หรือลอง functional index version: `ALTER TABLE organization ADD UNIQUE KEY uq_org_name_hash ((SHA2(org_name,256)));` หลัง `SET SESSION tidb_enable_expression_index=ON;`

## 6. Import จริง + verify business
- เข้า `/import` (admin) → อัปโหลด .xlsx → ตรวจ summary
- `SELECT * FROM import_log ORDER BY log_id DESC LIMIT 5;` (audit — ไม่มี citizen_id)
- ตรวจ candidate views ไม่ว่าง: `SELECT * FROM vw_executive_tenure LIMIT 5;`
- ตรวจ `current_org_id`/`current_position_id` ของ personnel ที่ import ≠ 1

## 7. CI/Deploy workflows (ถ้าจะ merge เข้า main)
CI + Deploy ถูก `gh workflow disable` (quota หมด) → merge จะไม่ trigger auto-deploy. Deploy ผ่าน Render dashboard Manual Deploy หรือ curl deploy hook. เปิด CI กลับเมื่อ quota reset: `gh workflow enable 249676166 250058541` + uncomment `on:` ใน workflow files
