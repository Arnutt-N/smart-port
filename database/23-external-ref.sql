-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 23-external-ref.sql
-- Crosswalk อ้างอิง record ต้นทางจากระบบภายนอก (ADR-0001: Anti-Corruption Layer)
--   - ID ระบบเดิมเป็น running number ที่ระบบเขา generate — ห้ามใช้เป็น PK ภายใน
--   - source_id เป็น VARCHAR เพราะรหัสระบบเดิมมีทั้งตัวเลขและ CHAR code
--   - PII: source_id อาจเป็น citizen_id (กรณี Excel import) → สถานะเดียวกับ
--     ตาราง personnel ห้าม expose ผ่าน API endpoint
-- หมายเหตุ TiDB: ไม่ใช้ FOREIGN KEY / TRIGGER / DEFINER (validate ฝั่ง PHP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS external_ref (
    ref_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_system VARCHAR(50) NOT NULL,
    source_table VARCHAR(100) NOT NULL,
    source_id VARCHAR(100) NOT NULL,
    internal_table VARCHAR(100) NOT NULL,
    internal_id BIGINT NOT NULL,
    synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_external_ref_source (source_system, source_table, source_id, internal_table),
    KEY idx_external_ref_internal (internal_table, internal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
