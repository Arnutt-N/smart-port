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
-- ใช้ generated STORED column + UNIQUE บน SHA2(name) — กัน collision จาก prefix index บน VARCHAR ยาว >191
-- เลือก generated column แทน functional index ((SHA2(...))) เพราะ TiDB รองรับ generated/stored ตรงๆ
-- แต่ functional/expression index ต้อง tidb_enable_expression_index=ON (อาจ restricted บน TiDB Cloud Serverless)
ALTER TABLE organization
  ADD COLUMN org_name_hash CHAR(64) GENERATED ALWAYS AS (SHA2(org_name, 256)) STORED,
  ADD UNIQUE KEY uq_org_name_hash (org_name_hash);

ALTER TABLE `position`
  ADD COLUMN position_name_hash CHAR(64) GENERATED ALWAYS AS (SHA2(position_name, 256)) STORED,
  ADD UNIQUE KEY uq_position_name_hash (position_name_hash);

-- ---- FK indexes (เร่ง join/lookup ของ candidate views + resolver) ------------
ALTER TABLE personnel
  ADD INDEX idx_personnel_org (current_org_id),
  ADD INDEX idx_personnel_position (current_position_id);

ALTER TABLE personnel_position_history
  ADD INDEX idx_pph_org (org_id),
  ADD INDEX idx_pph_position (position_id);

-- หมายเหตุ: personnel_position_history(personnel_id) มี FK index จาก FK constraint อยู่แล้ว
