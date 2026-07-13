-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- 16-multiplier-test-seed-expand.sql
-- TEST seed expansion (user requested: do not wait for HR)
--
-- Adds:
-- - Satun 4 provisional districts (never whole-province)
-- - Post-2548 EMERGENCY_DECREE open-ended rows for Yala/Pattani/Narathiwat
--
-- Governance:
-- - All legal/source refs are TEST_SEED placeholders — replace after HR Phase 0
-- - Idempotent via INSERT IGNORE + unique (province, district_key, basis_type, effective_start_date)
-- ============================================================================

INSERT IGNORE INTO special_area_multiplier
  (province, district, basis_type, multiplier_ratio, effective_start_date, effective_end_date, legal_reference, source_reference, is_active)
VALUES
  ('สตูล', 'ควนโดน', 'MARTIAL_LAW', 200.00, '2004-01-26', '2004-09-30',
   'TEST_SEED: development placeholder (not HR-confirmed)', 'TEST_SEED: provisional Satun district list', 1),
  ('สตูล', 'ควนกาหลง', 'MARTIAL_LAW', 200.00, '2004-01-26', '2004-09-30',
   'TEST_SEED: development placeholder (not HR-confirmed)', 'TEST_SEED: provisional Satun district list', 1),
  ('สตูล', 'ท่าแพ', 'MARTIAL_LAW', 200.00, '2004-01-26', '2004-09-30',
   'TEST_SEED: development placeholder (not HR-confirmed)', 'TEST_SEED: provisional Satun district list', 1),
  ('สตูล', 'มะนัง', 'MARTIAL_LAW', 200.00, '2004-01-26', '2004-09-30',
   'TEST_SEED: development placeholder (not HR-confirmed)', 'TEST_SEED: provisional Satun district list', 1),
  ('ยะลา', NULL, 'EMERGENCY_DECREE', 200.00, '2005-07-20', NULL,
   'TEST_SEED: development placeholder (not HR-confirmed)', 'TEST_SEED: provisional post-2548 open-ended', 1),
  ('ปัตตานี', NULL, 'EMERGENCY_DECREE', 200.00, '2005-07-20', NULL,
   'TEST_SEED: development placeholder (not HR-confirmed)', 'TEST_SEED: provisional post-2548 open-ended', 1),
  ('นราธิวาส', NULL, 'EMERGENCY_DECREE', 200.00, '2005-07-20', NULL,
   'TEST_SEED: development placeholder (not HR-confirmed)', 'TEST_SEED: provisional post-2548 open-ended', 1);
