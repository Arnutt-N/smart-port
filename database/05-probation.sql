SET NAMES utf8mb4;
-- ============================================================================
-- 05-probation.sql
-- Probation Tracking Tables & Dashboard View for Smart Port
-- สำนักงานปลัดกระทรวงยุติธรรม
--
-- Converted from PostgreSQL: docs/probation_tracking_schema.sql (Parts 2-7, 9)
-- Contents:
--   10 probation tracking tables
--   7 indexes
--   1 view (vw_probation_dashboard)
--
-- FK dependencies: 03-personnel-stubs.sql (personnel, organization, position,
--   users, training_course, notification_config)
-- ============================================================================

-- ############################################################################
-- PART 1: ALTER EXISTING TABLE
-- ############################################################################

-- probation_end_date already included in personnel table (03-personnel-stubs.sql)
-- No ALTER needed here.

-- ############################################################################
-- PART 2: MASTER CONFIGURATION
-- ############################################################################

-- โปรแกรมทดลองปฏิบัติราชการ (Template)
CREATE TABLE probation_program (
    program_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    program_name VARCHAR(300) NOT NULL,
    program_year INT,
    duration_months INT DEFAULT 6,
    description TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการงาน/กิจกรรมที่ต้องทำ (Checklist Template)
CREATE TABLE probation_task_template (
    template_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    program_id BIGINT NOT NULL,
    task_code VARCHAR(50) NOT NULL,
    task_name VARCHAR(300) NOT NULL,
    task_category VARCHAR(50) NOT NULL,
    task_description TEXT,
    due_within_days INT,
    is_mandatory TINYINT(1) DEFAULT 1,
    sort_order INT DEFAULT 0,
    related_course_id BIGINT,
    elearning_url VARCHAR(500),
    elearning_course_code VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (program_id) REFERENCES probation_program(program_id),
    FOREIGN KEY (related_course_id) REFERENCES training_course(course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ############################################################################
-- PART 3: ENROLLMENT
-- ############################################################################

-- การลงทะเบียนทดลองปฏิบัติราชการ (1 คน = 1 enrollment)
CREATE TABLE probation_enrollment (
    enrollment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    program_id BIGINT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    remaining_days INT,
    overall_status VARCHAR(30) DEFAULT 'IN_PROGRESS',
    final_result VARCHAR(20),
    final_result_date DATE,
    order_number VARCHAR(100),
    order_date DATE,
    extension_end_date DATE,
    extension_reason TEXT,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY (personnel_id, program_id),
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (program_id) REFERENCES probation_program(program_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_probation_enroll_pid ON probation_enrollment(personnel_id);
CREATE INDEX idx_probation_enroll_status ON probation_enrollment(overall_status);
CREATE INDEX idx_probation_enroll_enddate ON probation_enrollment(end_date);

-- ############################################################################
-- PART 4: STAKEHOLDERS
-- ############################################################################

-- บุคคลที่เกี่ยวข้องกับข้าราชการใหม่แต่ละคน
CREATE TABLE probation_stakeholder (
    stakeholder_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id BIGINT NOT NULL,
    personnel_id BIGINT NOT NULL,
    role_type VARCHAR(30) NOT NULL,
    role_description VARCHAR(200),
    assigned_date DATE DEFAULT (CURDATE()),
    end_date DATE,
    is_active TINYINT(1) DEFAULT 1,
    assigned_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (enrollment_id) REFERENCES probation_enrollment(enrollment_id),
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (assigned_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_prob_stakeholder_enroll ON probation_stakeholder(enrollment_id);

-- ############################################################################
-- PART 5: TASK TRACKING
-- ############################################################################

-- ความคืบหน้างานแต่ละรายการของข้าราชการใหม่แต่ละคน
CREATE TABLE probation_task_progress (
    progress_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id BIGINT NOT NULL,
    template_id BIGINT NOT NULL,
    status VARCHAR(30) DEFAULT 'NOT_STARTED',
    due_date DATE,
    completed_date DATE,
    -- NO FOREIGN KEY for training_participant_id (table not created, too deep dependency)
    training_participant_id BIGINT,
    elearning_completion_id BIGINT,
    score DECIMAL(5,2),
    result VARCHAR(20),
    evidence_path VARCHAR(500),
    remarks TEXT,
    verified_by BIGINT,
    verified_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY (enrollment_id, template_id),
    FOREIGN KEY (enrollment_id) REFERENCES probation_enrollment(enrollment_id),
    FOREIGN KEY (template_id) REFERENCES probation_task_template(template_id),
    FOREIGN KEY (verified_by) REFERENCES personnel(personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_prob_task_enroll ON probation_task_progress(enrollment_id);
CREATE INDEX idx_prob_task_status ON probation_task_progress(status);

-- ############################################################################
-- PART 6: e-LEARNING
-- ############################################################################

-- หลักสูตร e-Learning ก.พ.
CREATE TABLE elearning_course (
    elearning_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    course_code VARCHAR(100) UNIQUE,
    course_name VARCHAR(300) NOT NULL,
    course_url VARCHAR(500),
    provider VARCHAR(200) DEFAULT 'สำนักงาน ก.พ.',
    duration_hours DECIMAL(6,2),
    is_mandatory_for_probation TINYINT(1) DEFAULT 0,
    category VARCHAR(100),
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ผลการเรียน e-Learning ของแต่ละคน
CREATE TABLE elearning_enrollment (
    enrollment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    elearning_id BIGINT NOT NULL,
    start_date DATE,
    completion_date DATE,
    score DECIMAL(5,2),
    result VARCHAR(20),
    certificate_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (personnel_id, elearning_id),
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (elearning_id) REFERENCES elearning_course(elearning_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ############################################################################
-- PART 7: EVALUATION
-- ############################################################################

-- ผลประเมินพ้นทดลอง (multi-evaluator)
CREATE TABLE probation_evaluation (
    evaluation_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id BIGINT NOT NULL,
    evaluator_id BIGINT NOT NULL,
    evaluator_role VARCHAR(30) NOT NULL,
    evaluation_round INT DEFAULT 1,
    evaluation_date DATE,
    knowledge_score DECIMAL(5,2),
    skill_score DECIMAL(5,2),
    attitude_score DECIMAL(5,2),
    discipline_score DECIMAL(5,2),
    total_score DECIMAL(5,2),
    result VARCHAR(20),
    comments TEXT,
    recommendation TEXT,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (enrollment_id) REFERENCES probation_enrollment(enrollment_id),
    FOREIGN KEY (evaluator_id) REFERENCES personnel(personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_prob_eval_enroll ON probation_evaluation(enrollment_id);

-- กรรมการพิจารณาพ้นทดลอง (Committee)
CREATE TABLE probation_committee (
    committee_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    committee_name VARCHAR(300),
    org_id BIGINT,
    meeting_date DATE,
    meeting_number VARCHAR(50),
    order_ref VARCHAR(200),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES organization(org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE probation_committee_member (
    member_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    committee_id BIGINT NOT NULL,
    personnel_id BIGINT NOT NULL,
    role_in_committee VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (committee_id, personnel_id),
    FOREIGN KEY (committee_id) REFERENCES probation_committee(committee_id),
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ############################################################################
-- PART 8: NOTIFICATION CONFIG — skipped per CONTEXT.md (deferred)
-- ############################################################################

-- ############################################################################
-- PART 9: DASHBOARD VIEW
-- ############################################################################

DROP VIEW IF EXISTS vw_probation_dashboard;
CREATE VIEW vw_probation_dashboard AS
SELECT
    pe.enrollment_id,
    p.personnel_id,
    p.citizen_id,
    CONCAT(p.first_name, ' ', p.last_name) AS full_name,
    p.hire_date,
    pe.start_date AS probation_start,
    pe.end_date AS probation_end,
    DATEDIFF(pe.end_date, CURDATE()) AS remaining_days,
    pe.overall_status,
    (SELECT COUNT(*) FROM probation_task_progress tp
     WHERE tp.enrollment_id = pe.enrollment_id) AS total_tasks,
    (SELECT COUNT(*) FROM probation_task_progress tp
     WHERE tp.enrollment_id = pe.enrollment_id AND tp.status = 'COMPLETED') AS completed_tasks,
    (SELECT COUNT(*) FROM probation_task_progress tp
     WHERE tp.enrollment_id = pe.enrollment_id AND tp.status = 'OVERDUE') AS overdue_tasks,
    (SELECT CONCAT(p2.first_name, ' ', p2.last_name)
     FROM probation_stakeholder ps
     JOIN personnel p2 ON ps.personnel_id = p2.personnel_id
     WHERE ps.enrollment_id = pe.enrollment_id AND ps.role_type = 'MENTOR' AND ps.is_active = 1
     LIMIT 1) AS mentor_name,
    (SELECT CONCAT(p2.first_name, ' ', p2.last_name)
     FROM probation_stakeholder ps
     JOIN personnel p2 ON ps.personnel_id = p2.personnel_id
     WHERE ps.enrollment_id = pe.enrollment_id AND ps.role_type = 'SUPERVISOR' AND ps.is_active = 1
     LIMIT 1) AS supervisor_name,
    (SELECT CONCAT(p2.first_name, ' ', p2.last_name)
     FROM probation_stakeholder ps
     JOIN personnel p2 ON ps.personnel_id = p2.personnel_id
     WHERE ps.enrollment_id = pe.enrollment_id AND ps.role_type = 'DIRECTOR' AND ps.is_active = 1
     LIMIT 1) AS director_name,
    o.org_name AS department,
    pos.position_name
FROM probation_enrollment pe
JOIN personnel p ON pe.personnel_id = p.personnel_id
LEFT JOIN organization o ON p.current_org_id = o.org_id
LEFT JOIN `position` pos ON p.current_position_id = pos.position_id
WHERE pe.overall_status = 'IN_PROGRESS';
