-- ============================================================================
-- 34-password-history.sql
-- ตารางประวัติรหัสผ่านสำหรับนโยบายรหัสผ่านเข้ม (D2): จำ 5 รุ่นล่าสุดต่อ user
--
-- ความจริง 2 ข้อที่ต้องจำ:
--   (ก) ตารางใหม่ทั้งก้อน ไม่มี orphan — ใส่ FK user_id -> users(user_id) ได้เลย
--       (fallback ถ้า TiDB prod ปฏิเสธ FK: ตัด FK clause + เช็ก user ฝั่ง PHP —
--       ดู T-D2.1 ใน PRP; วันนี้ TiDB รองรับ FK แล้วจึงใส่ตรง ๆ)
--   (ข) CREATE TABLE IF NOT EXISTS — rerun ปลอดภัย (idempotent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS password_history (
    history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_password_history_user (user_id, history_id),
    CONSTRAINT fk_password_history_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
