-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 04-career-path.sql
-- Career Path Tables & Views for Smart Port
-- สำนักงานปลัดกระทรวงยุติธรรม
--
-- Converted from PostgreSQL: docs/gap_analysis_career_path_v2.sql
-- Contents:
--   11 career path tables
--   4 indexes
--   2 views (vw_job_series_tenure, vw_executive_tenure)
--
-- FK dependencies: 03-personnel-stubs.sql (personnel, organization, position,
--   users, lookup_value, personnel_order, personnel_position_history)
-- ============================================================================

-- ############################################################################
-- PART 1: MUST-HAVE TABLES (6 ตาราง)
-- ############################################################################

-- [G02,G03,G04,G18] เกณฑ์คุณสมบัติเลื่อนระดับ
-- อ้างอิง: PDF หน้า 6 (กรอบวางแผน) + หน้า 26-29 (อำนวยการ) + หน้า 31-82 (วิชาการ+ทั่วไป)
CREATE TABLE promotion_criteria (
    criteria_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    target_level_code VARCHAR(10) NOT NULL,        -- K2, K3, K4, K5, M1, M2, S1, S2, O2, O3
    target_level_name VARCHAR(100),
    source_level_code VARCHAR(10) NOT NULL,        -- ระดับต้นทาง
    source_level_name VARCHAR(100),
    min_years DECIMAL(4,1),                        -- จำนวนปีขั้นต่ำ (NULL = ไม่กำหนด)
    education_condition VARCHAR(20),               -- BACHELOR, MASTER, DOCTORATE, ANY
    career_track VARCHAR(20) DEFAULT 'ALL',        -- LAW, POLICY, ALL
    combination_group INT,                         -- กลุ่มรวม เช่น M1+K3=group 1
    combination_min_years DECIMAL(4,1),            -- ปีรวมของ combination
    requires_related_exp_years DECIMAL(4,1),       -- ปฏิบัติงานที่เกี่ยวข้อง >= N ปี
    requires_screening TINYINT(1) DEFAULT 0,       -- ต้องผ่านบัญชีกลั่นกรอง
    requires_equiv_years DECIMAL(4,1),             -- ต้องเทียบตำแหน่ง >= N ปี (K4->S1)
    is_lateral_transfer TINYINT(1) DEFAULT 0,      -- ย้ายระดับเดียวกัน (M2<->K4)
    description TEXT,
    legal_reference VARCHAR(500),                  -- อ้างอิง ก.พ. / ว.3 / ว.5 / ว.17
    is_active TINYINT(1) DEFAULT 1,
    effective_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- [G07] ประสบการณ์งานที่หลากหลาย (3 ต่าง) — ตรงกับชีท "นับต่าง"
-- อ้างอิง: PDF หน้า 26 + ประกาศ อ.ก.พ. กระทรวงยุติธรรม (4 ม.ค. 62)
CREATE TABLE diverse_experience (
    experience_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    from_job_series VARCHAR(200),
    from_work_group VARCHAR(200),
    from_division VARCHAR(200),
    from_org_id BIGINT,
    from_province VARCHAR(100),
    from_start_date DATE,
    from_end_date DATE,
    from_total_days INT,
    to_job_series VARCHAR(200),
    to_work_group VARCHAR(200),
    to_division VARCHAR(200),
    to_org_id BIGINT,
    to_province VARCHAR(100),
    to_start_date DATE,
    to_end_date DATE,
    to_total_days INT,
    is_diff_job_series TINYINT(1) DEFAULT 0,       -- ต่างสายงาน
    is_diff_org TINYINT(1) DEFAULT 0,              -- ต่างหน่วยงาน
    is_diff_location TINYINT(1) DEFAULT 0,         -- ต่างพื้นที่
    is_diff_work_nature TINYINT(1) DEFAULT 0,      -- ต่างลักษณะงาน
    diff_count INT DEFAULT 0,                      -- จำนวนต่าง (0-4)
    qualified_date DATE,                           -- วันที่ครบ 3 ต่าง
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (from_org_id) REFERENCES organization(org_id),
    FOREIGN KEY (to_org_id) REFERENCES organization(org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_diverse_exp_pid ON diverse_experience(personnel_id);

-- [G05] นับวันเกื้อกูล — ตรงกับชีท "นับเกื้อกูล"
-- คำนวณ: effective_days = total_days x ratio_percent / 100
CREATE TABLE supportive_experience (
    supportive_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    job_series_name VARCHAR(200),                  -- สายงานที่เกื้อกูล
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INT,
    ratio_percent DECIMAL(5,2) DEFAULT 100,        -- สัดส่วน 50-100%
    effective_days DECIMAL(10,2),                   -- = total_days x ratio / 100
    net_end_date DATE,
    net_years INT,
    net_months INT,
    net_day_remainder INT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- [G08] เทียบตำแหน่ง — ตรงกับชีท "เทียบ-ตน."
-- อ้างอิง: PDF หน้า 6 "K4->S1 ต้องเทียบอำนวยการ >= 2 ปี"
CREATE TABLE position_equivalence (
    equivalence_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    actual_position VARCHAR(300),                   -- ตำแหน่งจริง
    equivalent_type VARCHAR(100),                   -- เทียบเป็นประเภท เช่น อำนวยการ
    request_start_date DATE,
    request_end_date DATE,
    request_total_days INT,
    approved_start_date DATE,
    approved_end_date DATE,
    approved_total_days INT,
    approval_status VARCHAR(20) DEFAULT 'PENDING',
    approved_by BIGINT,
    approval_order_ref VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (approved_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- [G10] บัญชีกลั่นกรอง
-- อ้างอิง: PDF หน้า 26-27
CREATE TABLE screening_list (
    screening_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    screening_level VARCHAR(20) NOT NULL,           -- อ.ต้น, อ.สูง, บ.ต้น, บ.สูง
    screening_round VARCHAR(100),
    announcement_date DATE,
    announcement_ref VARCHAR(300),
    expiry_date DATE,
    is_active TINYINT(1) DEFAULT 1,
    status VARCHAR(20) DEFAULT 'ACTIVE',            -- ACTIVE, EXPIRED, USED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- [G14] ผลคำนวณคุณสมบัติ — แทนสูตร Excel ทุกชีท to-*
-- remaining_days < 0 = ถึงเกณฑ์นานแล้ว
-- remaining_days > 0 = ยังไม่ถึงเกณฑ์
-- status = Check Data -> ข้อมูลไม่ครบ ต้องตรวจสอบ
CREATE TABLE qualification_calculation (
    calc_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    target_level_code VARCHAR(10) NOT NULL,         -- K2,K3,K5-LAW,K5-POLICY,M1,M2,S1,S2
    calculation_date DATE NOT NULL DEFAULT (CURDATE()),
    deadline_date DATE,                             -- วันปิดรับสมัคร
    current_level_code VARCHAR(10),
    current_level_start DATE,
    current_tenure_days INT,
    prev_level_1_code VARCHAR(10),
    prev_level_1_start DATE,
    prev_level_1_days INT,
    prev_level_2_code VARCHAR(10),
    prev_level_2_start DATE,
    prev_level_2_days INT,
    education_level VARCHAR(20),                    -- BACHELOR, MASTER, DOCTORATE
    job_series_days INT,                            -- จำนวนวัน ใน ตน.ที่จะเลื่อน
    supportive_days INT DEFAULT 0,                  -- จำนวนวันเกื้อกูล
    total_qualifying_days INT,                      -- รวม ตน. + เกื้อกูล
    diverse_exp_date DATE,                          -- วันที่ครบ 3 ต่าง (M1)
    equivalence_days INT DEFAULT 0,                 -- วันเทียบตำแหน่ง (S1)
    has_screening TINYINT(1) DEFAULT 0,             -- ผ่านบัญชีกลั่นกรอง
    qualification_date DATE,                        -- วันที่มีคุณสมบัติ
    remaining_days INT,                             -- จำนวนวันเหลือ (ลบ=ถึงเกณฑ์)
    status VARCHAR(30),                             -- ถึงเกณฑ์นานแล้ว / ยังไม่ถึงเกณฑ์ / Check Data
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_qual_calc_pid ON qualification_calculation(personnel_id);
CREATE INDEX idx_qual_calc_target ON qualification_calculation(target_level_code);
CREATE INDEX idx_qual_calc_status ON qualification_calculation(status);

-- ############################################################################
-- PART 2: IMPORTANT TABLES (3 ตาราง)
-- ############################################################################

-- [G11] สายงานเกื้อกูลกัน (Mapping)
-- จาก PDF หน้า 32-82 ทุกสายงาน
CREATE TABLE supportive_job_series (
    mapping_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    primary_series_id BIGINT,
    primary_series_name VARCHAR(200) NOT NULL,
    supportive_series_id BIGINT,
    supportive_series_name VARCHAR(200) NOT NULL,
    mapping_type VARCHAR(50) DEFAULT 'SAME_GROUP',  -- SAME_GROUP, SPECIFIC, EXCLUSIVE
    is_active TINYINT(1) DEFAULT 1,
    effective_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (primary_series_id) REFERENCES lookup_value(value_id),
    FOREIGN KEY (supportive_series_id) REFERENCES lookup_value(value_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- [G12] หน่วยงานหมุนเวียน (Rotation)
-- จาก PDF หน้า 32-82 ทุกสายงาน
CREATE TABLE rotation_assignment (
    rotation_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    job_series_id BIGINT,
    job_series_name VARCHAR(200),
    rotation_org_id BIGINT,
    rotation_org_name VARCHAR(300),
    priority_order INT DEFAULT 0,
    min_duration_months INT,
    is_mandatory TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_series_id) REFERENCES lookup_value(value_id),
    FOREIGN KEY (rotation_org_id) REFERENCES organization(org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- [G13] ผลการประเมินเลื่อนระดับ
-- อ้างอิง: PDF หน้า 54 "ยึดหลักผลงาน หลักเงินเดือน หลักสมรรถนะ หลักอาวุโส"
CREATE TABLE promotion_evaluation (
    evaluation_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    target_level_code VARCHAR(10) NOT NULL,
    evaluation_round VARCHAR(100),
    application_date DATE,
    performance_score DECIMAL(5,2),                 -- หลักผลงาน
    salary_score DECIMAL(5,2),                      -- หลักเงินเดือน
    competency_score DECIMAL(5,2),                  -- หลักสมรรถนะ
    seniority_score DECIMAL(5,2),                   -- หลักอาวุโส
    total_score DECIMAL(5,2),
    academic_work_title VARCHAR(500),               -- ผลงานวิชาการ (K4,K5)
    academic_work_status VARCHAR(50),
    status VARCHAR(20) DEFAULT 'PENDING',
    committee_decision TEXT,
    approved_date DATE,
    order_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (order_id) REFERENCES personnel_order(order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ############################################################################
-- PART 3: OPTIONAL TABLES (2 ตาราง)
-- ############################################################################

-- [G15] หลักสูตรจำเป็นสำหรับเลื่อนระดับ
-- PDF หน้า 54: นักบริหารระดับต้น/กลาง/สูง หรือเทียบเท่า
CREATE TABLE promotion_required_training (
    requirement_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    target_level_code VARCHAR(10) NOT NULL,
    course_id BIGINT,
    course_name VARCHAR(300),
    course_category VARCHAR(100),
    is_mandatory TINYINT(1) DEFAULT 1,
    allow_equivalent TINYINT(1) DEFAULT 1,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES training_course(course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- [G16] ใบอนุญาตประกอบวิชาชีพ
-- PDF หน้า 57-65: วิศวกรโยธา/ไฟฟ้า, สถาปนิก ต้องมีใบอนุญาต
CREATE TABLE professional_license (
    license_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    license_type_id BIGINT,
    license_name VARCHAR(300),
    license_number VARCHAR(100),
    issuing_body VARCHAR(300),
    issue_date DATE,
    expiry_date DATE,
    license_level VARCHAR(100),
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (license_type_id) REFERENCES lookup_value(value_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ############################################################################
-- PART 4: VIEWS (แทนตาราง — ลดความซ้ำซ้อน)
-- ############################################################################

-- [G06] นับวันในสายงานที่จะเลื่อน — VIEW จาก position_history
-- ตรงกับชีท "นับวันใน-ตน." ใน Excel
-- ใช้ร่วมกับ supportive_experience เพื่อคำนวณ: ตน. + เกื้อกูล
DROP VIEW IF EXISTS vw_job_series_tenure;
CREATE VIEW vw_job_series_tenure AS
SELECT
    pph.personnel_id,
    COALESCE(pph.job_series_name, p_pos.position_name) AS target_job_series,
    pph.effective_date AS tenure_start_date,
    COALESCE(pph.end_date, CURDATE()) AS tenure_end_date,
    DATEDIFF(COALESCE(pph.end_date, CURDATE()), pph.effective_date) AS total_days,
    CASE WHEN pph.end_date IS NULL THEN 1 ELSE 0 END AS is_current
FROM personnel_position_history pph
LEFT JOIN position p_pos ON pph.position_id = p_pos.position_id;

-- [G09] นับวันดำรง อำนวยการ/บริหาร — VIEW จาก position_history
-- ตรงกับชีท "นับวันใน-อต-อส" ใน Excel
-- ใช้ใน: to-M2, to-S1, to-S2
DROP VIEW IF EXISTS vw_executive_tenure;
CREATE VIEW vw_executive_tenure AS
SELECT
    pph.personnel_id,
    COALESCE(pph.job_series_name, p_pos.position_name) AS position_name,
    pph.position_level,
    pph.effective_date AS start_date,
    COALESCE(pph.end_date, CURDATE()) AS end_date,
    DATEDIFF(COALESCE(pph.end_date, CURDATE()), pph.effective_date) AS total_days,
    CASE WHEN pph.end_date IS NULL THEN 1 ELSE 0 END AS is_current
FROM personnel_position_history pph
LEFT JOIN position p_pos ON pph.position_id = p_pos.position_id
WHERE pph.position_level IN ('M1','M2','S1','S2');
