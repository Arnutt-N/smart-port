-- ============================================================================
-- 29-ensure-probation-view-prefixes.sql
-- บังคับอัปเดต vw_probation_dashboard ให้ JOIN prefixes อีกครั้ง
-- (กรณี migration 28 ถูก mark ว่า applied แต่ view บน TiDB ยังเป็นรุ่นเก่า)
--
-- Apply: docker compose exec backend php scripts/run-migrations.php
-- Fresh Docker / tidb-init: นิยามเดียวกันอยู่ใน tidb-init.sql แล้ว
-- ============================================================================

SET NAMES utf8mb4;

DROP VIEW IF EXISTS vw_probation_dashboard;
CREATE VIEW vw_probation_dashboard AS
SELECT
    pe.enrollment_id,
    p.personnel_id,
    p.citizen_id,
    CONCAT(COALESCE(px.prefix_name_th COLLATE utf8mb4_unicode_ci, ''), p.first_name, ' ', p.last_name) AS full_name,
    p.hire_date,
    pe.start_date AS probation_start,
    pe.end_date AS probation_end,
    DATEDIFF(pe.end_date, CURDATE()) AS remaining_days,
    pe.overall_status,
    COALESCE(tp.total_tasks, 0) AS total_tasks,
    COALESCE(tp.completed_tasks, 0) AS completed_tasks,
    COALESCE(tp.overdue_tasks, 0) AS overdue_tasks,
    sh.mentor_name,
    sh.supervisor_name,
    sh.director_name,
    o.org_name AS department,
    pos.position_name
FROM probation_enrollment pe
JOIN personnel p ON pe.personnel_id = p.personnel_id
LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
LEFT JOIN organization o ON p.current_org_id = o.org_id
LEFT JOIN position pos ON p.current_position_id = pos.position_id
LEFT JOIN (
    SELECT
        enrollment_id,
        COUNT(*) AS total_tasks,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_tasks,
        SUM(CASE WHEN status = 'OVERDUE' THEN 1 ELSE 0 END) AS overdue_tasks
    FROM probation_task_progress
    GROUP BY enrollment_id
) tp ON tp.enrollment_id = pe.enrollment_id
LEFT JOIN (
    SELECT
        ps.enrollment_id,
        MAX(CASE WHEN ps.role_type = 'MENTOR' THEN CONCAT(COALESCE(px2.prefix_name_th COLLATE utf8mb4_unicode_ci, ''), p2.first_name, ' ', p2.last_name) END) AS mentor_name,
        MAX(CASE WHEN ps.role_type = 'SUPERVISOR' THEN CONCAT(COALESCE(px2.prefix_name_th COLLATE utf8mb4_unicode_ci, ''), p2.first_name, ' ', p2.last_name) END) AS supervisor_name,
        MAX(CASE WHEN ps.role_type = 'DIRECTOR' THEN CONCAT(COALESCE(px2.prefix_name_th COLLATE utf8mb4_unicode_ci, ''), p2.first_name, ' ', p2.last_name) END) AS director_name
    FROM probation_stakeholder ps
    JOIN personnel p2 ON ps.personnel_id = p2.personnel_id
    LEFT JOIN prefixes px2 ON p2.prefix_id = px2.prefix_id
    WHERE ps.is_active = 1
      AND ps.role_type IN ('MENTOR', 'SUPERVISOR', 'DIRECTOR')
    GROUP BY ps.enrollment_id
) sh ON sh.enrollment_id = pe.enrollment_id
WHERE pe.overall_status = 'IN_PROGRESS';
