SET NAMES utf8mb4;
-- ============================================================================
-- 07-add-education-level.sql
-- Add education_level column to personnel table
-- สำนักงานปลัดกระทรวงยุติธรรม
--
-- Dependencies: 03-personnel-stubs.sql (personnel table must exist)
--               06-seed-data.sql (personnel records must exist)
-- ============================================================================

-- เพิ่มคอลัมน์ระดับการศึกษา (ค่าเริ่มต้น BACHELOR)
ALTER TABLE personnel ADD COLUMN education_level VARCHAR(30) DEFAULT 'BACHELOR';

-- ############################################################################
-- UPDATE SAMPLE PERSONNEL WITH VARIED EDUCATION LEVELS FOR TESTING
-- กำหนดระดับการศึกษาให้บุคลากรตัวอย่าง
-- ############################################################################

-- personnel_id 1: สมชาย รักดี (K1) — ปริญญาตรี
UPDATE personnel SET education_level = 'BACHELOR' WHERE personnel_id = 1;

-- personnel_id 2: สมหญิง ใจดี (K2) — ปริญญาโท
UPDATE personnel SET education_level = 'MASTER' WHERE personnel_id = 2;

-- personnel_id 3: วิชัย สุขสันต์ (K3) — ปริญญาตรี
UPDATE personnel SET education_level = 'BACHELOR' WHERE personnel_id = 3;

-- personnel_id 4: พรทิพย์ มั่นคง (O1) — ปวส.
UPDATE personnel SET education_level = 'HIGH_VOCATIONAL' WHERE personnel_id = 4;

-- personnel_id 5: อนุชา วงศ์ดี (O2) — ปวช.
UPDATE personnel SET education_level = 'VOCATIONAL_CERT' WHERE personnel_id = 5;

-- personnel_id 6: กัญญา แก้วใส (K1) — ปริญญาเอก
UPDATE personnel SET education_level = 'DOCTORATE' WHERE personnel_id = 6;

-- personnel_id 7: ธนพล เจริญรุ่ง (K1) — ปริญญาโท
UPDATE personnel SET education_level = 'MASTER' WHERE personnel_id = 7;
