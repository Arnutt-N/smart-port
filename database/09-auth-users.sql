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

-- Seed admin คนแรก (กัน lock-out)
--
-- คำเตือนด้านความปลอดภัย: รหัสผ่านเริ่มต้นด้านล่างเป็น credential สำหรับ dev/local
-- เท่านั้น และถือว่าเป็น "ค่าสาธารณะ" เพราะ hash อยู่ใน repo ที่เปิดสาธารณะ
-- ระบบ production ต้องเปลี่ยนรหัสผ่านบัญชี admin ทันทีหลัง deploy ครั้งแรก
-- must_change_password = 1 เป็นเพียงสัญญาณให้ frontend พาไปหน้าเปลี่ยนรหัส
-- มันไม่ได้บล็อกการออก JWT ที่ backend (ดู loginUser() ใน backend/routes/auth.php)
--
-- ใช้ upsert เพราะ dump เก่า (export-tidb.sql / reimport-data.sql) seed แถว
-- (1,'admin') ไว้แล้วทั้งบน local และ TiDB production
INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)
VALUES ('admin', '$2y$10$Vrl20xAh4dvfwpDt/pWnTOcMuCzjj8353VKy348pb80StKqkENMcm', 'ผู้ดูแลระบบ', 'admin', 1, 1)
ON DUPLICATE KEY UPDATE
    -- ตั้งรหัสผ่านให้เฉพาะแถวที่ "ยังไม่มีรหัสใช้งานได้" (dump เก่าที่ hash เป็น NULL/ว่าง)
    -- ห้ามเขียนทับรหัสที่ผู้ดูแลตั้งเองแล้ว มิฉะนั้นการรัน migration ซ้ำ = รีเซ็ตรหัสผ่าน
    -- ของ production กลับไปเป็นค่า bootstrap สาธารณะโดยไม่มีใครรู้ตัว
    --
    -- ลำดับสำคัญ: must_change_password ต้องอยู่ "ก่อน" password_hash เพราะ MySQL/TiDB
    -- ประเมิน assignment เรียงซ้ายไปขวา ถ้าสลับลำดับ users.password_hash จะถูกเขียนทับ
    -- ไปแล้ว เงื่อนไขจะอ่านค่าใหม่และกลายเป็นเท็จเสมอ
    must_change_password = IF(users.password_hash IS NULL OR users.password_hash = '', VALUES(must_change_password), users.must_change_password),
    password_hash = IF(users.password_hash IS NULL OR users.password_hash = '', VALUES(password_hash), users.password_hash),
    full_name = IF(users.full_name IS NULL OR users.full_name = '', VALUES(full_name), users.full_name),
    -- Do not reset role: migration 27 may promote username=admin → superadmin
    -- is_active = 1 เสมอโดยตั้งใจ — เป็นตัวกัน lock-out (คงพฤติกรรมเดิม)
    is_active = VALUES(is_active);
