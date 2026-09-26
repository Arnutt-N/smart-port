-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 36-remember-me-session-ttl.sql
-- D6: remember-me + session absolute TTL
--
-- แถว refresh เดิมไม่บันทึก (ก) ผู้ใช้เลือก remember ตอน login หรือไม่
-- (ข) จุดเริ่มต้นของ session ต้นฉบับ — จึงไม่สามารถกอบกู้ TTL ได้:
--   * เพิ่ม remember_me   — ค่าตอน login (0 = session, 1 = 30 วัน)
--   * เพิ่ม revocation_reason — NULL = ยังใช้งาน/rotation ปกติ,
--     'legacy_cutover' = ถูกเพิกถอนโดย migration นี้ (บังคับ re-login)
--   * revoke ทุกแถวที่ยัง active ด้วย UPDATE canonical เพียงคำเดียว:
--     ห้ามมีรูปแบบอื่น (สั้นกว่านี้/ไม่ใส่ reason) — reason คือกุญแจกัน replay ของ
--     cookie เก่าไป kill session ใหม่ (ดู refreshSession legacy_cutover branch)
--
-- baseline seeding บน DB ที่ provision แล้วอาจมาร์กไฟล์นี้ applied โดยไม่ได้
-- รันจริง — ต้อง verify คอลัมน์/ผล revoke ก่อน trust marker (ดู T6)
-- ============================================================================

ALTER TABLE refresh_tokens
    ADD COLUMN remember_me TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN revocation_reason VARCHAR(32) NULL DEFAULT NULL;

UPDATE refresh_tokens
   SET revoked_at = CURRENT_TIMESTAMP,
       revocation_reason = 'legacy_cutover'
 WHERE revoked_at IS NULL;
