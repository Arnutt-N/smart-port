-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

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

-- ############################################################################
-- SECTION 7: EXECUTIVE TRACK CRITERIA (อำนวยการ M1/M2 + บริหาร S1/S2)
-- reference config — คำนวณจริงอยู่ใน QualificationEngine::buildExecutiveQuery (multi-path)
-- เกณฑ์ pin จาก Excel master-prep (ชีท to-M1/M2/S1/S2) — ดู research/executive-track-criteria.md
-- หมายเหตุ: ตัวเลขที่นี่ต้องตรงกับ constant ใน buildExecutiveQuery (review คู่กัน)
-- ############################################################################

INSERT INTO promotion_criteria
  (target_level_code, target_level_name, source_level_code, source_level_name, min_years,
   education_condition, career_track, combination_group, combination_min_years,
   requires_equiv_years, requires_screening, description, legal_reference, is_active, effective_date)
VALUES
-- M1 อำนวยการต้น (ต้องผ่าน 3 ต่าง; วันมีคุณสมบัติ = MAX(วันดำรงครบ, วันครบ3ต่าง))
('M1', 'อำนวยการ ต้น', 'K3', 'ชำนาญการพิเศษ', 3.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'ดำรง K3 ครบ 3 ปี + ผ่าน 3 ต่าง', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('M1', 'อำนวยการ ต้น', 'O3', 'อาวุโส', 6.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'ดำรง O3 ครบ 6 ปี + ผ่าน 3 ต่าง', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
-- M2 อำนวยการสูง (multi-path เลือกวันเร็วสุด)
('M2', 'อำนวยการ สูง', 'M1', 'อำนวยการ ต้น', 1.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'ดำรง M1 ครบ 1 ปี', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('M2', 'อำนวยการ สูง', 'K3', 'ชำนาญการพิเศษ', 4.0, 'ANY', 'ALL', 1, 4.0, NULL, 0, 'M1+K3 รวม 4 ปี (combination นับจากวันเข้า K3) หรือ K3 ครบ 4 ปี', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('M2', 'อำนวยการ สูง', 'O3', 'อาวุโส', 7.0, 'ANY', 'ALL', 2, 7.0, NULL, 0, 'M1+O3 รวม 7 ปี (combination) หรือ O3 ครบ 7 ปี', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('M2', 'อำนวยการ สูง', 'K4', 'เชี่ยวชาญ', 0.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'K4 + ผ่าน 3 ต่าง (lateral)', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
-- S1 บริหารต้น (ดำรง 2 ปี; K4 ต้องมีเทียบตำแหน่งอำนวยการ)
('S1', 'บริหาร ต้น', 'M1', 'อำนวยการ ต้น', 2.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'ดำรง M1 ครบ 2 ปี', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('S1', 'บริหาร ต้น', 'M2', 'อำนวยการ สูง', 2.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'ดำรง M2 ครบ 2 ปี', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('S1', 'บริหาร ต้น', 'K4', 'เชี่ยวชาญ', 2.0, 'ANY', 'ALL', NULL, NULL, 2.0, 0, 'ดำรง K4 ครบ 2 ปี + เทียบตำแหน่งอำนวยการ', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
-- S2 บริหารสูง (combination เทียบตำแหน่ง = follow-up รอ verify Excel)
('S2', 'บริหาร สูง', 'S1', 'บริหาร ต้น', 1.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'ดำรง S1 ครบ 1 ปี', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22');

-- ############################################################################
-- SECTION 8: SAMPLE EXECUTIVE PERSONNEL (เฉพาะ local/Docker — ไม่อยู่ใน tidb-init prod)
-- ครอบคลุม golden case จาก Excel เพื่อ verify buildExecutiveQuery
-- personnel_id 101-107 (explicit เพื่อให้ FK ของ history/diverse/equivalence อ้างได้แน่นอน)
-- ############################################################################

INSERT INTO personnel (personnel_id, citizen_id, first_name, last_name, hire_date, current_position_id, current_org_id, current_level_start_date, current_level_code, is_active) VALUES
(101, '1100100200101', 'ทดสอบ K3', 'สู่อำนวยการต้น', '2015-01-01', 1, 1, '2020-08-26', 'K3', 1),  -- M1 = MAX(2023-08-26, 3ต่าง 2018-01-01) = 2023-08-26
(102, '1100100200102', 'ทดสอบ O3', 'สู่อำนวยการต้น', '2010-01-01', 1, 1, '2018-03-28', 'O3', 1),  -- M1 = 2024-03-28
(103, '1100100200103', 'ทดสอบ M1', 'สู่บริหารต้น',   '2012-01-01', 1, 1, '2020-08-26', 'M1', 1),  -- S1 = 2022-08-26 ; M2 = 2021-08-26
(104, '1100100200104', 'ทดสอบ K3', 'ขาด3ต่าง',       '2016-01-01', 1, 1, '2021-01-01', 'K3', 1),  -- M1 = check_data (ไม่มี 3ต่าง)
(105, '1100100200105', 'ทดสอบ M1', 'combination',     '2011-01-01', 1, 1, '2023-01-01', 'M1', 1),  -- M2 = MIN(M1+1=2024-01-01, K3start+4=2023-06-01) = 2023-06-01
(106, '1100100200106', 'ทดสอบ K4', 'เทียบตำแหน่ง',   '2009-01-01', 1, 1, '2022-01-01', 'K4', 1),  -- S1 = 2024-01-01 (มีเทียบ)
(107, '1100100200107', 'ทดสอบ S1', 'สู่บริหารสูง',   '2008-01-01', 1, 1, '2024-01-01', 'S1', 1);  -- S2 = 2025-01-01

-- prev-level สำหรับ 105 (M2 combination M1+K3): เข้า K3 เมื่อ 2019-06-01 → K3+4 = 2023-06-01
INSERT INTO personnel_position_history (personnel_id, position_id, org_id, position_name, position_level, effective_date, end_date, job_series_name) VALUES
(105, 1, 1, 'นักทรัพยากรบุคคล', 'K3', '2019-06-01', '2022-12-31', 'นักทรัพยากรบุคคล'),
(105, 1, 1, 'ผู้อำนวยการกอง',   'M1', '2023-01-01', NULL,         'อำนวยการ');

-- 3 ต่าง (diff_count = sum flags ผ่าน GENERATED ใน 08; ตั้ง 3 flags = ครบ 3 ต่าง) — 101,102 ผ่าน
INSERT INTO diverse_experience (personnel_id, is_diff_job_series, is_diff_org, is_diff_location, is_diff_work_nature, qualified_date) VALUES
(101, 1, 1, 1, 0, '2018-01-01'),
(102, 1, 1, 1, 0, '2017-01-01');

-- เทียบตำแหน่งอำนวยการ (อนุมัติ) — 106 สำหรับ S1(K4)
INSERT INTO position_equivalence (personnel_id, actual_position, equivalent_type, approved_start_date, approved_end_date, approved_total_days, approval_status) VALUES
(106, 'ผู้เชี่ยวชาญ', 'อำนวยการ', '2022-01-01', '2024-01-01', 730, 'APPROVED');

-- ############################################################################
-- SECTION 9: S2 COMBINATION + M2 K4 FIXTURES (เฉพาะ local/Docker — ไม่อยู่ใน prod)
-- golden cases สำหรับ buildExecutiveQuery S2 (4 paths) + M2 K4 verify
-- backdate (Excel): วันคุณสมบัติ = GREATEST(start − Σวันหักลบ + 3ปี, start+1วัน)
-- ############################################################################

INSERT INTO personnel (personnel_id, citizen_id, first_name, last_name, hire_date, current_position_id, current_org_id, current_level_start_date, current_level_code, is_active) VALUES
(108, '1100100200108', 'ทดสอบ S1', 'บส-ไม่มีเทียบ', '2010-01-01', 1, 1, '2022-01-01', 'S1', 1),  -- S2 = W3 (S1+1) = 2023-01-01
(109, '1100100200109', 'ทดสอบ S1', 'บส-เทียบ',      '2008-01-01', 1, 1, '2020-06-01', 'S1', 1),  -- S2 = AC3 (บต+เทียบ 900ว) = 2020-12-14
(110, '1100100200110', 'ทดสอบ K5', 'บส-ทว-เทียบ',   '2005-01-01', 1, 1, '2021-01-01', 'K5', 1),  -- S2 = AK3 (ทว+อต/อส 300ว+เทียบ 400ว) = 2022-02-01
(111, '1100100200111', 'ทดสอบ K4', 'สู่อำนวยการสูง', '2009-01-01', 1, 1, '2021-01-01', 'K4', 1);  -- M2 = K4+3ต่าง = MAX(2021-01-01, 2023-06-01) = 2023-06-01

-- เทียบตำแหน่ง (S2): 109 = 900 วัน, 110 = 400 วัน (approved_total_days ใช้คำนวณตรง)
INSERT INTO position_equivalence (personnel_id, actual_position, equivalent_type, approved_start_date, approved_end_date, approved_total_days, approval_status) VALUES
(109, 'ผู้เชี่ยวชาญ',   'อำนวยการ', '2018-01-01', '2020-06-19', 900, 'APPROVED'),
(110, 'ผู้ทรงคุณวุฒิ', 'อำนวยการ', '2019-01-01', '2020-02-05', 400, 'APPROVED');

-- prev M1/M2 history สำหรับ 110 (ms_days = DATEDIFF(2018-10-28, 2018-01-01) = 300)
INSERT INTO personnel_position_history (personnel_id, position_id, org_id, position_name, position_level, effective_date, end_date, job_series_name) VALUES
(110, 1, 1, 'ผู้อำนวยการสูง', 'M2', '2018-01-01', '2018-10-28', 'อำนวยการ');

-- 3 ต่าง สำหรับ 111 (M2 K4 path) — qualified_date 2023-06-01 > K4 start → MAX = 2023-06-01
INSERT INTO diverse_experience (personnel_id, is_diff_job_series, is_diff_org, is_diff_location, is_diff_work_nature, qualified_date) VALUES
(111, 1, 1, 1, 0, '2023-06-01');
