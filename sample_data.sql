-- เพิ่มข้อมูลตัวอย่างสำหรับการทดสอบ
USE civil_service_mgmt;

-- เพิ่มคำนำหน้าชื่อ
INSERT IGNORE INTO prefixes (prefix_code, prefix_name_th, prefix_name_en, gender) VALUES
('MR', 'นาย', 'Mr.', 'M'),
('MRS', 'นาง', 'Mrs.', 'F'),
('MISS', 'นางสาว', 'Miss', 'F'),
('DR', 'ดร.', 'Dr.', 'A'),
('PROF', 'ศ.', 'Prof.', 'A');

-- เพิ่มข้าราชการตัวอย่าง
INSERT IGNORE INTO civil_servants (servant_id, employee_id, citizen_id, prefix_id, first_name, last_name, birth_date, appointment_date, retirement_date, servant_status) VALUES
(1, 'CS001', '1234567890123', 1, 'สมชาย', 'ใจดี', '1980-01-15', '2005-03-01', '2040-01-15', 'active'),
(2, 'CS002', '1234567890124', 2, 'สมศรี', 'ใสใจ', '1975-05-20', '2000-07-15', '2035-05-20', 'active'),
(3, 'CS003', '1234567890125', 3, 'สุภาพร', 'มีใจ', '1985-08-10', '2010-01-01', '2045-08-10', 'active'),
(4, 'CS004', '1234567890126', 1, 'วิชาญ', 'เก่งกิจ', '1978-12-03', '2003-04-01', '2038-12-03', 'active'),
(5, 'CS005', '1234567890127', 4, 'ประภาส', 'สว่างใส', '1970-02-28', '1995-06-01', '2030-02-28', 'active'),
(6, 'CS006', '1234567890128', 1, 'กิตติ', 'ศิลป์ชัย', '1982-11-12', '2007-09-01', '2042-11-12', 'active'),
(7, 'CS007', '1234567890129', 2, 'วิมล', 'รักเรียน', '1973-06-25', '1998-02-15', '2033-06-25', 'active'),
(8, 'CS008', '1234567890130', 3, 'นิภา', 'ประดับศรี', '1987-04-18', '2012-08-01', '2047-04-18', 'active'),
(9, 'CS009', '1234567890131', 1, 'รัชพล', 'มั่นคง', '1981-09-07', '2006-11-01', '2041-09-07', 'active'),
(10, 'CS010', '1234567890132', 2, 'อุไรวรรณ', 'งามวงศ์', '1976-03-14', '2001-05-01', '2036-03-14', 'active');

-- เพิ่มองค์กรตัวอย่าง
INSERT IGNORE INTO legal_organizations (organization_id, organization_code, organization_name, parent_organization_id, organization_level) VALUES
(1, 'MIN001', 'กระทรวงการคลัง', NULL, 1),
(2, 'DEP001', 'กรมบัญชีกลาง', 1, 2),
(3, 'DEP002', 'กรมสรรพากร', 1, 2),
(4, 'DIV001', 'กองการเงิน', 2, 3),
(5, 'DIV002', 'กองบุคคล', 2, 3);

-- เพิ่มตำแหน่งตัวอย่าง
INSERT IGNORE INTO positions (position_id, position_code, position_name, position_level, is_active) VALUES
(1, 'P001', 'เลขานุการ', 3, 1),
(2, 'P002', 'นักวิชาการเงินและบัญชี', 4, 1),
(3, 'P003', 'หัวหน้าหน่วยงาน', 6, 1),
(4, 'P004', 'ผู้อำนวยการ', 8, 1),
(5, 'P005', 'ผู้เชี่ยวชาญ', 9, 1);

-- เพิ่มประวัติตำแหน่งปัจจุบัน
INSERT IGNORE INTO position_history (history_id, servant_id, position_id, organization_id, start_date, end_date) VALUES
(1, 1, 2, 4, '2005-03-01', NULL),
(2, 2, 3, 5, '2000-07-15', NULL),
(3, 3, 1, 4, '2010-01-01', NULL),
(4, 4, 4, 2, '2003-04-01', NULL),
(5, 5, 5, 3, '1995-06-01', NULL),
(6, 6, 2, 4, '2007-09-01', NULL),
(7, 7, 3, 5, '1998-02-15', NULL),
(8, 8, 1, 4, '2012-08-01', NULL),
(9, 9, 2, 2, '2006-11-01', NULL),
(10, 10, 3, 3, '2001-05-01', NULL);

-- เพิ่มการแจ้งเตือนตัวอย่าง
INSERT IGNORE INTO advance_notifications (notification_id, servant_id, notification_type, title, message, due_date, priority, status) VALUES
(1, 5, 'retirement_upcoming', 'เกษียณอายุราชการในอีก 5 ปี', 'นาย ประภาส สว่างใส จะเกษียณอายุราชการในวันที่ 28 กุมภาพันธ์ 2573', '2030-02-28', 'medium', 'pending'),
(2, 7, 'retirement_upcoming', 'เกษียณอายุราชการในอีก 8 ปี', 'นาง วิมล รักเรียน จะเกษียณอายุราชการในวันที่ 25 มิถุนายน 2576', '2033-06-25', 'low', 'pending'),
(3, 1, 'promotion_eligible', 'มีสิทธิ์เลื่อนตำแหน่ง', 'นาย สมชาย ใจดี มีคุณสมบัติเหมาะสมสำหรับการเลื่อนตำแหน่ง', '2025-12-31', 'high', 'pending');

-- เพิ่มข้อเสนอผลงานตัวอย่าง
INSERT IGNORE INTO performance_proposals (proposal_id, servant_id, proposal_type, title, description, submission_date, status, impact_assessment) VALUES
(1, 1, 'efficiency', 'ระบบจัดการเอกสารอิเล็กทรอนิกส์', 'เสนอการพัฒนาระบบจัดการเอกสารแบบดิจิทัลเพื่อลดการใช้กระดาษ', '2024-12-01', 'under_review', 'ลดต้นทุนการพิมพ์ 30%'),
(2, 4, 'innovation', 'แอปพลิเคชันตรวจสอบสถานะงาน', 'พัฒนาแอพมือถือสำหรับติดตามสถานะการดำเนินงาน', '2024-11-15', 'approved', 'เพิ่มประสิทธิภาพการทำงาน 25%'),
(3, 6, 'cost_saving', 'โครงการประหยัดพลังงาน', 'ติดตั้งระบบโซลาร์เซลล์และหลอดไฟ LED', '2024-10-20', 'implemented', 'ประหยัดค่าไฟฟ้า 40%');
