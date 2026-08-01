-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 25-ensure-multiplier-tables.sql
-- ซ่อมตารางทวีคูณที่อาจหายบน production
--
-- สาเหตุ: migration 13/14 อยู่ใน baseline (ผ่าน MIGRATION_BASELINE_THROUGH=14)
-- จึงถูก mark applied โดยไม่รัน SQL ถ้า DB มีอยู่แล้ว แต่ tidb-init รุ่นเก่าไม่มีตารางเหล่านี้
-- → QualificationEngine / /multiplier พังด้วย "table doesn't exist"
--
-- ไฟล์นี้ idempotent (IF NOT EXISTS) — ปลอดภัยทั้ง MySQL local และ TiDB
-- หมายเหตุ TiDB: ไม่ใส่ FOREIGN KEY (ตาม convention migration 18+)
-- ============================================================================

CREATE TABLE IF NOT EXISTS special_area_multiplier (
    area_multiplier_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    province VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    district_key VARCHAR(100) GENERATED ALWAYS AS (COALESCE(district, '__ALL__')) VIRTUAL,
    basis_type VARCHAR(50) NOT NULL,
    multiplier_ratio DECIMAL(5,2) NOT NULL,
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    legal_reference VARCHAR(300),
    source_reference VARCHAR(500),
    is_active TINYINT(1) DEFAULT 1,
    created_by BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (multiplier_ratio >= 100.00),
    CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date),
    KEY idx_area_multiplier_lookup (province, district, is_active, effective_start_date, effective_end_date),
    UNIQUE KEY uq_area_multiplier_exact_period (province, district_key, basis_type, effective_start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS multiplier_experience (
    multiplier_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    area_multiplier_id BIGINT NOT NULL,
    province VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    basis_type VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    eligible_start_date DATE NOT NULL,
    eligible_end_date DATE NOT NULL,
    service_days INT,
    eligible_days INT,
    multiplier_ratio DECIMAL(5,2) DEFAULT 200.00,
    effective_days DECIMAL(10,2),
    bonus_days DECIMAL(10,2),
    net_end_date DATE,
    net_years INT,
    net_months INT,
    net_day_remainder INT,
    proof_reference VARCHAR(500),
    description TEXT,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (end_date >= start_date),
    CHECK (eligible_end_date >= eligible_start_date),
    KEY idx_multiplier_exp_pid (personnel_id),
    KEY idx_multiplier_exp_area (area_multiplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- created_by รวมใน CREATE ด้านบนแล้ว (เทียบเท่า migration 14) — ไม่ ALTER ซ้ำ
