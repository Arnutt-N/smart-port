-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 14-multiplier-area-admin.sql
-- จัดการพื้นที่ทวีคูณ (master data admin) — audit column
--
-- เพิ่ม created_by ให้ special_area_multiplier ตาม pattern
-- multiplier_experience.created_by (บันทึกว่า user_id ไหนเป็นคนเพิ่ม master data)
--
-- Prod (TiDB Cloud) ต้อง apply มือ — Docker init รันเฉพาะ fresh volume
-- ============================================================================

ALTER TABLE special_area_multiplier ADD COLUMN created_by BIGINT NULL;
