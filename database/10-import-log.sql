-- ============================================================================
-- 10-import-log.sql
-- Audit log การนำเข้า Excel (OWASP A09) + ใช้นับ rate limit ของ import endpoint
-- หมายเหตุ TiDB: ไม่ใช้ ENUM/TRIGGER/DEFINER
-- ห้ามเก็บ citizen_id (PII) ในตารางนี้
-- ============================================================================
CREATE TABLE IF NOT EXISTS import_log (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NULL,
    filename VARCHAR(300) NULL,
    personnel_count INT NOT NULL DEFAULT 0,
    is_success TINYINT(1) NOT NULL DEFAULT 0,
    error_summary VARCHAR(500) NULL,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_import_log_user_time (user_id, imported_at),
    KEY idx_import_log_time (imported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
