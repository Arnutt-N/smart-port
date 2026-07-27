-- ============================================================================
-- 03-audit-log.sql
-- Audit Log Table for User Management Enhancement
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    -- NULL ได้ (ต่างจาก draft แรกที่ NOT NULL) — ถ้า user ถูกลบทิ้งในอนาคต แถว audit ต้องรอดอยู่
    -- (ดู ON DELETE SET NULL ด้านล่าง) audit trail ต้องไม่หายไปพร้อมบัญชีผู้กระทำ
    user_id BIGINT NULL,
    action VARCHAR(50) NOT NULL COMMENT 'CREATE, UPDATE, DELETE',
    table_name VARCHAR(100) NOT NULL COMMENT 'ชื่อตารางที่ถูกแก้ไข',
    record_id BIGINT NULL COMMENT 'PK ของ record ที่ถูกแก้ไข',
    before_value JSON NULL COMMENT 'ค่าก่อนแก้ไข (สำหรับ UPDATE/DELETE)',
    after_value JSON NULL COMMENT 'ค่าหลังแก้ไข (สำหรับ CREATE/UPDATE)',
    ip_address VARCHAR(45) NULL COMMENT 'IP ของผู้ทำรายการ',
    user_agent TEXT NULL COMMENT 'Browser/Client ที่ใช้',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_action (user_id, action),
    INDEX idx_table_record (table_name, record_id),
    INDEX idx_created_at (created_at DESC),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='บันทึกการเปลี่ยนแปลงข้อมูลสำคัญ (audit trail)';

-- สร้าง View สำหรับดู audit log พร้อมชื่อผู้ใช้
CREATE OR REPLACE VIEW vw_audit_log AS
SELECT
    al.audit_id,
    al.user_id,
    u.username,
    u.full_name,
    al.action,
    al.table_name,
    al.record_id,
    al.before_value,
    al.after_value,
    al.ip_address,
    al.user_agent,
    al.created_at
FROM audit_log al
LEFT JOIN users u ON al.user_id = u.user_id
ORDER BY al.created_at DESC;
