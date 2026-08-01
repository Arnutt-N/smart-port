-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 22-unify-person-identity.sql
-- ADR-0002: รวมตารางบุคคล — merge civil_servants เข้า personnel
--
-- ขั้นตอน:
--   1. เพิ่มคอลัมน์ใน personnel (6 คอลัมน์จาก civil_servants)
--   2. ย้ายข้อมูลจาก civil_servants → personnel (map by citizen_id)
--   3. ปลด FK เก่าที่ชี้ civil_servants
--   4. Remap servant_id ในตารางลูก → personnel_id
--   5. ลบ dead view (v_civil_servants_current)
--
-- หมายเหตุ TiDB: ไม่เพิ่ม FOREIGN KEY ใหม่ (ตาม convention migration 18–20)
--   ใช้ index + application-level enforcement แทน
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. เพิ่มคอลัมน์ใน personnel (idempotent — รองรับ tidb-init ที่ bake คอลัมน์ไว้แล้ว)
-- ----------------------------------------------------------------------------
SET @db := DATABASE();

SET @sql := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE personnel ADD COLUMN prefix_id INT NULL AFTER last_name',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'prefix_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE personnel ADD COLUMN employee_id VARCHAR(20) NULL AFTER prefix_id',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'employee_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE personnel ADD COLUMN birth_date DATE NULL AFTER employee_id',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'birth_date'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE personnel ADD COLUMN appointment_date DATE NULL AFTER birth_date',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'appointment_date'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE personnel ADD COLUMN retirement_date DATE NULL AFTER appointment_date',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'retirement_date'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE personnel ADD COLUMN servant_status VARCHAR(20) DEFAULT ''active'' AFTER retirement_date',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'servant_status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE personnel ADD UNIQUE KEY uq_personnel_employee_id (employee_id)',
    'SELECT 1')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'personnel' AND INDEX_NAME = 'uq_personnel_employee_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE personnel ADD KEY idx_personnel_prefix (prefix_id)',
    'SELECT 1')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'personnel' AND INDEX_NAME = 'idx_personnel_prefix'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE personnel ADD KEY idx_personnel_retirement (retirement_date)',
    'SELECT 1')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'personnel' AND INDEX_NAME = 'idx_personnel_retirement'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- 2. ย้ายข้อมูลจาก civil_servants → personnel (เฉพาะที่ยังไม่มีใน personnel)
--    COLLATE ป้องกัน error 1267 (civil_servants อาจเป็น utf8mb4_0900_ai_ci)
-- ----------------------------------------------------------------------------
INSERT INTO personnel (citizen_id, first_name, last_name, prefix_id, employee_id,
                       birth_date, appointment_date, retirement_date, servant_status,
                       is_active, hire_date)
SELECT
  cs.citizen_id COLLATE utf8mb4_unicode_ci,
  cs.first_name,
  cs.last_name,
  cs.prefix_id,
  cs.employee_id,
  cs.birth_date,
  cs.appointment_date,
  cs.retirement_date,
  COALESCE(cs.servant_status, 'active'),
  cs.is_active,
  cs.appointment_date
FROM civil_servants cs
WHERE cs.citizen_id COLLATE utf8mb4_unicode_ci NOT IN (
  SELECT citizen_id FROM personnel WHERE citizen_id IS NOT NULL
);

-- ----------------------------------------------------------------------------
-- 3. ปลด FK เก่าที่ชี้ civil_servants (ชื่อจาก MySQL auto-generate)
--    ต้องทำก่อน remap ค่า เพราะค่าใหม่ (personnel_id) ไม่มีใน civil_servants
-- ----------------------------------------------------------------------------
ALTER TABLE civil_servant_photos DROP FOREIGN KEY civil_servant_photos_ibfk_1;
ALTER TABLE advance_notifications DROP FOREIGN KEY advance_notifications_ibfk_1;
ALTER TABLE performance_proposals DROP FOREIGN KEY performance_proposals_ibfk_1;
ALTER TABLE performance_proposals DROP FOREIGN KEY performance_proposals_ibfk_2;
ALTER TABLE task_assignments DROP FOREIGN KEY task_assignments_ibfk_1;
ALTER TABLE task_assignments DROP FOREIGN KEY task_assignments_ibfk_2;

-- ----------------------------------------------------------------------------
-- 4. Remap servant_id ในตารางลูก → personnel_id (map ผ่าน citizen_id)
-- ----------------------------------------------------------------------------
UPDATE civil_servant_photos csp
  JOIN civil_servants cs ON csp.servant_id = cs.servant_id
  JOIN personnel p ON p.citizen_id = cs.citizen_id COLLATE utf8mb4_unicode_ci
SET csp.servant_id = p.personnel_id;

UPDATE awards a
  JOIN civil_servants cs ON a.servant_id = cs.servant_id
  JOIN personnel p ON p.citizen_id = cs.citizen_id COLLATE utf8mb4_unicode_ci
SET a.servant_id = p.personnel_id;

UPDATE royal_decorations rd
  JOIN civil_servants cs ON rd.servant_id = cs.servant_id
  JOIN personnel p ON p.citizen_id = cs.citizen_id COLLATE utf8mb4_unicode_ci
SET rd.servant_id = p.personnel_id;

UPDATE performance_proposals pp
  JOIN civil_servants cs ON pp.servant_id = cs.servant_id
  JOIN personnel p ON p.citizen_id = cs.citizen_id COLLATE utf8mb4_unicode_ci
SET pp.servant_id = p.personnel_id;

UPDATE performance_proposals pp
  JOIN civil_servants cs ON pp.evaluator_id = cs.servant_id
  JOIN personnel p ON p.citizen_id = cs.citizen_id COLLATE utf8mb4_unicode_ci
SET pp.evaluator_id = p.personnel_id;

UPDATE advance_notifications an
  JOIN civil_servants cs ON an.servant_id = cs.servant_id
  JOIN personnel p ON p.citizen_id = cs.citizen_id COLLATE utf8mb4_unicode_ci
SET an.servant_id = p.personnel_id;

UPDATE task_assignments ta
  JOIN civil_servants cs ON ta.assignee_id = cs.servant_id
  JOIN personnel p ON p.citizen_id = cs.citizen_id COLLATE utf8mb4_unicode_ci
SET ta.assignee_id = p.personnel_id;

UPDATE task_assignments ta
  JOIN civil_servants cs ON ta.assigner_id = cs.servant_id
  JOIN personnel p ON p.citizen_id = cs.citizen_id COLLATE utf8mb4_unicode_ci
SET ta.assigner_id = p.personnel_id;

-- ----------------------------------------------------------------------------
-- 5. ลบ dead view (ไม่มี consumer ในแอป — backend ทำ JOIN inline)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_civil_servants_current;
