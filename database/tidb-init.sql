-- Smart Port: Combined Schema for TiDB Cloud / MySQL 8 (rebuild ทั้งระบบจากไฟล์เดียว)
-- Layers: 01 core (civil_servants), 02 photo/extra, 03 personnel stubs,
--         04 career path, 05 probation, 06 seed, 07 education, 08 v11, 09 auth
-- Import: mysql --default-character-set=utf8mb4 <db_name> < tidb-init.sql
-- TiDB: ไม่ใช้ ENUM/TRIGGER/DEFINER (ENUM ต้นฉบับแปลงเป็น VARCHAR แล้ว validate ฝั่ง PHP)

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- FILE: 01-schema.sql (mysql_database_design.sql)
-- ============================================
-- ENUM ต้นฉบับแปลงเป็น VARCHAR ตาม convention TiDB (เหมือน 09-auth-users.sql)
-- ไม่มี CREATE DATABASE/USE — ระบุชื่อ database ตอน import

-- Core lookup table for name prefixes.
CREATE TABLE prefixes (
    prefix_id INT PRIMARY KEY AUTO_INCREMENT,
    prefix_code VARCHAR(10) UNIQUE NOT NULL,
    prefix_name_th VARCHAR(50) NOT NULL,
    prefix_name_en VARCHAR(50),
    prefix_short VARCHAR(20),
    gender VARCHAR(5) DEFAULT 'A',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Core civil servant profile table.
CREATE TABLE civil_servants (
    servant_id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id VARCHAR(20) UNIQUE NOT NULL,
    citizen_id VARCHAR(13) UNIQUE NOT NULL,
    prefix_id INT,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birth_date DATE NOT NULL,
    appointment_date DATE NOT NULL,
    retirement_date DATE,
    servant_status VARCHAR(20) DEFAULT 'active',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (prefix_id) REFERENCES prefixes(prefix_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uploaded photo records for each civil servant.
CREATE TABLE civil_servant_photos (
    photo_id INT PRIMARY KEY AUTO_INCREMENT,
    servant_id INT NOT NULL,
    photo_type VARCHAR(20) NOT NULL DEFAULT 'profile',
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    photo_status VARCHAR(30) DEFAULT 'pending_approval',
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    FOREIGN KEY (servant_id) REFERENCES civil_servants(servant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- เวอร์ชันภาพ — schema simple ตาม backend/helpers.php ที่ INSERT แค่
-- (photo_id, version_type, file_name) จึงไม่ใช้เวอร์ชัน rich ของ layer 02
CREATE TABLE photo_versions (
    version_id INT PRIMARY KEY AUTO_INCREMENT,
    photo_id INT NOT NULL,
    version_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (photo_id) REFERENCES civil_servant_photos(photo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Current profile view.
CREATE VIEW v_civil_servants_current AS
SELECT
    cs.servant_id,
    CONCAT(p.prefix_name_th, cs.first_name, ' ', cs.last_name) AS full_name,
    csp.file_path AS photo_path
FROM civil_servants cs
LEFT JOIN prefixes p ON cs.prefix_id = p.prefix_id
LEFT JOIN civil_servant_photos csp
    ON cs.servant_id = csp.servant_id
    AND csp.is_primary = TRUE;

-- Sample data for a clean bootstrap.
INSERT INTO prefixes (prefix_code, prefix_name_th) VALUES ('MR', 'นาย');
INSERT INTO civil_servants (
    employee_id,
    citizen_id,
    prefix_id,
    first_name,
    last_name,
    birth_date,
    appointment_date
) VALUES (
    'EMP001',
    '1234567890123',
    1,
    'สมชาย',
    'ไทยแท้',
    '1980-01-01',
    '2000-01-01'
);

-- ============================================
-- FILE: 02-data.sql (photo_management_system.sql)
-- ============================================

-- ตาราง advance_notifications (การแจ้งเตือนล่วงหน้า)
CREATE TABLE advance_notifications (
    notification_id INT PRIMARY KEY AUTO_INCREMENT,
    servant_id INT NOT NULL,
    notification_type VARCHAR(30) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    due_date DATE,
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP NULL,
    read_at TIMESTAMP NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    FOREIGN KEY (servant_id) REFERENCES civil_servants(servant_id),
    INDEX idx_servant_type (servant_id, notification_type),
    INDEX idx_due_date (due_date),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตาราง performance_proposals (ผลงานและข้อเสนอ)
CREATE TABLE performance_proposals (
    proposal_id INT PRIMARY KEY AUTO_INCREMENT,
    servant_id INT NOT NULL,
    proposal_type VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    impact_description TEXT,
    quantitative_result DECIMAL(15,2),
    result_unit VARCHAR(50),
    submission_date DATE NOT NULL,
    evaluation_score DECIMAL(3,2), -- 0.00 - 5.00
    evaluator_id INT,
    evaluation_date DATE,
    status VARCHAR(20) DEFAULT 'draft',
    approval_level VARCHAR(20) DEFAULT 'department',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (servant_id) REFERENCES civil_servants(servant_id),
    FOREIGN KEY (evaluator_id) REFERENCES civil_servants(servant_id),
    INDEX idx_servant_type (servant_id, proposal_type),
    INDEX idx_status (status),
    INDEX idx_submission_date (submission_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตาราง task_assignments (การจัดการงาน)
CREATE TABLE task_assignments (
    task_id INT PRIMARY KEY AUTO_INCREMENT,
    assignee_id INT NOT NULL,
    assigner_id INT,
    task_title VARCHAR(255) NOT NULL,
    task_description TEXT,
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'pending',
    assigned_date DATE NOT NULL,
    due_date DATE,
    completion_date DATE,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    completion_percentage TINYINT DEFAULT 0,
    notes TEXT,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assignee_id) REFERENCES civil_servants(servant_id),
    FOREIGN KEY (assigner_id) REFERENCES civil_servants(servant_id),
    INDEX idx_assignee_status (assignee_id, status),
    INDEX idx_due_date (due_date),
    INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตาราง ml_predictions (การคาดการณ์ AI)
CREATE TABLE ml_predictions (
    prediction_id INT PRIMARY KEY AUTO_INCREMENT,
    servant_id INT NOT NULL,
    prediction_type VARCHAR(30) NOT NULL,
    prediction_data JSON,
    confidence_score DECIMAL(3,2), -- 0.00 - 1.00
    prediction_date DATE NOT NULL,
    valid_until DATE,
    model_version VARCHAR(50),
    accuracy_score DECIMAL(3,2),
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (servant_id) REFERENCES civil_servants(servant_id),
    INDEX idx_servant_type (servant_id, prediction_type),
    INDEX idx_prediction_date (prediction_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตาราง career_paths (เส้นทางความก้าวหน้า)
CREATE TABLE career_paths (
    path_id INT PRIMARY KEY AUTO_INCREMENT,
    servant_id INT NOT NULL,
    current_position VARCHAR(255),
    target_position VARCHAR(255),
    estimated_timeline_months INT,
    required_skills TEXT,
    required_training TEXT,
    probability_score DECIMAL(3,2),
    path_status VARCHAR(20) DEFAULT 'active',
    created_by INT,
    approved_by INT,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (servant_id) REFERENCES civil_servants(servant_id),
    FOREIGN KEY (created_by) REFERENCES civil_servants(servant_id),
    FOREIGN KEY (approved_by) REFERENCES civil_servants(servant_id),
    INDEX idx_servant_status (servant_id, path_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตาราง candidate_lists (รายชื่อผู้สมัคร)
CREATE TABLE candidate_lists (
    list_id INT PRIMARY KEY AUTO_INCREMENT,
    list_name VARCHAR(255) NOT NULL,
    position_title VARCHAR(255),
    department VARCHAR(255),
    criteria_json JSON,
    created_by INT,
    status VARCHAR(20) DEFAULT 'draft',
    max_candidates INT DEFAULT 10,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES civil_servants(servant_id),
    INDEX idx_status (status),
    INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตาราง candidate_list_members (สมาชิกในรายชื่อผู้สมัคร)
CREATE TABLE candidate_list_members (
    member_id INT PRIMARY KEY AUTO_INCREMENT,
    list_id INT NOT NULL,
    servant_id INT NOT NULL,
    score DECIMAL(5,2),
    ranking INT,
    match_percentage DECIMAL(3,2),
    notes TEXT,
    added_by INT,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES candidate_lists(list_id),
    FOREIGN KEY (servant_id) REFERENCES civil_servants(servant_id),
    FOREIGN KEY (added_by) REFERENCES civil_servants(servant_id),
    UNIQUE KEY unique_list_servant (list_id, servant_id),
    INDEX idx_ranking (list_id, ranking)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตาราง network_connections (เครือข่ายบุคลากร)
CREATE TABLE network_connections (
    connection_id INT PRIMARY KEY AUTO_INCREMENT,
    servant_id_1 INT NOT NULL,
    servant_id_2 INT NOT NULL,
    connection_type VARCHAR(20) NOT NULL,
    strength VARCHAR(20) DEFAULT 'medium',
    established_date DATE,
    last_interaction DATE,
    interaction_count INT DEFAULT 0,
    notes TEXT,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (servant_id_1) REFERENCES civil_servants(servant_id),
    FOREIGN KEY (servant_id_2) REFERENCES civil_servants(servant_id),
    UNIQUE KEY unique_connection (servant_id_1, servant_id_2),
    INDEX idx_servant_type (servant_id_1, connection_type),
    INDEX idx_strength (strength)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หมายเหตุ: photo_versions ไม่เอาเวอร์ชันของไฟล์นี้ (ENUM + file_path NOT NULL)
-- เพราะ backend/helpers.php INSERT แค่ (photo_id, version_type, file_name)
-- — ใช้ schema จาก layer 01 ที่สอดคล้องกับโค้ดจริง

-- ============================================
-- FILE: 03-personnel-stubs.sql
-- ============================================
-- ============================================================================
-- 03-personnel-stubs.sql
-- Personnel Foundation for Smart Port Career Path & Probation Features
-- สำนักงานปลัดกระทรวงยุติธรรม
--
-- Contents:
--   7 stub tables (FK targets for career path and probation schemas)
--   1 personnel table (full, with level tracking + probation columns)
--   1 personnel_position_history table (full, for career path views)
--
-- Execution order: After init.sql (01-schema.sql), before 04-career-path.sql
-- ============================================================================

-- ############################################################################
-- STUB TABLES (PK + identifying columns + created_at)
-- สร้างตาราง stub เพื่อรองรับ FK จากตาราง career path และ probation
-- ############################################################################

-- องค์กร/หน่วยงาน
CREATE TABLE organization (
    org_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    org_name VARCHAR(300) NOT NULL,
    org_code VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตำแหน่ง
CREATE TABLE `position` (
    position_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    position_name VARCHAR(300) NOT NULL,
    position_code VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ผู้ใช้งานระบบ (schema เต็มจาก 09-auth-users.sql — ไม่ต้อง ALTER ทีหลัง)
CREATE TABLE users (
    user_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(200) NOT NULL,
    password_hash VARCHAR(255) NULL,
    full_name VARCHAR(200) NULL,
    email VARCHAR(200) NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'operator',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    last_login_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หลักสูตรฝึกอบรม
CREATE TABLE training_course (
    course_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    course_name VARCHAR(300) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ค่า lookup ทั่วไป (สายงาน, ประเภทใบอนุญาต ฯลฯ)
CREATE TABLE lookup_value (
    value_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    value_name VARCHAR(200) NOT NULL,
    value_code VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- คำสั่งบุคคล
CREATE TABLE personnel_order (
    order_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(200) NOT NULL,
    order_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตั้งค่าการแจ้งเตือน
CREATE TABLE notification_config (
    config_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    notification_channel VARCHAR(50),
    template_subject VARCHAR(500),
    template_body TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ############################################################################
-- PERSONNEL TABLE (full table per D-01, D-03, D-04)
-- ตารางบุคลากร พร้อมคอลัมน์ level tracking และ probation
-- ############################################################################

CREATE TABLE personnel (
    personnel_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    citizen_id VARCHAR(13) UNIQUE,
    first_name VARCHAR(200) NOT NULL,
    last_name VARCHAR(200) NOT NULL,
    hire_date DATE,
    current_position_id BIGINT,
    current_org_id BIGINT,
    -- Career path columns (DB-03): วันเข้าสู่ระดับปัจจุบัน + รหัสระดับ
    current_level_start_date DATE,
    current_level_code VARCHAR(10),          -- K1,K2,K3,K4,K5,M1,M2,S1,S2,O1,O2,O3
    -- Probation column (DB-04): วันสิ้นสุดทดลองปฏิบัติราชการ
    probation_end_date DATE,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (current_position_id) REFERENCES `position`(position_id),
    FOREIGN KEY (current_org_id) REFERENCES organization(org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ############################################################################
-- PERSONNEL_POSITION_HISTORY TABLE (full table per D-05)
-- ประวัติการดำรงตำแหน่ง — ใช้โดย vw_job_series_tenure และ vw_executive_tenure
-- ############################################################################

CREATE TABLE personnel_position_history (
    history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    position_id BIGINT,
    org_id BIGINT,
    position_name VARCHAR(300),
    position_level VARCHAR(50),              -- K1,K2,M1,M2,S1,S2,O1,O2,O3
    salary DECIMAL(12,2),
    effective_date DATE NOT NULL,
    end_date DATE,
    order_number VARCHAR(100),
    order_date DATE,
    -- Additional columns from gap_analysis ALTER (G06,G07)
    job_series_name VARCHAR(200),            -- สายงาน เช่น นักทรัพยากรบุคคล
    work_group VARCHAR(200),                 -- กลุ่มงาน เช่น สรรหา, ข้อมูล
    province VARCHAR(100),                   -- จังหวัดที่ปฏิบัติงาน
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (position_id) REFERENCES `position`(position_id),
    FOREIGN KEY (org_id) REFERENCES organization(org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- FILE: 04-career-path.sql
-- ============================================
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

-- ============================================
-- FILE: 05-probation.sql
-- ============================================
-- ============================================================================
-- 05-probation.sql
-- Probation Tracking Tables & Dashboard View for Smart Port
-- สำนักงานปลัดกระทรวงยุติธรรม
--
-- Converted from PostgreSQL: docs/probation_tracking_schema.sql (Parts 2-7, 9)
-- Contents:
--   10 probation tracking tables
--   7 indexes
--   1 view (vw_probation_dashboard)
--
-- FK dependencies: 03-personnel-stubs.sql (personnel, organization, position,
--   users, training_course, notification_config)
-- ============================================================================

-- ############################################################################
-- PART 1: ALTER EXISTING TABLE
-- ############################################################################

-- probation_end_date already included in personnel table (03-personnel-stubs.sql)
-- No ALTER needed here.

-- ############################################################################
-- PART 2: MASTER CONFIGURATION
-- ############################################################################

-- โปรแกรมทดลองปฏิบัติราชการ (Template)
CREATE TABLE probation_program (
    program_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    program_name VARCHAR(300) NOT NULL,
    program_year INT,
    duration_months INT DEFAULT 6,
    description TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการงาน/กิจกรรมที่ต้องทำ (Checklist Template)
CREATE TABLE probation_task_template (
    template_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    program_id BIGINT NOT NULL,
    task_code VARCHAR(50) NOT NULL,
    task_name VARCHAR(300) NOT NULL,
    task_category VARCHAR(50) NOT NULL,
    task_description TEXT,
    due_within_days INT,
    is_mandatory TINYINT(1) DEFAULT 1,
    sort_order INT DEFAULT 0,
    related_course_id BIGINT,
    elearning_url VARCHAR(500),
    elearning_course_code VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (program_id) REFERENCES probation_program(program_id),
    FOREIGN KEY (related_course_id) REFERENCES training_course(course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ############################################################################
-- PART 3: ENROLLMENT
-- ############################################################################

-- การลงทะเบียนทดลองปฏิบัติราชการ (1 คน = 1 enrollment)
CREATE TABLE probation_enrollment (
    enrollment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    program_id BIGINT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    remaining_days INT,
    overall_status VARCHAR(30) DEFAULT 'IN_PROGRESS',
    final_result VARCHAR(20),
    final_result_date DATE,
    order_number VARCHAR(100),
    order_date DATE,
    extension_end_date DATE,
    extension_reason TEXT,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY (personnel_id, program_id),
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (program_id) REFERENCES probation_program(program_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_probation_enroll_pid ON probation_enrollment(personnel_id);
CREATE INDEX idx_probation_enroll_status ON probation_enrollment(overall_status);
CREATE INDEX idx_probation_enroll_enddate ON probation_enrollment(end_date);

-- ############################################################################
-- PART 4: STAKEHOLDERS
-- ############################################################################

-- บุคคลที่เกี่ยวข้องกับข้าราชการใหม่แต่ละคน
CREATE TABLE probation_stakeholder (
    stakeholder_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id BIGINT NOT NULL,
    personnel_id BIGINT NOT NULL,
    role_type VARCHAR(30) NOT NULL,
    role_description VARCHAR(200),
    assigned_date DATE DEFAULT (CURDATE()),
    end_date DATE,
    is_active TINYINT(1) DEFAULT 1,
    assigned_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (enrollment_id) REFERENCES probation_enrollment(enrollment_id),
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (assigned_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_prob_stakeholder_enroll ON probation_stakeholder(enrollment_id);

-- ############################################################################
-- PART 5: TASK TRACKING
-- ############################################################################

-- ความคืบหน้างานแต่ละรายการของข้าราชการใหม่แต่ละคน
CREATE TABLE probation_task_progress (
    progress_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id BIGINT NOT NULL,
    template_id BIGINT NOT NULL,
    status VARCHAR(30) DEFAULT 'NOT_STARTED',
    due_date DATE,
    completed_date DATE,
    -- NO FOREIGN KEY for training_participant_id (table not created, too deep dependency)
    training_participant_id BIGINT,
    elearning_completion_id BIGINT,
    score DECIMAL(5,2),
    result VARCHAR(20),
    evidence_path VARCHAR(500),
    remarks TEXT,
    verified_by BIGINT,
    verified_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY (enrollment_id, template_id),
    FOREIGN KEY (enrollment_id) REFERENCES probation_enrollment(enrollment_id),
    FOREIGN KEY (template_id) REFERENCES probation_task_template(template_id),
    FOREIGN KEY (verified_by) REFERENCES personnel(personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_prob_task_enroll ON probation_task_progress(enrollment_id);
CREATE INDEX idx_prob_task_status ON probation_task_progress(status);

-- ############################################################################
-- PART 6: e-LEARNING
-- ############################################################################

-- หลักสูตร e-Learning ก.พ.
CREATE TABLE elearning_course (
    elearning_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    course_code VARCHAR(100) UNIQUE,
    course_name VARCHAR(300) NOT NULL,
    course_url VARCHAR(500),
    provider VARCHAR(200) DEFAULT 'สำนักงาน ก.พ.',
    duration_hours DECIMAL(6,2),
    is_mandatory_for_probation TINYINT(1) DEFAULT 0,
    category VARCHAR(100),
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ผลการเรียน e-Learning ของแต่ละคน
CREATE TABLE elearning_enrollment (
    enrollment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    elearning_id BIGINT NOT NULL,
    start_date DATE,
    completion_date DATE,
    score DECIMAL(5,2),
    result VARCHAR(20),
    certificate_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (personnel_id, elearning_id),
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (elearning_id) REFERENCES elearning_course(elearning_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ############################################################################
-- PART 7: EVALUATION
-- ############################################################################

-- ผลประเมินพ้นทดลอง (multi-evaluator)
CREATE TABLE probation_evaluation (
    evaluation_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id BIGINT NOT NULL,
    evaluator_id BIGINT NOT NULL,
    evaluator_role VARCHAR(30) NOT NULL,
    evaluation_round INT DEFAULT 1,
    evaluation_date DATE,
    knowledge_score DECIMAL(5,2),
    skill_score DECIMAL(5,2),
    attitude_score DECIMAL(5,2),
    discipline_score DECIMAL(5,2),
    total_score DECIMAL(5,2),
    result VARCHAR(20),
    comments TEXT,
    recommendation TEXT,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (enrollment_id) REFERENCES probation_enrollment(enrollment_id),
    FOREIGN KEY (evaluator_id) REFERENCES personnel(personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_prob_eval_enroll ON probation_evaluation(enrollment_id);

-- กรรมการพิจารณาพ้นทดลอง (Committee)
CREATE TABLE probation_committee (
    committee_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    committee_name VARCHAR(300),
    org_id BIGINT,
    meeting_date DATE,
    meeting_number VARCHAR(50),
    order_ref VARCHAR(200),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES organization(org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE probation_committee_member (
    member_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    committee_id BIGINT NOT NULL,
    personnel_id BIGINT NOT NULL,
    role_in_committee VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (committee_id, personnel_id),
    FOREIGN KEY (committee_id) REFERENCES probation_committee(committee_id),
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ############################################################################
-- PART 8: NOTIFICATION CONFIG — skipped per CONTEXT.md (deferred)
-- ############################################################################

-- ############################################################################
-- PART 9: DASHBOARD VIEW
-- ############################################################################

DROP VIEW IF EXISTS vw_probation_dashboard;
CREATE VIEW vw_probation_dashboard AS
SELECT
    pe.enrollment_id,
    p.personnel_id,
    p.citizen_id,
    CONCAT(p.first_name, ' ', p.last_name) AS full_name,
    p.hire_date,
    pe.start_date AS probation_start,
    pe.end_date AS probation_end,
    DATEDIFF(pe.end_date, CURDATE()) AS remaining_days,
    pe.overall_status,
    (SELECT COUNT(*) FROM probation_task_progress tp
     WHERE tp.enrollment_id = pe.enrollment_id) AS total_tasks,
    (SELECT COUNT(*) FROM probation_task_progress tp
     WHERE tp.enrollment_id = pe.enrollment_id AND tp.status = 'COMPLETED') AS completed_tasks,
    (SELECT COUNT(*) FROM probation_task_progress tp
     WHERE tp.enrollment_id = pe.enrollment_id AND tp.status = 'OVERDUE') AS overdue_tasks,
    (SELECT CONCAT(p2.first_name, ' ', p2.last_name)
     FROM probation_stakeholder ps
     JOIN personnel p2 ON ps.personnel_id = p2.personnel_id
     WHERE ps.enrollment_id = pe.enrollment_id AND ps.role_type = 'MENTOR' AND ps.is_active = 1
     LIMIT 1) AS mentor_name,
    (SELECT CONCAT(p2.first_name, ' ', p2.last_name)
     FROM probation_stakeholder ps
     JOIN personnel p2 ON ps.personnel_id = p2.personnel_id
     WHERE ps.enrollment_id = pe.enrollment_id AND ps.role_type = 'SUPERVISOR' AND ps.is_active = 1
     LIMIT 1) AS supervisor_name,
    (SELECT CONCAT(p2.first_name, ' ', p2.last_name)
     FROM probation_stakeholder ps
     JOIN personnel p2 ON ps.personnel_id = p2.personnel_id
     WHERE ps.enrollment_id = pe.enrollment_id AND ps.role_type = 'DIRECTOR' AND ps.is_active = 1
     LIMIT 1) AS director_name,
    o.org_name AS department,
    pos.position_name
FROM probation_enrollment pe
JOIN personnel p ON pe.personnel_id = p.personnel_id
LEFT JOIN organization o ON p.current_org_id = o.org_id
LEFT JOIN position pos ON p.current_position_id = pos.position_id
WHERE pe.overall_status = 'IN_PROGRESS';

-- ============================================
-- FILE: 06-seed-data.sql
-- ============================================
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

-- Executive track: อำนวยการ M1/M2 + บริหาร S1/S2 (reference config)
-- คำนวณจริงใน QualificationEngine::buildExecutiveQuery (multi-path) — ตัวเลขต้องตรงกับ engine
-- เกณฑ์ pin จาก Excel master-prep (to-M1/M2/S1/S2); อ้างอิง นร 1006/ว5 (22 มี.ค. 67)
INSERT INTO promotion_criteria
  (target_level_code, target_level_name, source_level_code, source_level_name, min_years,
   education_condition, career_track, combination_group, combination_min_years,
   requires_equiv_years, requires_screening, description, legal_reference, is_active, effective_date)
VALUES
('M1', 'อำนวยการ ต้น', 'K3', 'ชำนาญการพิเศษ', 3.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'ดำรง K3 ครบ 3 ปี + ผ่าน 3 ต่าง', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('M1', 'อำนวยการ ต้น', 'O3', 'อาวุโส', 6.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'ดำรง O3 ครบ 6 ปี + ผ่าน 3 ต่าง', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('M2', 'อำนวยการ สูง', 'M1', 'อำนวยการ ต้น', 1.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'ดำรง M1 ครบ 1 ปี', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('M2', 'อำนวยการ สูง', 'K3', 'ชำนาญการพิเศษ', 4.0, 'ANY', 'ALL', 1, 4.0, NULL, 0, 'M1+K3 รวม 4 ปี หรือ K3 ครบ 4 ปี', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('M2', 'อำนวยการ สูง', 'O3', 'อาวุโส', 7.0, 'ANY', 'ALL', 2, 7.0, NULL, 0, 'M1+O3 รวม 7 ปี หรือ O3 ครบ 7 ปี', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('M2', 'อำนวยการ สูง', 'K4', 'เชี่ยวชาญ', 0.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'K4 + ผ่าน 3 ต่าง (lateral)', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('S1', 'บริหาร ต้น', 'M1', 'อำนวยการ ต้น', 2.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'ดำรง M1 ครบ 2 ปี', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('S1', 'บริหาร ต้น', 'M2', 'อำนวยการ สูง', 2.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'ดำรง M2 ครบ 2 ปี', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('S1', 'บริหาร ต้น', 'K4', 'เชี่ยวชาญ', 2.0, 'ANY', 'ALL', NULL, NULL, 2.0, 0, 'ดำรง K4 ครบ 2 ปี + เทียบตำแหน่งอำนวยการ', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22'),
('S2', 'บริหาร สูง', 'S1', 'บริหาร ต้น', 1.0, 'ANY', 'ALL', NULL, NULL, NULL, 0, 'ดำรง S1 ครบ 1 ปี', 'นร 1006/ว5 (22 มี.ค. 67)', 1, '2024-03-22');

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

-- ============================================
-- FILE: 07-add-education-level.sql
-- ============================================
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

-- ============================================
-- FILE: 08-career-path-v11.sql
-- ============================================
SET NAMES utf8mb4;
-- ============================================================================
-- 08-career-path-v11.sql
-- v1.1 Database Preparation: ALTER TABLEs + Seed Data
-- สำนักงานปลัดกระทรวงยุติธรรม
--
-- Contents:
--   Section 1: ALTER supportive_job_series (add ratio_percent)
--   Section 2: ALTER diverse_experience (diff_count -> GENERATED)
--   Section 3: Seed supportive_job_series mapping data
--
-- Dependencies: 04-career-path.sql (tables must exist)
-- NOTE: Docker MySQL only runs init scripts on first volume creation.
--       After adding this file, run: docker-compose down -v && docker-compose up
-- ============================================================================

-- ############################################################################
-- Section 1: ALTER supportive_job_series — add ratio_percent column
-- ############################################################################

ALTER TABLE supportive_job_series
  ADD COLUMN ratio_percent INT DEFAULT 100
  AFTER mapping_type;

-- ############################################################################
-- Section 2: ALTER diverse_experience — diff_count to STORED GENERATED
-- ############################################################################

ALTER TABLE diverse_experience
  MODIFY COLUMN diff_count INT
  GENERATED ALWAYS AS (is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature) STORED;

-- ############################################################################
-- Section 3: Seed supportive_job_series mapping data
-- 14 directional mapping rows for K-series วิชาการ group
-- ############################################################################

INSERT INTO supportive_job_series
  (primary_series_name, supportive_series_name, mapping_type, ratio_percent, is_active, effective_date)
VALUES
  ('นักประชาสัมพันธ์', 'นักวิชาการโสตทัศนศึกษา', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิเคราะห์นโยบายและแผน', 'นักวิชาการยุติธรรม', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิเคราะห์นโยบายและแผน', 'นักทรัพยากรบุคคล', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิเคราะห์นโยบายและแผน', 'นักจัดการงานทั่วไป', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิชาการยุติธรรม', 'นักวิเคราะห์นโยบายและแผน', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิชาการยุติธรรม', 'นักทรัพยากรบุคคล', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิชาการยุติธรรม', 'นักจัดการงานทั่วไป', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักทรัพยากรบุคคล', 'นักวิเคราะห์นโยบายและแผน', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักทรัพยากรบุคคล', 'นักวิชาการยุติธรรม', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักทรัพยากรบุคคล', 'นักจัดการงานทั่วไป', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักจัดการงานทั่วไป', 'นักวิเคราะห์นโยบายและแผน', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักจัดการงานทั่วไป', 'นักวิชาการยุติธรรม', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักจัดการงานทั่วไป', 'นักทรัพยากรบุคคล', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นิติกร', 'นิติกร', 'EXCLUSIVE', 100, 1, '2024-03-22');

-- NOTE: Additional supportive_job_series mappings (เจ้าพนักงานธุรการ O-series,
-- and full PDF pages 32-82 coverage) should be added by HR or via admin UI.
-- These 14 rows cover the K-series วิชาการ group confirmed from gap_analysis SQL comments.

-- ============================================
-- FILE: 09-auth-users.sql
-- ============================================
-- ตาราง users สร้างแบบเต็มไว้แล้วใน section 03 (ไม่ต้อง ALTER)
-- เหลือเฉพาะ login_attempts + seed admin

-- บันทึกความพยายาม login สำหรับ rate limiting
-- (Render free tier ไม่มี Redis และ filesystem ไม่ persist — เก็บใน DB)
CREATE TABLE login_attempts (
    attempt_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(200) NOT NULL,
    ip_address VARCHAR(45) NULL,
    is_success TINYINT(1) NOT NULL DEFAULT 0,
    attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_login_attempts_user_time (username, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed admin คนแรก (กัน lock-out) — รหัสผ่านชั่วคราว 'admin123'
-- ต้องเปลี่ยนทันทีหลัง deploy production (must_change_password = 1)
-- ใช้ upsert เผื่อกรณี import ทับ dump เก่าที่ seed แถว (1,'admin') ไว้แล้ว
INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)
VALUES ('admin', '$2y$10$Vrl20xAh4dvfwpDt/pWnTOcMuCzjj8353VKy348pb80StKqkENMcm', 'ผู้ดูแลระบบ', 'admin', 1, 1)
ON DUPLICATE KEY UPDATE
    password_hash = VALUES(password_hash),
    full_name = VALUES(full_name),
    role = VALUES(role),
    is_active = VALUES(is_active),
    must_change_password = VALUES(must_change_password);

SET FOREIGN_KEY_CHECKS = 1;
