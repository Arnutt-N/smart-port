-- ============================================================================
-- cleanup-csp-test-data.sql — ลบข้อมูลทดสอบ CSP ออกจาก production (TiDB Cloud)
--
-- ขอบเขต (owner ยืนยันแล้ว — owner decisions 2026-08-24 ข้อ 4):
--   personnel             ชื่อ (first_name/last_name) ขึ้นต้น 'ทดสอบCSP'
--   special_area_multiplier  province ขึ้นต้น 'ทดสอบCSP-'
--   (ตารางจริงคือ special_area_multiplier — ไม่มีตารางชื่อ multiplier_areas
--    นั่นคือชื่อ resource ของ API)
--
-- ⚠️ DESTRUCTIVE — ต้องทำตาม docs/runbooks/csp-test-data-cleanup.md เท่านั้น:
--    1) export backup ก่อนเสมอ (mysqldump --default-character-set=utf8mb4)
--    2) รันเฉพาะ SELECT บล็อกแรก เอา output โชว์ owner ยืนยัน scope ก่อน
--    3) owner ถึงจะรัน DELETE (ผ่าน TiDB Cloud console)
--    4) รัน SELECT บล็อกสุดท้ายยืนยัน 0 แถว
--
-- หมายเหตุ audit_log: แถว history ของรายการที่ถูกลบจะถูกเก็บไว้โดยตั้งใจ
-- (audit trail ต้องอยู่รอด — 21-audit-log.sql) — การลบข้อมูลทดสอบไม่ลบ audit history
-- ============================================================================

-- ---------------------------------------------------------------------------
-- บล็อก 1 — SELECT ก่อนลบ: แสดงทุกแถวที่จะโดน (ต้องโชว์ owner ยืนยันก่อนเสมอ)
-- ---------------------------------------------------------------------------
SELECT personnel_id, first_name, last_name, is_active, created_at
FROM personnel
WHERE first_name LIKE 'ทดสอบCSP%'
   OR last_name LIKE 'ทดสอบCSP%'
ORDER BY personnel_id;

SELECT area_multiplier_id, province, district, basis_type, multiplier_ratio,
       effective_start_date, effective_end_date, is_active, created_at
FROM special_area_multiplier
WHERE province LIKE 'ทดสอบCSP-%'
ORDER BY area_multiplier_id;

-- ---------------------------------------------------------------------------
-- บล็อก 2 — DELETE (owner เท่านั้น หลังยืนยันผล SELECT)
-- ---------------------------------------------------------------------------
DELETE FROM personnel
WHERE first_name LIKE 'ทดสอบCSP%'
   OR last_name LIKE 'ทดสอบCSP%';

DELETE FROM special_area_multiplier
WHERE province LIKE 'ทดสอบCSP-%';

-- ---------------------------------------------------------------------------
-- บล็อก 3 — SELECT ยืนยันหลังลบ: ต้องได้ 0 แถวทั้งคู่
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS personnel_left
FROM personnel
WHERE first_name LIKE 'ทดสอบCSP%'
   OR last_name LIKE 'ทดสอบCSP%';

SELECT COUNT(*) AS areas_left
FROM special_area_multiplier
WHERE province LIKE 'ทดสอบCSP-%';

-- audit history ต้องอยู่รอดตาม design (ลบข้อมูล แต่ไม่ลบ trail) — ค่าจริงครั้ง 30 ส.ค. 2026 = 4
-- (audit_log ไม่มีคอลัมน์ action_detail — ค้นจาก before_value/after_value)
SELECT COUNT(*) AS audit_rows_csp
FROM audit_log
WHERE before_value LIKE '%ทดสอบCSP%'
   OR after_value LIKE '%ทดสอบCSP%';
