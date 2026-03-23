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

-- ผู้ใช้งานระบบ
CREATE TABLE users (
    user_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
