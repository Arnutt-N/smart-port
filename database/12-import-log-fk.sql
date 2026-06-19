-- ============================================================================
-- 12-import-log-fk.sql
-- FK import_log.user_id → users(user_id) — audit log อ้าง user ที่มีจริง (governance)
-- user_id nullable + ON DELETE SET NULL → ลบ user ไม่ลบ/ไม่บล็อก log (เก็บ audit trail ไว้)
-- ⚠️ verify-prod ก่อน: import_log ต้องไม่มี user_id ที่ไม่มีใน users
--   SELECT COUNT(*) FROM import_log il LEFT JOIN users u ON u.user_id=il.user_id
--   WHERE il.user_id IS NOT NULL AND u.user_id IS NULL;  -- ต้อง = 0
-- ============================================================================
ALTER TABLE import_log
  ADD CONSTRAINT fk_import_log_user
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;
