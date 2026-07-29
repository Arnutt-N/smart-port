-- ============================================================================
-- 24-drop-dead-tables.sql
-- ลบตารางที่ไม่มี consumer ใดใน backend/frontend (ผลตรวจ 2026-07-29)
--   - 5 tables จาก 04-career-path.sql (partial implementation, ไม่เคยถูก query)
--   - 2 tables จาก 05-probation.sql (elearning — ไม่เคย wire เข้า route)
--   - 6 tables จาก export/tidb-init (legacy/speculative schema)
--   - 1 table advance_notifications (เดิมใช้โดย /forecast ซึ่งถูกถอดออก)
--   - civil_servants (deprecated ตั้งแต่ ADR-0002, migration 22 ย้ายข้อมูลแล้ว)
--
-- ลำดับสำคัญ: drop ตารางลูกที่มี FK ชี้ civil_servants ก่อน → แล้วค่อย drop civil_servants
-- (local MySQL มี FK enforcement; TiDB ไม่มี — ลำดับไม่กระทบแต่คงไว้เพื่อ MySQL)
-- ============================================================================

-- Career path (04-career-path.sql) — never queried
DROP TABLE IF EXISTS screening_list;
DROP TABLE IF EXISTS rotation_assignment;
DROP TABLE IF EXISTS promotion_evaluation;
DROP TABLE IF EXISTS promotion_required_training;
DROP TABLE IF EXISTS professional_license;

-- Probation e-learning (05-probation.sql) — never wired
DROP TABLE IF EXISTS elearning_enrollment;
DROP TABLE IF EXISTS elearning_course;

-- Legacy/speculative — มี FK ชี้ civil_servants (ต้อง drop ก่อน)
DROP TABLE IF EXISTS candidate_list_members;
DROP TABLE IF EXISTS candidate_lists;
DROP TABLE IF EXISTS career_paths;
DROP TABLE IF EXISTS ml_predictions;
DROP TABLE IF EXISTS network_connections;
DROP TABLE IF EXISTS task_assignments;

-- Forecast placeholder (removed endpoint /forecast 2026-07-29)
DROP TABLE IF EXISTS advance_notifications;

-- Deprecated person table (ADR-0002: merged into personnel since migration 22)
DROP TABLE IF EXISTS civil_servants;
