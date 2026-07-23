-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 20-royal-decorations.sql
-- ตารางเครื่องราชอิสริยาภรณ์ของข้าราชการ (royal_decorations)
--
-- หมายเหตุ TiDB: ไม่ใช้ FOREIGN KEY / TRIGGER / DEFINER / ENUM
--   - เชื่อม servant_id กับ civil_servants แบบ soft link (validate ฝั่ง PHP)
--   - received_year เก็บเป็นปี พ.ศ. (SMALLINT)
--   - gazette_ref = อ้างอิงราชกิจจานุเบกษา
-- ============================================================================

CREATE TABLE IF NOT EXISTS royal_decorations (
    decoration_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    servant_id INT NOT NULL,
    decoration_name VARCHAR(255) NOT NULL,
    decoration_class VARCHAR(100) NULL DEFAULT NULL,
    received_year SMALLINT NULL DEFAULT NULL,
    gazette_ref VARCHAR(255) NULL DEFAULT NULL,
    description TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_decorations_servant (servant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
