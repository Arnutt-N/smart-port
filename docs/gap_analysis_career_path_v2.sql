-- ============================================================================
-- GAP ANALYSIS v2 (ตรวจสอบซ้ำ) — ตารางที่ต้องสร้างเพิ่ม + ALTER + VIEW
-- สำนักงานปลัดกระทรวงยุติธรรม
-- อ้างอิง: opscarrerpath.pdf (86 หน้า) + career_2569_03_21_masterprep.xlsx
-- เพิ่มเติมจาก: hr_database_schema.sql (112 ตาราง, 28 sections)
-- 
-- สรุป: 9 ตารางใหม่ + 2 VIEWs + 3 ALTER TABLE
-- ============================================================================

-- ############################################################################
-- PART 1: ALTER EXISTING TABLES (แก้ไขตารางที่มีอยู่)
-- ############################################################################

-- [G01] personnel ขาด วันเข้าสู่ระดับปัจจุบัน
-- ทุกชีท to-* ใช้ col "วันเข้าสู่ระดับปัจจุบัน" เป็นจุดเริ่มนับ
-- ปัจจุบัน DB ต้อง query MAX(effective_date) จาก position_history ทุกครั้ง
ALTER TABLE personnel
    ADD COLUMN current_level_start_date  DATE,       -- วันเข้าสู่ระดับปัจจุบัน
    ADD COLUMN current_level_code        VARCHAR(10); -- K1,K2,K3,K4,K5,M1,M2,S1,S2,O1,O2,O3

-- [G04] career_path ขาด career_track สำหรับแยก LAW/POLICY
-- ชีท K4-K5-LAW / K4-K5-POLICY ใช้แยกเส้นทาง
ALTER TABLE career_path
    ADD COLUMN career_track VARCHAR(20) DEFAULT 'ALL'; -- LAW, POLICY, ALL

-- [G06,G07] personnel_position_history ขาด ข้อมูลสำหรับนับต่าง+นับวันในสายงาน
-- ชีท นับต่าง ต้องการ: กลุ่มงาน, จังหวัด
-- ชีท นับวันใน-ตน. ต้องการ: สายงาน (join position ได้ แต่เพิ่มไว้ denormalize)
ALTER TABLE personnel_position_history
    ADD COLUMN job_series_name  VARCHAR(200),  -- สายงาน เช่น นักทรัพยากรบุคคล
    ADD COLUMN work_group       VARCHAR(200),  -- กลุ่มงาน เช่น สรรหา, ข้อมูล
    ADD COLUMN province         VARCHAR(100);  -- จังหวัดที่ปฏิบัติงาน


-- ############################################################################
-- PART 2: NEW TABLES — MUST (ต้องมี 6 ตาราง)
-- ############################################################################

-- [G02,G03,G04,G18] เกณฑ์คุณสมบัติเลื่อนระดับ
-- career_path_step.min_years_exp เก็บค่าเดียว ไม่รองรับ:
--   K2: ป.ตรี=6, ป.โท=4, ป.เอก=2
--   M2: M1≥1 หรือ M1+K3≥4 หรือ M1+O3≥7 หรือ K3≥4 หรือ O3≥7
CREATE TABLE promotion_criteria (
    criteria_id           BIGSERIAL PRIMARY KEY,
    target_level_code     VARCHAR(10) NOT NULL,        -- K2, K3, K4, K5, M1, M2, S1, S2, O2, O3
    target_level_name     VARCHAR(100),
    source_level_code     VARCHAR(10) NOT NULL,        -- ระดับต้นทาง
    source_level_name     VARCHAR(100),
    min_years             DECIMAL(4,1),                -- จำนวนปีขั้นต่ำ (NULL = ไม่กำหนด)
    education_condition   VARCHAR(20),                 -- BACHELOR, MASTER, DOCTORATE, ANY
    career_track          VARCHAR(20) DEFAULT 'ALL',   -- LAW, POLICY, ALL
    combination_group     INT,                         -- กลุ่มรวม เช่น M1+K3=group 1
    combination_min_years DECIMAL(4,1),                -- ปีรวมของ combination
    requires_related_exp_years DECIMAL(4,1),           -- ปฏิบัติงานที่เกี่ยวข้อง ≥ N ปี
    requires_screening    BOOLEAN DEFAULT FALSE,       -- ต้องผ่านบัญชีกลั่นกรอง
    requires_equiv_years  DECIMAL(4,1),                -- ต้องเทียบตำแหน่ง ≥ N ปี (K4→S1)
    is_lateral_transfer   BOOLEAN DEFAULT FALSE,       -- ย้ายระดับเดียวกัน (M2↔K4)
    description           TEXT,
    legal_reference       VARCHAR(500),                -- อ้างอิง ก.พ. / ว.3 / ว.5 / ว.17
    is_active             BOOLEAN DEFAULT TRUE,
    effective_date        DATE,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE promotion_criteria IS
'เกณฑ์คุณสมบัติเลื่อนระดับ (แก้ Gap G02,G03,G04,G18)
 อ้างอิง: PDF หน้า 6 (กรอบวางแผน) + หน้า 26-29 (อำนวยการ) + หน้า 31-82 (วิชาการ+ทั่วไป)
 ตัวอย่างข้อมูล:
   target=K2, source=K1, min_years=6, education=BACHELOR
   target=K2, source=K1, min_years=4, education=MASTER
   target=K2, source=K1, min_years=2, education=DOCTORATE
   target=M2, source=M1, min_years=1
   target=M2, source=M1+K3, combination_group=1, combination_min_years=4
   target=K5, source=S1, min_years=1, career_track=LAW
   target=S1, source=K4, requires_equiv_years=2
 หนังสือ ก.พ.: นร 1006/ว5 (22 มี.ค. 67), นร 1006/ว3 (22 ก.พ. 67), นร 1006/ว17 (28 ก.ค. 58)';

-- [G07] ประสบการณ์งานที่หลากหลาย (3 ต่าง) — ตรงกับชีท "นับต่าง"
CREATE TABLE diverse_experience (
    experience_id         BIGSERIAL PRIMARY KEY,
    personnel_id          BIGINT NOT NULL REFERENCES personnel(personnel_id),
    from_job_series       VARCHAR(200),
    from_work_group       VARCHAR(200),
    from_division         VARCHAR(200),
    from_org_id           BIGINT REFERENCES organization(org_id),
    from_province         VARCHAR(100),
    from_start_date       DATE,
    from_end_date         DATE,
    from_total_days       INT,
    to_job_series         VARCHAR(200),
    to_work_group         VARCHAR(200),
    to_division           VARCHAR(200),
    to_org_id             BIGINT REFERENCES organization(org_id),
    to_province           VARCHAR(100),
    to_start_date         DATE,
    to_end_date           DATE,
    to_total_days         INT,
    is_diff_job_series    BOOLEAN DEFAULT FALSE,       -- ต่างสายงาน
    is_diff_org           BOOLEAN DEFAULT FALSE,       -- ต่างหน่วยงาน
    is_diff_location      BOOLEAN DEFAULT FALSE,       -- ต่างพื้นที่
    is_diff_work_nature   BOOLEAN DEFAULT FALSE,       -- ต่างลักษณะงาน
    diff_count            INT DEFAULT 0,               -- จำนวนต่าง (0-4)
    qualified_date        DATE,                         -- วันที่ครบ 3 ต่าง
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_diverse_exp_pid ON diverse_experience(personnel_id);

COMMENT ON TABLE diverse_experience IS
'ประสบการณ์งานหลากหลาย (3 ต่าง) (แก้ Gap G07)
 ตรงกับชีท "นับต่าง" ใน Excel — เงื่อนไข to-M1
 อ้างอิง: PDF หน้า 26 + ประกาศ อ.ก.พ. กระทรวงยุติธรรม (4 ม.ค. 62)
 หนังสือ ก.พ.: นร 1006/ว17 (28 ก.ค. 58)';

-- [G05] นับวันเกื้อกูล — ตรงกับชีท "นับเกื้อกูล"
CREATE TABLE supportive_experience (
    supportive_id         BIGSERIAL PRIMARY KEY,
    personnel_id          BIGINT NOT NULL REFERENCES personnel(personnel_id),
    job_series_name       VARCHAR(200),                 -- สายงานที่เกื้อกูล
    start_date            DATE NOT NULL,
    end_date              DATE NOT NULL,
    total_days            INT,
    ratio_percent         DECIMAL(5,2) DEFAULT 100,     -- สัดส่วน 50-100%
    effective_days        DECIMAL(10,2),                 -- = total_days × ratio / 100
    net_end_date          DATE,
    net_years             INT,
    net_months            INT,
    net_day_remainder     INT,
    description           TEXT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE supportive_experience IS
'การนับวันเกื้อกูล (แก้ Gap G05)
 ตรงกับชีท "นับเกื้อกูล" ใน Excel
 ใช้ใน: to-K2 col(21), to-K3 col(21) = เกื้อกูล จำนวนวัน
 คำนวณ: effective_days = total_days × ratio_percent / 100';

-- [G08] เทียบตำแหน่ง — ตรงกับชีท "เทียบ-ตน."
CREATE TABLE position_equivalence (
    equivalence_id        BIGSERIAL PRIMARY KEY,
    personnel_id          BIGINT NOT NULL REFERENCES personnel(personnel_id),
    actual_position       VARCHAR(300),                  -- ตำแหน่งจริง
    equivalent_type       VARCHAR(100),                  -- เทียบเป็นประเภท เช่น อำนวยการ
    request_start_date    DATE,
    request_end_date      DATE,
    request_total_days    INT,
    approved_start_date   DATE,
    approved_end_date     DATE,
    approved_total_days   INT,
    approval_status       VARCHAR(20) DEFAULT 'PENDING',
    approved_by           BIGINT REFERENCES users(user_id),
    approval_order_ref    VARCHAR(200),
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE position_equivalence IS
'เทียบตำแหน่ง (แก้ Gap G08)
 ตรงกับชีท "เทียบ-ตน." ใน Excel
 อ้างอิง: PDF หน้า 6 "K4→S1 ต้องเทียบอำนวยการ ≥2 ปี"
 ใช้ใน: to-S1 สถานะ "ถึงเกณฑ์นานแล้ว / เทียบ ตน"';

-- [G10] บัญชีกลั่นกรอง
CREATE TABLE screening_list (
    screening_id          BIGSERIAL PRIMARY KEY,
    personnel_id          BIGINT NOT NULL REFERENCES personnel(personnel_id),
    screening_level       VARCHAR(20) NOT NULL,          -- อ.ต้น, อ.สูง, บ.ต้น, บ.สูง
    screening_round       VARCHAR(100),
    announcement_date     DATE,
    announcement_ref      VARCHAR(300),
    expiry_date           DATE,
    is_active             BOOLEAN DEFAULT TRUE,
    status                VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE, EXPIRED, USED
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE screening_list IS
'บัญชีกลั่นกรอง (แก้ Gap G10)
 อ้างอิง: PDF หน้า 26-27
 M1: "มีชื่ออยู่ในบัญชีรายชื่อผู้ผ่านการกลั่นกรอง (อ.ต้น)"
 M2: "เป็นผู้ขึ้นบัญชีรายชื่อผู้ผ่านการกลั่นกรอง (อ.สูง)"';

-- [G14] ผลคำนวณคุณสมบัติ — แทนสูตร Excel ทุกชีท to-*
CREATE TABLE qualification_calculation (
    calc_id               BIGSERIAL PRIMARY KEY,
    personnel_id          BIGINT NOT NULL REFERENCES personnel(personnel_id),
    target_level_code     VARCHAR(10) NOT NULL,           -- K2,K3,K5-LAW,K5-POLICY,M1,M2,S1,S2
    calculation_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    deadline_date         DATE,                           -- วันปิดรับสมัคร
    current_level_code    VARCHAR(10),
    current_level_start   DATE,
    current_tenure_days   INT,
    prev_level_1_code     VARCHAR(10),
    prev_level_1_start    DATE,
    prev_level_1_days     INT,
    prev_level_2_code     VARCHAR(10),
    prev_level_2_start    DATE,
    prev_level_2_days     INT,
    education_level       VARCHAR(20),                    -- BACHELOR, MASTER, DOCTORATE
    job_series_days       INT,                            -- จำนวนวัน ใน ตน.ที่จะเลื่อน
    supportive_days       INT DEFAULT 0,                  -- จำนวนวันเกื้อกูล
    total_qualifying_days INT,                            -- รวม ตน. + เกื้อกูล
    diverse_exp_date      DATE,                           -- วันที่ครบ 3 ต่าง (M1)
    equivalence_days      INT DEFAULT 0,                  -- วันเทียบตำแหน่ง (S1)
    has_screening         BOOLEAN DEFAULT FALSE,          -- ผ่านบัญชีกลั่นกรอง
    qualification_date    DATE,                           -- วันที่มีคุณสมบัติ
    remaining_days        INT,                            -- จำนวนวันเหลือ (ลบ=ถึงเกณฑ์)
    status                VARCHAR(30),                    -- ถึงเกณฑ์นานแล้ว / ยังไม่ถึงเกณฑ์ / Check Data
    remarks               TEXT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_qual_calc_pid ON qualification_calculation(personnel_id);
CREATE INDEX idx_qual_calc_target ON qualification_calculation(target_level_code);
CREATE INDEX idx_qual_calc_status ON qualification_calculation(status);

COMMENT ON TABLE qualification_calculation IS
'ผลคำนวณคุณสมบัติเลื่อนระดับ (แก้ Gap G14)
 ★ ตารางนี้แทน OUTPUT ของชีท to-K2/K3/K5/M1/M2/S1/S2 ทั้งหมด
 remaining_days < 0 = ถึงเกณฑ์นานแล้ว
 remaining_days > 0 = ยังไม่ถึงเกณฑ์
 status = Check Data → ข้อมูลไม่ครบ ต้องตรวจสอบ';


-- ############################################################################
-- PART 3: NEW TABLES — IMPORTANT (สำคัญ 3 ตาราง)
-- ############################################################################

-- [G11] สายงานเกื้อกูลกัน (Mapping)
CREATE TABLE supportive_job_series (
    mapping_id            BIGSERIAL PRIMARY KEY,
    primary_series_id     BIGINT REFERENCES lookup_value(value_id),
    primary_series_name   VARCHAR(200) NOT NULL,
    supportive_series_id  BIGINT REFERENCES lookup_value(value_id),
    supportive_series_name VARCHAR(200) NOT NULL,
    mapping_type          VARCHAR(50) DEFAULT 'SAME_GROUP', -- SAME_GROUP, SPECIFIC, EXCLUSIVE
    is_active             BOOLEAN DEFAULT TRUE,
    effective_date        DATE,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE supportive_job_series IS
'สายงานเกื้อกูลกัน (แก้ Gap G11)
 จาก PDF หน้า 32-82 ทุกสายงาน เช่น:
   นักประชาสัมพันธ์ ↔ นักวิชาการโสตทัศนศึกษา
   นักวิเคราะห์ฯ ↔ นักวิชาการยุติธรรม ↔ นักทรัพยากรบุคคล ↔ นักจัดการงานทั่วไป
   นิติกร = เฉพาะสายงาน (ไม่มีเกื้อกูล)';

-- [G12] หน่วยงานหมุนเวียน (Rotation)
CREATE TABLE rotation_assignment (
    rotation_id           BIGSERIAL PRIMARY KEY,
    job_series_id         BIGINT REFERENCES lookup_value(value_id),
    job_series_name       VARCHAR(200),
    rotation_org_id       BIGINT REFERENCES organization(org_id),
    rotation_org_name     VARCHAR(300),
    priority_order        INT DEFAULT 0,
    min_duration_months   INT,
    is_mandatory          BOOLEAN DEFAULT FALSE,
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE rotation_assignment IS
'หน่วยงานหมุนเวียน (แก้ Gap G12)
 จาก PDF หน้า 32-82 ทุกสายงาน เช่น:
   นิติกร → กองกฎหมาย, กบค., สกทย.
   นักวิชาการคอมพิวเตอร์ → ศทส., สกทย.
   นักวิเคราะห์ฯ → กยผ., กพย.';

-- [G13] ผลการประเมินเลื่อนระดับ
CREATE TABLE promotion_evaluation (
    evaluation_id         BIGSERIAL PRIMARY KEY,
    personnel_id          BIGINT NOT NULL REFERENCES personnel(personnel_id),
    target_level_code     VARCHAR(10) NOT NULL,
    evaluation_round      VARCHAR(100),
    application_date      DATE,
    performance_score     DECIMAL(5,2),                   -- หลักผลงาน
    salary_score          DECIMAL(5,2),                   -- หลักเงินเดือน
    competency_score      DECIMAL(5,2),                   -- หลักสมรรถนะ
    seniority_score       DECIMAL(5,2),                   -- หลักอาวุโส
    total_score           DECIMAL(5,2),
    academic_work_title   VARCHAR(500),                   -- ผลงานวิชาการ (K4,K5)
    academic_work_status  VARCHAR(50),
    status                VARCHAR(20) DEFAULT 'PENDING',
    committee_decision    TEXT,
    approved_date         DATE,
    order_id              BIGINT REFERENCES personnel_order(order_id),
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE promotion_evaluation IS
'ผลการประเมินเลื่อนระดับ (แก้ Gap G13)
 อ้างอิง: PDF หน้า 54 "ยึดหลักผลงาน หลักเงินเดือน หลักสมรรถนะ หลักอาวุโส"
 assessment ตาราง DB เดิมมี KPI+สมรรถนะ แต่ขาด เงินเดือน+อาวุโส+ผลงานวิชาการ';


-- ############################################################################
-- PART 4: VIEWS (แทนตาราง — ลดความซ้ำซ้อน)
-- ############################################################################

-- [G06] นับวันในสายงานที่จะเลื่อน — VIEW จาก position_history
CREATE OR REPLACE VIEW vw_job_series_tenure AS
SELECT
    pph.personnel_id,
    COALESCE(pph.job_series_name, p_pos.position_name) AS target_job_series,
    pph.effective_date AS tenure_start_date,
    COALESCE(pph.end_date, CURRENT_DATE) AS tenure_end_date,
    (COALESCE(pph.end_date, CURRENT_DATE) - pph.effective_date) AS total_days,
    CASE WHEN pph.end_date IS NULL THEN TRUE ELSE FALSE END AS is_current
FROM personnel_position_history pph
LEFT JOIN position p_pos ON pph.position_id = p_pos.position_id;

COMMENT ON VIEW vw_job_series_tenure IS
'VIEW: นับวันในสายงานที่จะเลื่อน (แทนตาราง job_series_tenure / แก้ Gap G06)
 ตรงกับชีท "นับวันใน-ตน." ใน Excel
 ใช้ร่วมกับ supportive_experience เพื่อคำนวณ: ตน. + เกื้อกูล';

-- [G09] นับวันในอำนวยการ/บริหาร — VIEW จาก position_history
CREATE OR REPLACE VIEW vw_executive_tenure AS
SELECT
    pph.personnel_id,
    COALESCE(pph.job_series_name, p_pos.position_name) AS position_name,
    pph.position_level,
    pph.effective_date AS start_date,
    COALESCE(pph.end_date, CURRENT_DATE) AS end_date,
    (COALESCE(pph.end_date, CURRENT_DATE) - pph.effective_date) AS total_days,
    CASE WHEN pph.end_date IS NULL THEN TRUE ELSE FALSE END AS is_current
FROM personnel_position_history pph
LEFT JOIN position p_pos ON pph.position_id = p_pos.position_id
WHERE pph.position_level IN ('M1','M2','S1','S2');

COMMENT ON VIEW vw_executive_tenure IS
'VIEW: นับวันดำรง อำนวยการ/บริหาร (แทนตาราง executive_tenure / แก้ Gap G09)
 ตรงกับชีท "นับวันใน-อต-อส" ใน Excel
 ใช้ใน: to-M2, to-S1, to-S2';


-- ############################################################################
-- PART 5: NEW TABLES — OPTIONAL (แนะนำ 2 ตาราง)
-- ############################################################################

-- [G15] หลักสูตรจำเป็นสำหรับเลื่อนระดับ
CREATE TABLE promotion_required_training (
    requirement_id        BIGSERIAL PRIMARY KEY,
    target_level_code     VARCHAR(10) NOT NULL,
    course_id             BIGINT REFERENCES training_course(course_id),
    course_name           VARCHAR(300),
    course_category       VARCHAR(100),
    is_mandatory          BOOLEAN DEFAULT TRUE,
    allow_equivalent      BOOLEAN DEFAULT TRUE,
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE promotion_required_training IS
'หลักสูตรจำเป็น (แก้ Gap G15) — PDF หน้า 54
 นักบริหารระดับต้น/กลาง/สูง หรือเทียบเท่า';

-- [G16] ใบอนุญาตประกอบวิชาชีพ
CREATE TABLE professional_license (
    license_id            BIGSERIAL PRIMARY KEY,
    personnel_id          BIGINT NOT NULL REFERENCES personnel(personnel_id),
    license_type_id       BIGINT REFERENCES lookup_value(value_id),
    license_name          VARCHAR(300),
    license_number        VARCHAR(100),
    issuing_body          VARCHAR(300),
    issue_date            DATE,
    expiry_date           DATE,
    license_level         VARCHAR(100),
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE professional_license IS
'ใบอนุญาตประกอบวิชาชีพ (แก้ Gap G16) — PDF หน้า 57-65
 วิศวกรโยธา/ไฟฟ้า, สถาปนิก ต้องมีใบอนุญาต';
