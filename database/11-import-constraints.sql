-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 11-import-constraints.sql
-- UNIQUE/index gate สำหรับ HR import (find-or-create org/position) + FK indexes
--
-- ⚠️ GATE: apply ก่อน import จริงบน prod เท่านั้น และ VERIFY บน TiDB ก่อน
--    (functional index + SHA2 อาจ behave ต่างจาก MySQL 8 — ทดสอบ syntax ก่อน apply prod)
--
-- VERIFY-PROD ก่อน apply (ถ้ามีผล = ชื่อซ้ำ ต้อง dedup ก่อน):
--   SELECT org_name, COUNT(*) c FROM organization GROUP BY org_name HAVING c > 1;
--   SELECT position_name, COUNT(*) c FROM `position` GROUP BY position_name HAVING c > 1;
--   SELECT COUNT(*) FROM personnel WHERE current_org_id = 1 OR current_position_id = 1; -- data ปนเปื้อน id=1 เดิม?
-- ============================================================================

-- ---- UNIQUE (safety net กัน dup จาก race) -----------------------------------
-- resolver normalize ชื่อ (trim + ยุบ whitespace) ก่อน insert อยู่แล้ว → ค่าที่เก็บ normalized
-- ใช้ generated VIRTUAL column + UNIQUE บน SHA2(name) — กัน collision จาก prefix index บน VARCHAR ยาว >191
-- ⚠️ ต้องเป็น VIRTUAL ไม่ใช่ STORED: TiDB ห้าม ADD STORED generated column ผ่าน ALTER (ERROR 3106)
--    VIRTUAL ใช้ได้ทั้ง TiDB + MySQL 8 และ UNIQUE index บน virtual generated column ยัง enforce ได้
-- แยก ADD COLUMN กับ ADD UNIQUE ออกจากกัน: TiDB ห้าม index อ้าง column ที่เพิ่งเพิ่มใน ALTER เดียวกัน (ERROR 1072)
ALTER TABLE organization ADD COLUMN org_name_hash CHAR(64) GENERATED ALWAYS AS (SHA2(org_name, 256)) VIRTUAL;
ALTER TABLE organization ADD UNIQUE KEY uq_org_name_hash (org_name_hash);
ALTER TABLE `position` ADD COLUMN position_name_hash CHAR(64) GENERATED ALWAYS AS (SHA2(position_name, 256)) VIRTUAL;
ALTER TABLE `position` ADD UNIQUE KEY uq_position_name_hash (position_name_hash);

-- ---- FK indexes (เร่ง join/lookup ของ candidate views + resolver) — แยก ALTER ต่อ index ----
ALTER TABLE personnel ADD INDEX idx_personnel_org (current_org_id);
ALTER TABLE personnel ADD INDEX idx_personnel_position (current_position_id);
ALTER TABLE personnel_position_history ADD INDEX idx_pph_org (org_id);
ALTER TABLE personnel_position_history ADD INDEX idx_pph_position (position_id);

-- หมายเหตุ: personnel_position_history(personnel_id) มี FK index จาก FK constraint อยู่แล้ว
