-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 09-auth-users.sql
-- Multi-user Authentication — ขยายตาราง users (stub จาก 03-personnel-stubs.sql)
-- + ตาราง login_attempts สำหรับ rate limiting + seed admin คนแรก
--
-- หมายเหตุ TiDB: ไม่ใช้ ENUM / TRIGGER / DEFINER — role เป็น VARCHAR
-- แล้ว validate ฝั่ง PHP (admin | operator)
-- ============================================================================

-- ขยายตาราง users (stub เดิมมีแค่ user_id, username, created_at)
ALTER TABLE users
    ADD COLUMN password_hash VARCHAR(255) NULL,
    ADD COLUMN full_name VARCHAR(200) NULL,
    ADD COLUMN email VARCHAR(200) NULL,
    ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'operator',
    ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
    ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL,
    ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP;

-- username ต้องไม่ซ้ำ (ตารางยืนยันว่าว่างเปล่า ณ ตอนสร้าง migration นี้)
ALTER TABLE users ADD UNIQUE KEY uq_users_username (username);

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
-- ใช้ upsert เพราะ dump เก่า (export-tidb.sql / reimport-data.sql) seed แถว
-- (1,'admin') ไว้แล้วทั้งบน local และ TiDB production
INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)
VALUES ('admin', '$2y$10$Vrl20xAh4dvfwpDt/pWnTOcMuCzjj8353VKy348pb80StKqkENMcm', 'ผู้ดูแลระบบ', 'admin', 1, 1)
ON DUPLICATE KEY UPDATE
    password_hash = VALUES(password_hash),
    full_name = VALUES(full_name),
    role = VALUES(role),
    is_active = VALUES(is_active),
    must_change_password = VALUES(must_change_password);
