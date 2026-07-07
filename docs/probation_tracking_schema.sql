-- ============================================================================
-- ระบบติดตามทดลองปฏิบัติราชการ (Probation Tracking System)
-- สำนักงานปลัดกระทรวงยุติธรรม
-- เพิ่มเติมจาก: hr_database_schema.sql Section 13 (probation_assessment)
-- ============================================================================

-- ############################################################################
-- PART 1: ALTER EXISTING TABLE
-- ############################################################################

-- เพิ่ม probation_end_date ใน personnel เพื่อ query ด่วนโดยไม่ต้องคำนวณ
ALTER TABLE personnel
    ADD COLUMN probation_end_date DATE;  -- hire_date + 6 months (auto-set by trigger)

-- ############################################################################
-- PART 2: MASTER CONFIGURATION
-- ############################################################################

-- โปรแกรมทดลองปฏิบัติราชการ (Template)
-- กำหนดว่าข้าราชการใหม่ต้องทำอะไรบ้างใน 6 เดือน
CREATE TABLE probation_program (
    program_id          BIGSERIAL PRIMARY KEY,
    program_name        VARCHAR(300) NOT NULL,           -- เช่น "โปรแกรมทดลองฯ ปี 2569"
    program_year        INT,                             -- ปีงบประมาณ
    duration_months     INT DEFAULT 6,                   -- ระยะเวลาทดลอง (เดือน)
    description         TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_by          BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE probation_program IS
'โปรแกรมทดลองปฏิบัติราชการ — กำหนด template ว่าข้าราชการใหม่ต้องทำอะไรบ้าง
 อ้างอิง: กฎ ก.พ. ว่าด้วยการทดลองปฏิบัติหน้าที่ราชการ พ.ศ. 2553';

-- รายการงาน/กิจกรรมที่ต้องทำ (Checklist Template)
CREATE TABLE probation_task_template (
    template_id         BIGSERIAL PRIMARY KEY,
    program_id          BIGINT NOT NULL REFERENCES probation_program(program_id),
    task_code           VARCHAR(50) NOT NULL,            -- TRAINING, ELEARNING, ASSESSMENT, REPORT
    task_name           VARCHAR(300) NOT NULL,
    task_category       VARCHAR(50) NOT NULL,            -- LEARNING, EVALUATION, ADMINISTRATIVE
    task_description    TEXT,
    due_within_days     INT,                             -- ต้องเสร็จภายในกี่วันนับจากวันบรรจุ
    is_mandatory        BOOLEAN DEFAULT TRUE,            -- จำเป็นต้องผ่าน
    sort_order          INT DEFAULT 0,
    -- สำหรับ link ไประบบอื่น
    related_course_id   BIGINT REFERENCES training_course(course_id),  -- link หลักสูตร
    elearning_url       VARCHAR(500),                    -- URL e-Learning ก.พ.
    elearning_course_code VARCHAR(100),                  -- รหัสหลักสูตร e-Learning
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE probation_task_template IS
'Template รายการงานในโปรแกรมทดลอง — ตัวอย่าง:
  1. TRAINING     - เข้าอบรมหลักสูตรข้าราชการใหม่ (due 90 วัน)
  2. ELEARNING_1  - หลักสูตร e-Learning ก.พ. ภาคบังคับ (due 120 วัน)
  3. ELEARNING_2  - หลักสูตร e-Learning ก.พ. เลือกเสรี (due 150 วัน)
  4. ASSESSMENT_1 - ประเมินครั้งที่ 1 โดยพี่เลี้ยง (due 90 วัน)
  5. ASSESSMENT_2 - ประเมินครั้งที่ 2 โดยหัวหน้า (due 150 วัน)
  6. ASSESSMENT_3 - ประเมินโดยกรรมการ (due 180 วัน)
  7. REPORT       - ส่งรายงานผลทดลอง (due 170 วัน)';

-- ############################################################################
-- PART 3: ENROLLMENT — ลงทะเบียนข้าราชการใหม่เข้าโปรแกรม
-- ############################################################################

-- การลงทะเบียนทดลองปฏิบัติราชการ (1 คน = 1 enrollment)
CREATE TABLE probation_enrollment (
    enrollment_id       BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    program_id          BIGINT NOT NULL REFERENCES probation_program(program_id),
    start_date          DATE NOT NULL,                   -- วันบรรจุ = วันเริ่มทดลอง
    end_date            DATE NOT NULL,                   -- วันครบ 6 เดือน
    remaining_days      INT,                             -- จำนวนวันที่เหลือ (auto-update)
    -- สถานะรวม
    overall_status      VARCHAR(30) DEFAULT 'IN_PROGRESS',  -- IN_PROGRESS, COMPLETED, FAILED, EXTENDED
    -- ผลประเมินรวม
    final_result        VARCHAR(20),                     -- PASS, FAIL, EXTEND
    final_result_date   DATE,
    order_number        VARCHAR(100),                    -- เลขที่คำสั่งพ้นทดลอง
    order_date          DATE,
    -- ข้อมูลเพิ่มเติม
    extension_end_date  DATE,                            -- กรณีขยายเวลาทดลอง
    extension_reason    TEXT,
    remarks             TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (personnel_id, program_id)
);

CREATE INDEX idx_probation_enroll_pid ON probation_enrollment(personnel_id);
CREATE INDEX idx_probation_enroll_status ON probation_enrollment(overall_status);
CREATE INDEX idx_probation_enroll_enddate ON probation_enrollment(end_date);

COMMENT ON TABLE probation_enrollment IS
'การลงทะเบียนทดลองปฏิบัติราชการ
 remaining_days = end_date - CURRENT_DATE (auto-update ด้วย scheduled job)
 เมื่อ remaining_days ≤ 30/15/7 → trigger แจ้งเตือน';

-- ############################################################################
-- PART 4: STAKEHOLDERS — บุคคลที่เกี่ยวข้อง
-- ############################################################################

-- บุคคลที่เกี่ยวข้องกับข้าราชการใหม่แต่ละคน
CREATE TABLE probation_stakeholder (
    stakeholder_id      BIGSERIAL PRIMARY KEY,
    enrollment_id       BIGINT NOT NULL REFERENCES probation_enrollment(enrollment_id),
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),  -- ตัวบุคคล (พี่เลี้ยง/หัวหน้า/ผอ./กรรมการ)
    role_type           VARCHAR(30) NOT NULL,            -- MENTOR, SUPERVISOR, DIRECTOR, COMMITTEE
    role_description    VARCHAR(200),
    assigned_date       DATE DEFAULT CURRENT_DATE,
    end_date            DATE,
    is_active           BOOLEAN DEFAULT TRUE,
    assigned_by         BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prob_stakeholder_enroll ON probation_stakeholder(enrollment_id);

COMMENT ON TABLE probation_stakeholder IS
'บุคคลที่เกี่ยวข้องกับข้าราชการใหม่แต่ละคน:
  MENTOR     = พี่เลี้ยง (1 คน)
  SUPERVISOR = ผู้กำกับดูแล/หัวหน้างาน (1 คน)
  DIRECTOR   = ผู้บังคับบัญชา/ผอ. (1 คน)
  COMMITTEE  = กรรมการพิจารณาพ้นทดลอง (หลายคน)';

-- ############################################################################
-- PART 5: TASK TRACKING — ติดตามงานที่ต้องทำ
-- ############################################################################

-- ความคืบหน้างานแต่ละรายการของข้าราชการใหม่แต่ละคน
CREATE TABLE probation_task_progress (
    progress_id         BIGSERIAL PRIMARY KEY,
    enrollment_id       BIGINT NOT NULL REFERENCES probation_enrollment(enrollment_id),
    template_id         BIGINT NOT NULL REFERENCES probation_task_template(template_id),
    -- สถานะ
    status              VARCHAR(30) DEFAULT 'NOT_STARTED',  -- NOT_STARTED, IN_PROGRESS, COMPLETED, OVERDUE
    due_date            DATE,                            -- วัน deadline ของ task นี้
    completed_date      DATE,
    -- Link ไปข้อมูลจริง
    training_participant_id BIGINT REFERENCES training_participant(participant_id),  -- link อบรม
    elearning_completion_id BIGINT,                      -- link e-Learning (ถ้ามีตาราง)
    -- ผลลัพธ์
    score               DECIMAL(5,2),
    result              VARCHAR(20),                     -- PASS, FAIL, INCOMPLETE
    evidence_path       VARCHAR(500),                    -- ไฟล์หลักฐาน (ใบ cert, screenshot)
    remarks             TEXT,
    -- ใครเป็นคนอนุมัติ
    verified_by         BIGINT REFERENCES personnel(personnel_id),
    verified_date       DATE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (enrollment_id, template_id)
);

CREATE INDEX idx_prob_task_enroll ON probation_task_progress(enrollment_id);
CREATE INDEX idx_prob_task_status ON probation_task_progress(status);

COMMENT ON TABLE probation_task_progress IS
'ติดตามความคืบหน้างานแต่ละรายการ — 1 row = 1 task ของ 1 คน
 Auto-set status = OVERDUE เมื่อ CURRENT_DATE > due_date AND status != COMPLETED';

-- ############################################################################
-- PART 6: e-LEARNING — ข้อมูล e-Learning ก.พ.
-- ############################################################################

-- หลักสูตร e-Learning ก.พ.
CREATE TABLE elearning_course (
    elearning_id        BIGSERIAL PRIMARY KEY,
    course_code         VARCHAR(100) UNIQUE,             -- รหัสหลักสูตร ก.พ.
    course_name         VARCHAR(300) NOT NULL,
    course_url          VARCHAR(500),                    -- URL เข้าเรียน
    provider            VARCHAR(200) DEFAULT 'สำนักงาน ก.พ.',
    duration_hours      DECIMAL(6,2),
    is_mandatory_for_probation BOOLEAN DEFAULT FALSE,    -- บังคับสำหรับทดลอง
    category            VARCHAR(100),                    -- ภาคบังคับ, เลือกเสรี
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ผลการเรียน e-Learning ของแต่ละคน
CREATE TABLE elearning_enrollment (
    enrollment_id       BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    elearning_id        BIGINT NOT NULL REFERENCES elearning_course(elearning_id),
    start_date          DATE,
    completion_date     DATE,
    score               DECIMAL(5,2),
    result              VARCHAR(20),                     -- PASS, FAIL, IN_PROGRESS
    certificate_url     VARCHAR(500),                    -- URL ใบ cert จาก ก.พ.
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (personnel_id, elearning_id)
);

COMMENT ON TABLE elearning_course IS
'หลักสูตร e-Learning ก.พ. (OCSC e-Learning)
 ข้าราชการบรรจุใหม่ต้องเรียนหลักสูตรภาคบังคับให้ครบก่อนพ้นทดลอง';

-- ############################################################################
-- PART 7: EVALUATION — ผลประเมินพ้นทดลอง (multi-evaluator)
-- ############################################################################

-- ผลประเมินพ้นทดลอง — หลายคนประเมิน (แทน/ขยาย probation_assessment เดิม)
CREATE TABLE probation_evaluation (
    evaluation_id       BIGSERIAL PRIMARY KEY,
    enrollment_id       BIGINT NOT NULL REFERENCES probation_enrollment(enrollment_id),
    evaluator_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    evaluator_role      VARCHAR(30) NOT NULL,            -- MENTOR, SUPERVISOR, DIRECTOR, COMMITTEE
    evaluation_round    INT DEFAULT 1,                   -- ครั้งที่ 1, 2, 3
    evaluation_date     DATE,
    -- คะแนน
    knowledge_score     DECIMAL(5,2),                    -- ความรู้
    skill_score         DECIMAL(5,2),                    -- ทักษะ
    attitude_score      DECIMAL(5,2),                    -- เจตคติ/ทัศนคติ
    discipline_score    DECIMAL(5,2),                    -- วินัย/ความประพฤติ
    total_score         DECIMAL(5,2),
    -- ผลลัพธ์
    result              VARCHAR(20),                     -- PASS, FAIL, NEED_IMPROVEMENT
    comments            TEXT,
    recommendation      TEXT,                            -- ข้อเสนอแนะ
    status              VARCHAR(20) DEFAULT 'PENDING',   -- PENDING, SUBMITTED, APPROVED
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prob_eval_enroll ON probation_evaluation(enrollment_id);

COMMENT ON TABLE probation_evaluation IS
'ผลประเมินพ้นทดลอง (multi-evaluator) — แทน probation_assessment เดิมที่มีแค่ 1 assessor
 Flow: พี่เลี้ยงประเมินก่อน → หัวหน้า → ผอ. → กรรมการตัดสินขั้นสุดท้าย';

-- กรรมการพิจารณาพ้นทดลอง (Committee)
CREATE TABLE probation_committee (
    committee_id        BIGSERIAL PRIMARY KEY,
    committee_name      VARCHAR(300),                    -- เช่น "คณะกรรมการพิจารณาพ้นทดลอง ครั้งที่ 1/2569"
    org_id              BIGINT REFERENCES organization(org_id),
    meeting_date        DATE,
    meeting_number      VARCHAR(50),                     -- ครั้งที่
    order_ref           VARCHAR(200),                    -- เลขที่คำสั่งแต่งตั้ง
    status              VARCHAR(20) DEFAULT 'ACTIVE',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE probation_committee_member (
    member_id           BIGSERIAL PRIMARY KEY,
    committee_id        BIGINT NOT NULL REFERENCES probation_committee(committee_id),
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    role_in_committee   VARCHAR(50) NOT NULL,            -- CHAIR, MEMBER, SECRETARY
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (committee_id, personnel_id)
);

-- ############################################################################
-- PART 8: NOTIFICATION CONFIG — ตั้งค่าแจ้งเตือน
-- ############################################################################

-- เพิ่ม event_type สำหรับ probation ใน notification_config ที่มีอยู่
INSERT INTO notification_config (event_type, notification_channel, template_subject, template_body, is_active)
VALUES
('PROBATION_30DAY', 'EMAIL', 'แจ้งเตือน: ข้าราชการใหม่จะครบทดลอง 6 เดือน ภายใน 30 วัน',
 'เรียน {{supervisor_name}}\n\n{{personnel_name}} จะครบกำหนดทดลองปฏิบัติราชการ 6 เดือน ในวันที่ {{end_date}} (เหลืออีก {{remaining_days}} วัน)\n\nกรุณาตรวจสอบความคืบหน้า:\n- อบรมหลักสูตรข้าราชการใหม่: {{training_status}}\n- e-Learning ก.พ.: {{elearning_status}}\n- ผลประเมิน: {{evaluation_status}}', TRUE),

('PROBATION_15DAY', 'EMAIL', 'เร่งด่วน: ข้าราชการใหม่จะครบทดลอง 6 เดือน ภายใน 15 วัน',
 'เรียน {{supervisor_name}}\n\n{{personnel_name}} จะครบกำหนดทดลองฯ ใน {{remaining_days}} วัน\n\nสิ่งที่ยังไม่เสร็จ:\n{{pending_tasks}}', TRUE),

('PROBATION_7DAY', 'EMAIL', 'ด่วนที่สุด: ข้าราชการใหม่จะครบทดลอง 6 เดือน ภายใน 7 วัน',
 'เรียน {{director_name}}\n\n{{personnel_name}} จะครบกำหนด {{end_date}} ({{remaining_days}} วัน)\nกรุณาดำเนินการประเมินพ้นทดลองโดยเร็ว', TRUE),

('PROBATION_TASK_OVERDUE', 'EMAIL', 'แจ้งเตือน: งานทดลองฯ เกินกำหนด',
 '{{personnel_name}} มีงานเกินกำหนด: {{task_name}}\nDue: {{due_date}}', TRUE),

('PROBATION_MENTOR_REMIND', 'EMAIL', 'แจ้งเตือนพี่เลี้ยง: กรุณาส่งรายงานผลการดูแลข้าราชการใหม่',
 'เรียน {{mentor_name}}\n\nกรุณาส่งรายงานผลการดูแล {{personnel_name}}', TRUE),

('PROBATION_COMMITTEE_MEETING', 'EMAIL', 'แจ้งเตือน: ประชุมกรรมการพิจารณาพ้นทดลอง',
 'เรียน {{committee_member_name}}\n\nขอเชิญประชุมคณะกรรมการพิจารณาพ้นทดลอง\nวันที่ {{meeting_date}}', TRUE);


-- ############################################################################
-- PART 9: DASHBOARD VIEW
-- ############################################################################

CREATE OR REPLACE VIEW vw_probation_dashboard AS
SELECT
    pe.enrollment_id,
    p.personnel_id,
    p.citizen_id,
    p.first_name || ' ' || p.last_name AS full_name,
    p.hire_date,
    pe.start_date AS probation_start,
    pe.end_date AS probation_end,
    (pe.end_date - CURRENT_DATE) AS remaining_days,
    pe.overall_status,
    -- สถานะ tasks
    (SELECT COUNT(*) FROM probation_task_progress tp WHERE tp.enrollment_id = pe.enrollment_id) AS total_tasks,
    (SELECT COUNT(*) FROM probation_task_progress tp WHERE tp.enrollment_id = pe.enrollment_id AND tp.status = 'COMPLETED') AS completed_tasks,
    (SELECT COUNT(*) FROM probation_task_progress tp WHERE tp.enrollment_id = pe.enrollment_id AND tp.status = 'OVERDUE') AS overdue_tasks,
    -- บุคคลที่เกี่ยวข้อง
    (SELECT p2.first_name || ' ' || p2.last_name FROM probation_stakeholder ps JOIN personnel p2 ON ps.personnel_id = p2.personnel_id WHERE ps.enrollment_id = pe.enrollment_id AND ps.role_type = 'MENTOR' AND ps.is_active LIMIT 1) AS mentor_name,
    (SELECT p2.first_name || ' ' || p2.last_name FROM probation_stakeholder ps JOIN personnel p2 ON ps.personnel_id = p2.personnel_id WHERE ps.enrollment_id = pe.enrollment_id AND ps.role_type = 'SUPERVISOR' AND ps.is_active LIMIT 1) AS supervisor_name,
    (SELECT p2.first_name || ' ' || p2.last_name FROM probation_stakeholder ps JOIN personnel p2 ON ps.personnel_id = p2.personnel_id WHERE ps.enrollment_id = pe.enrollment_id AND ps.role_type = 'DIRECTOR' AND ps.is_active LIMIT 1) AS director_name,
    -- สังกัด
    o.org_name AS department,
    pos.position_name
FROM probation_enrollment pe
JOIN personnel p ON pe.personnel_id = p.personnel_id
LEFT JOIN organization o ON p.current_org_id = o.org_id
LEFT JOIN position pos ON p.current_position_id = pos.position_id
WHERE pe.overall_status = 'IN_PROGRESS';

COMMENT ON VIEW vw_probation_dashboard IS
'Dashboard ข้าราชการบรรจุใหม่ — แสดงสถานะทดลองทั้งหมด
 remaining_days > 30  → สีเขียว (ปกติ)
 remaining_days 15-30 → สีเหลือง (เตือน)
 remaining_days 7-14  → สีส้ม (เร่งด่วน)
 remaining_days < 7   → สีแดง (ด่วนที่สุด)';
