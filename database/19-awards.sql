-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 19-awards.sql
-- ตารางรางวัล/ความดีความชอบของข้าราชการ (awards)
--
-- หมายเหตุ TiDB: ไม่ใช้ FOREIGN KEY / TRIGGER / DEFINER / ENUM
--   - เชื่อม servant_id กับ civil_servants แบบ soft link (validate ฝั่ง PHP)
--   - award_type / award_level ใช้ VARCHAR + validate ฝั่ง app แทน ENUM
-- ============================================================================

CREATE TABLE IF NOT EXISTS awards (
    award_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    servant_id INT NOT NULL,
    award_name VARCHAR(255) NOT NULL,
    award_type VARCHAR(50) NOT NULL DEFAULT 'general',
    award_level VARCHAR(50) NULL DEFAULT NULL,
    awarded_date DATE NULL DEFAULT NULL,
    description TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_awards_servant (servant_id),
    KEY idx_awards_date (awarded_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
