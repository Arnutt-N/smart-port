-- ============================================================================
-- 06-seed-data.sql
-- Seed Data for Smart Port Career Path Features
-- สำนักงานปลัดกระทรวงยุติธรรม
--
-- Contents:
--   Section 1: Stub data for FK satisfaction (organization, position)
--   Section 2: Promotion criteria seed data (K-series + O-series)
--   Section 3: Sample personnel records
--   Section 4: Sample personnel_position_history for view verification
--
-- Dependencies: 03-personnel-stubs.sql, 04-career-path.sql
-- ============================================================================

-- ############################################################################
-- SECTION 1: STUB DATA FOR FK SATISFACTION
-- ข้อมูลหน่วยงานและตำแหน่งตัวอย่าง
-- ############################################################################

INSERT INTO organization (org_name, org_code) VALUES ('สำนักงานปลัดกระทรวงยุติธรรม', 'MOJ-OPS');
INSERT INTO position (position_name, position_code) VALUES ('นักทรัพยากรบุคคล', 'HR-001');

-- ############################################################################
-- SECTION 2: PROMOTION CRITERIA SEED DATA (per D-09, D-10, D-11)
-- เกณฑ์คุณสมบัติเลื่อนระดับ
-- ############################################################################

-- K-series: ประเภทวิชาการ (HIGH confidence -- from SQL comments in gap_analysis_career_path_v2.sql)
-- อ้างอิง: นร 1006/ว3 (22 ก.พ. 67)
INSERT INTO promotion_criteria (target_level_code, target_level_name, source_level_code, source_level_name, min_years, education_condition, career_track, is_active, effective_date) VALUES
('K2', 'ชำนาญการ', 'K1', 'ปฏิบัติการ', 6.0, 'BACHELOR', 'ALL', 1, '2024-03-22'),
('K2', 'ชำนาญการ', 'K1', 'ปฏิบัติการ', 4.0, 'MASTER', 'ALL', 1, '2024-03-22'),
('K2', 'ชำนาญการ', 'K1', 'ปฏิบัติการ', 2.0, 'DOCTORATE', 'ALL', 1, '2024-03-22'),
('K3', 'ชำนาญการพิเศษ', 'K2', 'ชำนาญการ', 4.0, 'ANY', 'ALL', 1, '2024-03-22'),
('K4', 'เชี่ยวชาญ', 'K3', 'ชำนาญการพิเศษ', 3.0, 'ANY', 'ALL', 1, '2024-03-22');

-- O-series: ประเภททั่วไป (MEDIUM confidence -- verify against ops-carrer-path.pdf pages 31-82)
-- อ้างอิง: หลักเกณฑ์ ก.พ. สำหรับประเภททั่วไป
INSERT INTO promotion_criteria (target_level_code, target_level_name, source_level_code, source_level_name, min_years, education_condition, career_track, is_active, effective_date) VALUES
('O2', 'ชำนาญงาน', 'O1', 'ปฏิบัติงาน', 6.0, 'VOCATIONAL_CERT', 'ALL', 1, '2024-03-22'),
('O2', 'ชำนาญงาน', 'O1', 'ปฏิบัติงาน', 5.0, 'HIGH_VOCATIONAL', 'ALL', 1, '2024-03-22'),
('O3', 'อาวุโส', 'O2', 'ชำนาญงาน', 6.0, 'ANY', 'ALL', 1, '2024-03-22');

-- ############################################################################
-- SECTION 3: SAMPLE PERSONNEL RECORDS (per D-12)
-- บุคลากรตัวอย่าง — ระดับและวันที่เข้าสู่ระดับหลากหลาย
-- ############################################################################

INSERT INTO personnel (citizen_id, first_name, last_name, hire_date, current_position_id, current_org_id, current_level_start_date, current_level_code, is_active) VALUES
('1100100100001', 'สมชาย', 'รักดี', '2018-04-01', 1, 1, '2020-06-01', 'K1', 1),
('1100100100002', 'สมหญิง', 'ใจดี', '2015-10-01', 1, 1, '2019-03-15', 'K2', 1),
('1100100100003', 'วิชัย', 'สุขสันต์', '2010-04-01', 1, 1, '2018-10-01', 'K3', 1),
('1100100100004', 'พรทิพย์', 'มั่นคง', '2019-06-01', 1, 1, '2021-04-01', 'O1', 1),
('1100100100005', 'อนุชา', 'วงศ์ดี', '2014-10-01', 1, 1, '2020-01-15', 'O2', 1),
('1100100100006', 'กัญญา', 'แก้วใส', '2025-10-01', 1, 1, '2025-10-01', 'K1', 1),
('1100100100007', 'ธนพล', 'เจริญรุ่ง', '2022-04-01', 1, 1, '2022-04-01', 'K1', 1);

-- ############################################################################
-- SECTION 4: SAMPLE PERSONNEL_POSITION_HISTORY (per D-12)
-- ประวัติการดำรงตำแหน่ง — สำหรับตรวจสอบ views (end_date = NULL = ตำแหน่งปัจจุบัน)
-- ############################################################################

INSERT INTO personnel_position_history (personnel_id, position_id, org_id, position_name, position_level, effective_date, end_date, job_series_name) VALUES
(1, 1, 1, 'นักทรัพยากรบุคคล', 'K1', '2020-06-01', NULL, 'นักทรัพยากรบุคคล'),
(2, 1, 1, 'นักทรัพยากรบุคคล', 'K2', '2019-03-15', NULL, 'นักทรัพยากรบุคคล'),
(3, 1, 1, 'นักทรัพยากรบุคคล', 'K3', '2018-10-01', NULL, 'นักทรัพยากรบุคคล'),
(4, 1, 1, 'เจ้าพนักงานธุรการ', 'O1', '2021-04-01', NULL, 'เจ้าพนักงานธุรการ'),
(5, 1, 1, 'เจ้าพนักงานธุรการ', 'O2', '2020-01-15', NULL, 'เจ้าพนักงานธุรการ');

-- ############################################################################
-- SECTION 5: SAMPLE PROBATION PROGRAM (per D-13)
-- โปรแกรมทดลองปฏิบัติราชการตัวอย่าง
-- ############################################################################

INSERT INTO probation_program (program_name, program_year, duration_months, description, is_active) VALUES
('โปรแกรมทดลองปฏิบัติราชการ ปี 2569', 2569, 6, 'โปรแกรมมาตรฐานสำหรับข้าราชการบรรจุใหม่', 1);

-- ############################################################################
-- SECTION 6: SAMPLE PROBATION ENROLLMENTS (per D-13)
-- ข้อมูลลงทะเบียนทดลองปฏิบัติราชการตัวอย่าง — remaining_days หลากหลาย
-- ############################################################################

-- Enrollment 1: >30 days remaining (green threshold)
INSERT INTO probation_enrollment (personnel_id, program_id, start_date, end_date, overall_status) VALUES
(6, 1, '2025-10-01', '2026-07-01', 'IN_PROGRESS');

-- Enrollment 2: 7-14 days remaining (orange threshold) -- adjust date relative to ~2026-03-22
INSERT INTO probation_enrollment (personnel_id, program_id, start_date, end_date, overall_status) VALUES
(7, 1, '2025-10-01', '2026-04-01', 'IN_PROGRESS');

-- Enrollment 3: past end_date (red/negative remaining_days)
INSERT INTO probation_enrollment (personnel_id, program_id, start_date, end_date, overall_status) VALUES
(1, 1, '2025-06-01', '2025-12-01', 'IN_PROGRESS');
