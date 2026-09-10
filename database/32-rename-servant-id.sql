-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4;

-- ============================================================================
-- 32-rename-servant-id.sql
-- N60: คอลัมน์ servant_id ค้างหลัง unify person identity (migration 22 remap ค่า
-- เป็น personnel_id แล้วแต่ชื่อคอลัมน์ยังเป็นชื่อเก่า) + type INT ไม่ตรง personnel_id
-- ที่เป็น BIGINT — rename เป็น personnel_id + ขยายเป็น BIGINT ให้ตรง PK
--
-- ขอบเขต 4 ตารางที่ยังมีคอลัมน์นี้ (ตาราง dead โดน 24 ลบไปแล้ว):
--   civil_servant_photos, performance_proposals, awards, royal_decorations
-- evaluator_id/assignee_id/assigner_id ชื่อถูกแล้ว — ไม่แตะ (follow-up ได้)
--
-- TiDB: RENAME COLUMN / MODIFY COLUMN / RENAME INDEX รองรับ (แยก statement ละ 1 op
-- กันความต่างการ parse ALTER หลายข้อ) · ไม่มี FK ค้าง (22 ปลดหมดแล้ว)
-- Full rename รวม API (ตัดสินใจแล้ว): backend SQL + request/response fields +
-- frontend เปลี่ยนเป็น personnel_id พร้อมกันใน PR เดียวกัน (deploy พร้อมกัน ไม่มี client นอก)
-- ============================================================================

-- civil_servant_photos (KEY ชื่อ servant_id ตาม dump เดิม)
ALTER TABLE civil_servant_photos RENAME COLUMN servant_id TO personnel_id;
ALTER TABLE civil_servant_photos MODIFY COLUMN personnel_id BIGINT NOT NULL;
ALTER TABLE civil_servant_photos RENAME INDEX `servant_id` TO `personnel_id`;

-- performance_proposals
ALTER TABLE performance_proposals RENAME COLUMN servant_id TO personnel_id;
ALTER TABLE performance_proposals MODIFY COLUMN personnel_id BIGINT NOT NULL;
ALTER TABLE performance_proposals RENAME INDEX idx_servant_type TO idx_personnel_type;

-- awards (19-awards.sql)
ALTER TABLE awards RENAME COLUMN servant_id TO personnel_id;
ALTER TABLE awards MODIFY COLUMN personnel_id BIGINT NOT NULL;
ALTER TABLE awards RENAME INDEX idx_awards_servant TO idx_awards_personnel;

-- royal_decorations (20-royal-decorations.sql)
ALTER TABLE royal_decorations RENAME COLUMN servant_id TO personnel_id;
ALTER TABLE royal_decorations MODIFY COLUMN personnel_id BIGINT NOT NULL;
ALTER TABLE royal_decorations RENAME INDEX idx_decorations_servant TO idx_decorations_personnel;
