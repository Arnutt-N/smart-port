SET NAMES utf8mb4;
-- ============================================================================
-- 08-career-path-v11.sql
-- v1.1 Database Preparation: ALTER TABLEs + Seed Data
-- สำนักงานปลัดกระทรวงยุติธรรม
--
-- Contents:
--   Section 1: ALTER supportive_job_series (add ratio_percent)
--   Section 2: ALTER diverse_experience (diff_count -> GENERATED)
--   Section 3: Seed supportive_job_series mapping data
--
-- Dependencies: 04-career-path.sql (tables must exist)
-- NOTE: Docker MySQL only runs init scripts on first volume creation.
--       After adding this file, run: docker-compose down -v && docker-compose up
-- ============================================================================

-- ############################################################################
-- Section 1: ALTER supportive_job_series — add ratio_percent column
-- ############################################################################

ALTER TABLE supportive_job_series
  ADD COLUMN ratio_percent INT DEFAULT 100
  AFTER mapping_type;

-- ############################################################################
-- Section 2: ALTER diverse_experience — diff_count to STORED GENERATED
-- ############################################################################

ALTER TABLE diverse_experience
  MODIFY COLUMN diff_count INT
  GENERATED ALWAYS AS (is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature) STORED;

-- ############################################################################
-- Section 3: Seed supportive_job_series mapping data
-- 14 directional mapping rows for K-series วิชาการ group
-- ############################################################################

INSERT INTO supportive_job_series
  (primary_series_name, supportive_series_name, mapping_type, ratio_percent, is_active, effective_date)
VALUES
  ('นักประชาสัมพันธ์', 'นักวิชาการโสตทัศนศึกษา', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิเคราะห์นโยบายและแผน', 'นักวิชาการยุติธรรม', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิเคราะห์นโยบายและแผน', 'นักทรัพยากรบุคคล', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิเคราะห์นโยบายและแผน', 'นักจัดการงานทั่วไป', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิชาการยุติธรรม', 'นักวิเคราะห์นโยบายและแผน', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิชาการยุติธรรม', 'นักทรัพยากรบุคคล', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิชาการยุติธรรม', 'นักจัดการงานทั่วไป', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักทรัพยากรบุคคล', 'นักวิเคราะห์นโยบายและแผน', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักทรัพยากรบุคคล', 'นักวิชาการยุติธรรม', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักทรัพยากรบุคคล', 'นักจัดการงานทั่วไป', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักจัดการงานทั่วไป', 'นักวิเคราะห์นโยบายและแผน', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักจัดการงานทั่วไป', 'นักวิชาการยุติธรรม', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักจัดการงานทั่วไป', 'นักทรัพยากรบุคคล', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นิติกร', 'นิติกร', 'EXCLUSIVE', 100, 1, '2024-03-22');

-- NOTE: Additional supportive_job_series mappings (เจ้าพนักงานธุรการ O-series,
-- and full PDF pages 32-82 coverage) should be added by HR or via admin UI.
-- These 14 rows cover the K-series วิชาการ group confirmed from gap_analysis SQL comments.
