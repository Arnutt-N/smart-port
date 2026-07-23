-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 18-refresh-tokens.sql
-- Refresh token storage สำหรับต่ออายุ access token (JWT หมดอายุ 1 ชม.)
--
-- ออกแบบเชิงความปลอดภัย:
--   - เก็บเฉพาะ SHA-256 hash ของ token (ไม่เก็บ plaintext) — DB leak ก็ใช้ token ไม่ได้
--   - token เป็น opaque random 32 bytes (64 hex) ไม่ใช่ JWT
--   - rotation: ใช้แล้ว revoke ใบเก่า ออกใบใหม่ทุกครั้ง
--   - reuse detection: ถ้ามีการนำ token ที่ถูก revoke ไปแล้วมาใช้ซ้ำ = สงสัยถูกขโมย
--
-- หมายเหตุ TiDB: ไม่ใช้ FOREIGN KEY / TRIGGER / DEFINER (validate ฝั่ง PHP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_refresh_token_hash (token_hash),
    KEY idx_refresh_user (user_id),
    KEY idx_refresh_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
