-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 35-fk-retrofit.sql
-- D4: retrofit FOREIGN KEY ให้ soft-link ที่ T-D4.1 audit เจอ (2026-09-23)
--
-- Audit (dev DB): ตารางลูกว่าง (0 แถว) 5 ตาราง + refresh_tokens 535 แถว +
-- personnel 46 แถว — orphan = 0 ทุกคู่ (ดู T-D4.1) จึงเติม FK ตรง ๆ ไม่ต้อง data-fix
--
-- 8 FK ใหม่ (RESTRICT ทั้งหมด = ลบแม่ที่ลูกอ้างอยู่ถูกปฏิเสธ):
--   awards.personnel_id, royal_decorations.personnel_id,
--   civil_servant_photos.personnel_id, performance_proposals.personnel_id,
--   performance_proposals.evaluator_id (widen INT -> BIGINT ก่อน, คอลัมน์นี้
--     ไม่มี writer ใน backend/frontend + ตารางว่าง — widen ปลอดภัย),
--   qualification_calculation.personnel_id, refresh_tokens.user_id,
--   personnel.prefix_id
--
-- ตั้งใจคง soft-link ไว้ (ไม่เติม FK) + เหตุผล:
--   audit_log.record_id — polymorphic (table_name ระบุตารางแม่ต่อแถว)
--   external_ref.internal_id/ref_id — mapping ข้ามระบบ (internal_table/source_*)
--   login_attempts.username — ต้องบันทึกชื่อที่ไม่มีใน users ได้ (กัน brute force)
--   probation_task_progress.elearning_completion_id/training_participant_id —
--     ตารางปลายทางไม่มีอยู่จริง (legacy column)
--
-- Fail-closed: orphan pre-check (SELECT ละคู่ — ต้องคืน 0) อยู่ก่อน DDL ทุกตัว
--   เลข orphan อยู่ใน log; ถ้ามี orphan จริง InnoDB ปฏิเสธ ALTER ด้วย error 1452
--   (ข้อความระบุ constraint/table/column) -> runner exit 1 (run-migrations.php)
--   / docker initdb abort -> migration ไม่ถูกบันทึก = ไม่ข้ามเงียบ
--   (ไม่ใช้ SIGNAL/procedure: runner ตัด statement ด้วย ';' ไม่รองรับ DELIMITER)
--
-- TiDB: single-column FK -> PK + MODIFY widen + RESTRICT อยู่ใน subset ที่รองรับ;
--   prod bootstrap ผ่าน tidb-init.sql (fold CONSTRAINT เดียวกันไว้แล้ว)
-- ============================================================================

-- ---- T-D4.2 fail-closed pre-checks: ทุกคู่ต้องคืน orphans = 0 ----------------
SELECT 'awards.personnel_id' AS soft_link, COUNT(*) AS orphans
FROM awards a LEFT JOIN personnel p ON p.personnel_id = a.personnel_id
WHERE p.personnel_id IS NULL;

SELECT 'royal_decorations.personnel_id' AS soft_link, COUNT(*) AS orphans
FROM royal_decorations d LEFT JOIN personnel p ON p.personnel_id = d.personnel_id
WHERE p.personnel_id IS NULL;

SELECT 'civil_servant_photos.personnel_id' AS soft_link, COUNT(*) AS orphans
FROM civil_servant_photos c LEFT JOIN personnel p ON p.personnel_id = c.personnel_id
WHERE p.personnel_id IS NULL;

SELECT 'performance_proposals.personnel_id' AS soft_link, COUNT(*) AS orphans
FROM performance_proposals pp LEFT JOIN personnel p ON p.personnel_id = pp.personnel_id
WHERE p.personnel_id IS NULL;

SELECT 'performance_proposals.evaluator_id' AS soft_link, COUNT(*) AS orphans
FROM performance_proposals pp LEFT JOIN personnel p ON p.personnel_id = pp.evaluator_id
WHERE pp.evaluator_id IS NOT NULL AND p.personnel_id IS NULL;

SELECT 'qualification_calculation.personnel_id' AS soft_link, COUNT(*) AS orphans
FROM qualification_calculation q LEFT JOIN personnel p ON p.personnel_id = q.personnel_id
WHERE p.personnel_id IS NULL;

SELECT 'refresh_tokens.user_id' AS soft_link, COUNT(*) AS orphans
FROM refresh_tokens t LEFT JOIN users u ON u.user_id = t.user_id
WHERE u.user_id IS NULL;

SELECT 'personnel.prefix_id' AS soft_link, COUNT(*) AS orphans
FROM personnel p LEFT JOIN prefixes x ON x.prefix_id = p.prefix_id
WHERE p.prefix_id IS NOT NULL AND x.prefix_id IS NULL;

-- ---- DDL --------------------------------------------------------------------
-- evaluator_id: widen INT -> BIGINT ให้ตรง personnel.personnel_id ก่อนผูก FK
ALTER TABLE performance_proposals MODIFY COLUMN evaluator_id BIGINT NULL;

ALTER TABLE awards
    ADD CONSTRAINT fk_awards_personnel
    FOREIGN KEY (personnel_id) REFERENCES personnel (personnel_id);

ALTER TABLE royal_decorations
    ADD CONSTRAINT fk_decorations_personnel
    FOREIGN KEY (personnel_id) REFERENCES personnel (personnel_id);

ALTER TABLE civil_servant_photos
    ADD CONSTRAINT fk_photos_personnel
    FOREIGN KEY (personnel_id) REFERENCES personnel (personnel_id);

ALTER TABLE performance_proposals
    ADD CONSTRAINT fk_proposals_personnel
    FOREIGN KEY (personnel_id) REFERENCES personnel (personnel_id);

ALTER TABLE performance_proposals
    ADD CONSTRAINT fk_proposals_evaluator
    FOREIGN KEY (evaluator_id) REFERENCES personnel (personnel_id);

ALTER TABLE qualification_calculation
    ADD CONSTRAINT fk_qualcalc_personnel
    FOREIGN KEY (personnel_id) REFERENCES personnel (personnel_id);

ALTER TABLE refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_user
    FOREIGN KEY (user_id) REFERENCES users (user_id);

ALTER TABLE personnel
    ADD CONSTRAINT fk_personnel_prefix
    FOREIGN KEY (prefix_id) REFERENCES prefixes (prefix_id);
