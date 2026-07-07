-- ============================================================================
-- ระบบสารสนเทศทรัพยากรบุคคล (HRIS) - Database Schema
-- Based on: คู่มือสำหรับผู้ใช้งานระบบ (User Manual)
-- สำนักงานคณะกรรมการข้าราชการพลเรือน (OCSC)
-- ============================================================================

-- ============================================================================
-- 1. SYSTEM CONFIGURATION (การตั้งค่าระบบ)
-- ============================================================================

CREATE TABLE system_config (
    config_id           BIGSERIAL PRIMARY KEY,
    config_key          VARCHAR(200) NOT NULL UNIQUE,
    config_value        TEXT,
    config_group_id     BIGINT REFERENCES system_config_group(group_id),
    description         TEXT,
    is_encrypted        BOOLEAN DEFAULT FALSE,
    is_active           BOOLEAN DEFAULT TRUE,
    created_by          BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by          BIGINT REFERENCES users(user_id),
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_config_group (
    group_id            BIGSERIAL PRIMARY KEY,
    group_name          VARCHAR(200) NOT NULL UNIQUE,
    description         TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mail_server_config (
    config_id           BIGSERIAL PRIMARY KEY,
    smtp_server         VARCHAR(255) NOT NULL,
    smtp_port           INT NOT NULL DEFAULT 587,
    smtp_user           VARCHAR(255),
    smtp_password       VARCHAR(500),
    smtp_timeout        INT DEFAULT 30,
    smtp_encryption     VARCHAR(10) DEFAULT 'TLS',
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE login_method_config (
    method_id           BIGSERIAL PRIMARY KEY,
    method_name         VARCHAR(100) NOT NULL,
    method_code         VARCHAR(50) NOT NULL UNIQUE,
    description         TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    sort_order          INT DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lookup_type (
    type_id             BIGSERIAL PRIMARY KEY,
    type_code           VARCHAR(100) NOT NULL UNIQUE,
    type_name           VARCHAR(200) NOT NULL,
    description         TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lookup_value (
    value_id            BIGSERIAL PRIMARY KEY,
    type_id             BIGINT NOT NULL REFERENCES lookup_type(type_id),
    value_code          VARCHAR(100) NOT NULL,
    value_description   VARCHAR(500),
    sort_order          INT DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (type_id, value_code)
);

CREATE TABLE scheduled_job (
    job_id              BIGSERIAL PRIMARY KEY,
    job_name            VARCHAR(200) NOT NULL,
    job_type            VARCHAR(100),
    cron_expression     VARCHAR(100),
    is_active           BOOLEAN DEFAULT TRUE,
    last_run_at         TIMESTAMP,
    next_run_at         TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scheduled_job_history (
    history_id          BIGSERIAL PRIMARY KEY,
    job_id              BIGINT REFERENCES scheduled_job(job_id),
    start_time          TIMESTAMP NOT NULL,
    end_time            TIMESTAMP,
    status              VARCHAR(20) NOT NULL,  -- SUCCESS, FAILED, RUNNING
    error_message       TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE backup_config (
    config_id           BIGSERIAL PRIMARY KEY,
    backup_month        INT,
    backup_day          INT,
    backup_time         TIME,
    backup_path         VARCHAR(500) NOT NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE backup_history (
    history_id          BIGSERIAL PRIMARY KEY,
    config_id           BIGINT REFERENCES backup_config(config_id),
    backup_time         TIMESTAMP NOT NULL,
    file_path           VARCHAR(500),
    file_size_mb        DECIMAL(12,2),
    status              VARCHAR(20) NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. MENU & NAVIGATION (การจัดการเมนู)
-- ============================================================================

CREATE TABLE menu (
    menu_id             BIGSERIAL PRIMARY KEY,
    parent_menu_id      BIGINT REFERENCES menu(menu_id),
    menu_name           VARCHAR(200) NOT NULL,
    menu_code           VARCHAR(100) UNIQUE,
    menu_url            VARCHAR(500),
    icon_class          VARCHAR(100),
    sort_order          INT DEFAULT 0,
    is_visible          BOOLEAN DEFAULT TRUE,
    is_navigation       BOOLEAN DEFAULT TRUE,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. USER & ACCESS MANAGEMENT (การจัดการสิทธิ์เข้าใช้งาน)
-- ============================================================================

CREATE TABLE users (
    user_id             BIGSERIAL PRIMARY KEY,
    username            VARCHAR(100) NOT NULL UNIQUE,
    password_hash       VARCHAR(500) NOT NULL,
    email               VARCHAR(255),
    phone               VARCHAR(20),
    personnel_id        BIGINT REFERENCES personnel(personnel_id),
    login_method_id     BIGINT REFERENCES login_method_config(method_id),
    is_active           BOOLEAN DEFAULT TRUE,
    last_login_at       TIMESTAMP,
    password_changed_at TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE role_group (
    group_id            BIGSERIAL PRIMARY KEY,
    group_code          VARCHAR(50) NOT NULL UNIQUE,
    group_name          VARCHAR(200) NOT NULL,
    description         TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_by          BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE role_group_permission (
    permission_id       BIGSERIAL PRIMARY KEY,
    group_id            BIGINT NOT NULL REFERENCES role_group(group_id),
    menu_id             BIGINT NOT NULL REFERENCES menu(menu_id),
    can_view            BOOLEAN DEFAULT FALSE,
    can_create          BOOLEAN DEFAULT FALSE,
    can_edit            BOOLEAN DEFAULT FALSE,
    can_delete          BOOLEAN DEFAULT FALSE,
    can_export          BOOLEAN DEFAULT FALSE,
    can_approve         BOOLEAN DEFAULT FALSE,
    UNIQUE (group_id, menu_id)
);

CREATE TABLE user_role (
    user_role_id        BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users(user_id),
    group_id            BIGINT NOT NULL REFERENCES role_group(group_id),
    assigned_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by         BIGINT REFERENCES users(user_id),
    UNIQUE (user_id, group_id)
);

CREATE TABLE authorized_signer (
    signer_id           BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    organization_id     BIGINT REFERENCES organization(org_id),
    signer_type         VARCHAR(50) NOT NULL,
    position_title      VARCHAR(300),
    is_active           BOOLEAN DEFAULT TRUE,
    effective_date      DATE,
    expiry_date         DATE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. AUDIT LOGS (บันทึกการใช้งาน)
-- ============================================================================

CREATE TABLE user_login_log (
    log_id              BIGSERIAL PRIMARY KEY,
    user_id             BIGINT REFERENCES users(user_id),
    login_time          TIMESTAMP NOT NULL,
    logout_time         TIMESTAMP,
    ip_address          VARCHAR(50),
    user_agent          VARCHAR(500),
    login_method        VARCHAR(50),
    status              VARCHAR(20) NOT NULL,  -- SUCCESS, FAILED
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_log (
    log_id              BIGSERIAL PRIMARY KEY,
    user_id             BIGINT REFERENCES users(user_id),
    action_type         VARCHAR(50) NOT NULL,  -- CREATE, UPDATE, DELETE, VIEW
    module_name         VARCHAR(100),
    entity_type         VARCHAR(100),
    entity_id           VARCHAR(100),
    description         TEXT,
    ip_address          VARCHAR(50),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sync_dc_log (
    log_id              BIGSERIAL PRIMARY KEY,
    service_name        VARCHAR(200) NOT NULL,
    request_type        VARCHAR(50),
    status_code         VARCHAR(10),
    request_payload     TEXT,
    response_payload    TEXT,
    error_message       TEXT,
    execution_time_ms   INT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. ORGANIZATION STRUCTURE (โครงสร้างหน่วยงาน)
-- ============================================================================

CREATE TABLE organization (
    org_id              BIGSERIAL PRIMARY KEY,
    parent_org_id       BIGINT REFERENCES organization(org_id),
    org_code            VARCHAR(50) NOT NULL UNIQUE,
    org_name            VARCHAR(300) NOT NULL,
    org_name_en         VARCHAR(300),
    org_level           INT,
    org_type_id         BIGINT REFERENCES lookup_value(value_id),
    abbreviation        VARCHAR(50),
    address             TEXT,
    phone               VARCHAR(50),
    fax                 VARCHAR(50),
    email               VARCHAR(255),
    is_active           BOOLEAN DEFAULT TRUE,
    effective_date      DATE,
    expiry_date         DATE,
    sort_order          INT DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organization_model (
    model_id            BIGSERIAL PRIMARY KEY,
    model_name          VARCHAR(200) NOT NULL,
    description         TEXT,
    base_org_id         BIGINT REFERENCES organization(org_id),
    status              VARCHAR(20) DEFAULT 'DRAFT',  -- DRAFT, APPROVED, ACTIVE
    effective_date      DATE,
    created_by          BIGINT REFERENCES users(user_id),
    approved_by         BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organization_model_detail (
    detail_id           BIGSERIAL PRIMARY KEY,
    model_id            BIGINT NOT NULL REFERENCES organization_model(model_id),
    org_id              BIGINT REFERENCES organization(org_id),
    parent_org_id       BIGINT REFERENCES organization(org_id),
    proposed_name       VARCHAR(300),
    proposed_level      INT,
    action_type         VARCHAR(20),  -- ADD, REMOVE, MODIFY, MOVE
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE external_organization (
    ext_org_id          BIGSERIAL PRIMARY KEY,
    org_code            VARCHAR(50) UNIQUE,
    org_name            VARCHAR(300) NOT NULL,
    org_type            VARCHAR(100),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 6. POSITION MANAGEMENT (ตำแหน่ง)
-- ============================================================================

CREATE TABLE position (
    position_id         BIGSERIAL PRIMARY KEY,
    position_number     VARCHAR(50) NOT NULL UNIQUE,
    position_name       VARCHAR(300) NOT NULL,
    position_name_en    VARCHAR(300),
    position_type_id    BIGINT REFERENCES lookup_value(value_id),
    position_level_id   BIGINT REFERENCES lookup_value(value_id),
    job_series_id       BIGINT REFERENCES lookup_value(value_id),
    org_id              BIGINT NOT NULL REFERENCES organization(org_id),
    salary_min          DECIMAL(12,2),
    salary_max          DECIMAL(12,2),
    is_occupied         BOOLEAN DEFAULT FALSE,
    is_active           BOOLEAN DEFAULT TRUE,
    effective_date      DATE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE position_request (
    request_id          BIGSERIAL PRIMARY KEY,
    request_type        VARCHAR(20) NOT NULL,  -- CREATE, MODIFY
    position_id         BIGINT REFERENCES position(position_id),
    org_id              BIGINT REFERENCES organization(org_id),
    proposed_name       VARCHAR(300),
    proposed_level_id   BIGINT REFERENCES lookup_value(value_id),
    proposed_series_id  BIGINT REFERENCES lookup_value(value_id),
    justification       TEXT,
    status              VARCHAR(20) DEFAULT 'PENDING',
    requested_by        BIGINT REFERENCES users(user_id),
    approved_by         BIGINT REFERENCES users(user_id),
    request_date        DATE,
    approved_date       DATE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 7. PERSONNEL DATA (ข้อมูลบุคลากร)
-- ============================================================================

CREATE TABLE personnel (
    personnel_id        BIGSERIAL PRIMARY KEY,
    citizen_id          VARCHAR(13) UNIQUE,
    title_id            BIGINT REFERENCES lookup_value(value_id),
    first_name          VARCHAR(200) NOT NULL,
    last_name           VARCHAR(200) NOT NULL,
    first_name_en       VARCHAR(200),
    last_name_en        VARCHAR(200),
    gender_id           BIGINT REFERENCES lookup_value(value_id),
    birth_date          DATE,
    blood_type          VARCHAR(5),
    nationality_id      BIGINT REFERENCES lookup_value(value_id),
    ethnicity_id        BIGINT REFERENCES lookup_value(value_id),
    religion_id         BIGINT REFERENCES lookup_value(value_id),
    marital_status_id   BIGINT REFERENCES lookup_value(value_id),
    photo_path          VARCHAR(500),
    personnel_type_id   BIGINT REFERENCES lookup_value(value_id),
    personnel_status_id BIGINT REFERENCES lookup_value(value_id),
    hire_date           DATE,
    retirement_date     DATE,
    separation_date     DATE,
    separation_reason_id BIGINT REFERENCES lookup_value(value_id),
    current_position_id BIGINT REFERENCES position(position_id),
    current_org_id      BIGINT REFERENCES organization(org_id),
    current_salary      DECIMAL(12,2),
    salary_level        VARCHAR(20),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_personnel_citizen ON personnel(citizen_id);
CREATE INDEX idx_personnel_name ON personnel(first_name, last_name);
CREATE INDEX idx_personnel_org ON personnel(current_org_id);

CREATE TABLE personnel_position_history (
    history_id          BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    position_id         BIGINT REFERENCES position(position_id),
    org_id              BIGINT REFERENCES organization(org_id),
    position_name       VARCHAR(300),
    position_level      VARCHAR(50),
    salary              DECIMAL(12,2),
    effective_date      DATE NOT NULL,
    end_date            DATE,
    order_number        VARCHAR(100),
    order_date          DATE,
    movement_type_id    BIGINT REFERENCES lookup_value(value_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE personnel_education (
    education_id        BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    education_level_id  BIGINT REFERENCES lookup_value(value_id),
    degree_name         VARCHAR(300),
    major_field         VARCHAR(300),
    minor_field         VARCHAR(300),
    institution_name    VARCHAR(300),
    country_id          BIGINT REFERENCES lookup_value(value_id),
    graduation_date     DATE,
    gpa                 DECIMAL(4,2),
    is_highest          BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE personnel_address (
    address_id          BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    address_type_id     BIGINT REFERENCES lookup_value(value_id),
    house_number        VARCHAR(50),
    moo                 VARCHAR(20),
    soi                 VARCHAR(100),
    road                VARCHAR(200),
    subdistrict_id      BIGINT,
    district_id         BIGINT,
    province_id         BIGINT,
    postal_code         VARCHAR(10),
    phone               VARCHAR(50),
    is_current          BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE personnel_family (
    family_id           BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    relationship_id     BIGINT REFERENCES lookup_value(value_id),
    title_id            BIGINT REFERENCES lookup_value(value_id),
    first_name          VARCHAR(200) NOT NULL,
    last_name           VARCHAR(200),
    citizen_id          VARCHAR(13),
    birth_date          DATE,
    occupation          VARCHAR(200),
    is_alive            BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE personnel_spouse (
    spouse_id           BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    title_id            BIGINT REFERENCES lookup_value(value_id),
    first_name          VARCHAR(200) NOT NULL,
    last_name           VARCHAR(200),
    citizen_id          VARCHAR(13),
    birth_date          DATE,
    occupation          VARCHAR(200),
    workplace           VARCHAR(300),
    marriage_date       DATE,
    divorce_date        DATE,
    marriage_status_id  BIGINT REFERENCES lookup_value(value_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE personnel_special_status (
    status_id           BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    special_type_id     BIGINT REFERENCES lookup_value(value_id),
    description         TEXT,
    effective_date      DATE,
    expiry_date         DATE,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE personnel_history (
    history_id          BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    history_type_id     BIGINT REFERENCES lookup_value(value_id),
    description         TEXT,
    start_date          DATE,
    end_date            DATE,
    reference_doc       VARCHAR(200),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE personnel_document (
    document_id         BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    document_type_id    BIGINT REFERENCES lookup_value(value_id),
    document_name       VARCHAR(300) NOT NULL,
    file_path           VARCHAR(500),
    file_size_kb        INT,
    mime_type           VARCHAR(100),
    uploaded_by         BIGINT REFERENCES users(user_id),
    uploaded_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 8. FISCAL YEAR & BUDGET PERIOD (ปีงบประมาณ)
-- ============================================================================

CREATE TABLE fiscal_year (
    fiscal_id           BIGSERIAL PRIMARY KEY,
    fiscal_year         INT NOT NULL,
    round_number        INT NOT NULL DEFAULT 1,
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (fiscal_year, round_number)
);

-- ============================================================================
-- 9. SALARY & COMPENSATION (เงินเดือนและค่าตอบแทน)
-- ============================================================================

CREATE TABLE salary_increment_budget (
    budget_id           BIGSERIAL PRIMARY KEY,
    fiscal_id           BIGINT NOT NULL REFERENCES fiscal_year(fiscal_id),
    org_id              BIGINT NOT NULL REFERENCES organization(org_id),
    total_budget        DECIMAL(15,2),
    allocated_amount    DECIMAL(15,2),
    remaining_amount    DECIMAL(15,2),
    status              VARCHAR(20) DEFAULT 'DRAFT',
    approved_by         BIGINT REFERENCES users(user_id),
    approved_date       DATE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE salary_increment (
    increment_id        BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    fiscal_id           BIGINT NOT NULL REFERENCES fiscal_year(fiscal_id),
    budget_id           BIGINT REFERENCES salary_increment_budget(budget_id),
    old_salary          DECIMAL(12,2),
    new_salary          DECIMAL(12,2),
    increment_amount    DECIMAL(12,2),
    increment_percent   DECIMAL(5,2),
    assessment_score    DECIMAL(5,2),
    assessment_level_id BIGINT REFERENCES lookup_value(value_id),
    effective_date      DATE,
    order_number        VARCHAR(100),
    order_date          DATE,
    status              VARCHAR(20) DEFAULT 'PENDING',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payslip (
    payslip_id          BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    pay_period          VARCHAR(20) NOT NULL,
    pay_date            DATE,
    base_salary         DECIMAL(12,2),
    position_allowance  DECIMAL(12,2) DEFAULT 0,
    other_income        DECIMAL(12,2) DEFAULT 0,
    total_income        DECIMAL(12,2),
    tax_deduction       DECIMAL(12,2) DEFAULT 0,
    social_security     DECIMAL(12,2) DEFAULT 0,
    provident_fund      DECIMAL(12,2) DEFAULT 0,
    other_deduction     DECIMAL(12,2) DEFAULT 0,
    total_deduction     DECIMAL(12,2),
    net_pay             DECIMAL(12,2),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tax_withholding (
    tax_id              BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    tax_year            INT NOT NULL,
    tax_month           INT,
    taxable_income      DECIMAL(15,2),
    tax_amount          DECIMAL(12,2),
    cumulative_income   DECIMAL(15,2),
    cumulative_tax      DECIMAL(12,2),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE monthly_debt_payment (
    payment_id          BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    creditor_name       VARCHAR(300),
    debt_type_id        BIGINT REFERENCES lookup_value(value_id),
    principal_amount    DECIMAL(15,2),
    monthly_amount      DECIMAL(12,2),
    start_date          DATE,
    end_date            DATE,
    remaining_balance   DECIMAL(15,2),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pension_calculation (
    calc_id             BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    calculation_date    DATE NOT NULL,
    years_of_service    DECIMAL(5,2),
    last_salary         DECIMAL(12,2),
    pension_type_id     BIGINT REFERENCES lookup_value(value_id),
    pension_amount      DECIMAL(12,2),
    lump_sum_amount     DECIMAL(15,2),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 10. TIME ATTENDANCE (ระบบบันทึกเวลา)
-- ============================================================================

CREATE TABLE attendance_config (
    config_id           BIGSERIAL PRIMARY KEY,
    config_key          VARCHAR(100) NOT NULL UNIQUE,
    config_value        VARCHAR(500),
    description         TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE work_schedule (
    schedule_id         BIGSERIAL PRIMARY KEY,
    schedule_name       VARCHAR(200) NOT NULL,
    schedule_type       VARCHAR(20) NOT NULL,  -- FIXED, FLEXIBLE, SHIFT
    check_in_time       TIME,
    check_out_time      TIME,
    late_threshold_min  INT DEFAULT 0,
    work_hours          DECIMAL(4,2) DEFAULT 8.0,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE work_location (
    location_id         BIGSERIAL PRIMARY KEY,
    location_name       VARCHAR(300) NOT NULL,
    location_code       VARCHAR(50) UNIQUE,
    address             TEXT,
    latitude            DECIMAL(10,7),
    longitude           DECIMAL(10,7),
    radius_meters       INT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance_device (
    device_id           BIGSERIAL PRIMARY KEY,
    device_name         VARCHAR(200) NOT NULL,
    device_code         VARCHAR(50) UNIQUE,
    device_type         VARCHAR(50),
    location_id         BIGINT REFERENCES work_location(location_id),
    ip_address          VARCHAR(50),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance_period (
    period_id           BIGSERIAL PRIMARY KEY,
    period_name         VARCHAR(200),
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    schedule_id         BIGINT REFERENCES work_schedule(schedule_id),
    org_id              BIGINT REFERENCES organization(org_id),
    status              VARCHAR(20) DEFAULT 'OPEN',  -- OPEN, PROCESSING, CLOSED
    processed_at        TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance_record (
    record_id           BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    attendance_date     DATE NOT NULL,
    period_id           BIGINT REFERENCES attendance_period(period_id),
    check_in_time       TIMESTAMP,
    check_out_time      TIMESTAMP,
    device_id           BIGINT REFERENCES attendance_device(device_id),
    location_id         BIGINT REFERENCES work_location(location_id),
    is_late             BOOLEAN DEFAULT FALSE,
    late_minutes        INT DEFAULT 0,
    is_early_leave      BOOLEAN DEFAULT FALSE,
    work_hours          DECIMAL(4,2),
    status              VARCHAR(20) DEFAULT 'NORMAL',
    remarks             TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attendance_date ON attendance_record(personnel_id, attendance_date);

CREATE TABLE attendance_exemption (
    exemption_id        BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    exemption_reason    TEXT,
    start_date          DATE,
    end_date            DATE,
    approved_by         BIGINT REFERENCES users(user_id),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance_correction_request (
    request_id          BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    attendance_date     DATE NOT NULL,
    requested_check_in  TIMESTAMP,
    requested_check_out TIMESTAMP,
    reason              TEXT,
    status              VARCHAR(20) DEFAULT 'PENDING',
    approved_by         BIGINT REFERENCES users(user_id),
    approved_date       TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 11. LEAVE MANAGEMENT (ระบบการลา)
-- ============================================================================

CREATE TABLE leave_type (
    leave_type_id       BIGSERIAL PRIMARY KEY,
    leave_type_code     VARCHAR(50) NOT NULL UNIQUE,
    leave_type_name     VARCHAR(200) NOT NULL,
    max_days_per_year   DECIMAL(5,1),
    is_accumulative     BOOLEAN DEFAULT FALSE,
    max_accumulate_days DECIMAL(5,1),
    requires_document   BOOLEAN DEFAULT FALSE,
    min_days_advance    INT DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,
    sort_order          INT DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leave_entitlement (
    entitlement_id      BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    leave_type_id       BIGINT NOT NULL REFERENCES leave_type(leave_type_id),
    fiscal_id           BIGINT NOT NULL REFERENCES fiscal_year(fiscal_id),
    entitled_days       DECIMAL(5,1),
    carried_over_days   DECIMAL(5,1) DEFAULT 0,
    used_days           DECIMAL(5,1) DEFAULT 0,
    remaining_days      DECIMAL(5,1),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (personnel_id, leave_type_id, fiscal_id)
);

CREATE TABLE leave_accumulated (
    accumulated_id      BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    fiscal_id           BIGINT NOT NULL REFERENCES fiscal_year(fiscal_id),
    carried_over_days   DECIMAL(5,1) DEFAULT 0,
    used_days           DECIMAL(5,1) DEFAULT 0,
    forfeited_days      DECIMAL(5,1) DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leave_approval_chain (
    chain_id            BIGSERIAL PRIMARY KEY,
    org_id              BIGINT REFERENCES organization(org_id),
    leave_type_id       BIGINT REFERENCES leave_type(leave_type_id),
    approval_level      INT NOT NULL,
    approver_id         BIGINT REFERENCES personnel(personnel_id),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (org_id, leave_type_id, approval_level)
);

CREATE TABLE leave_authorizer (
    authorizer_id       BIGSERIAL PRIMARY KEY,
    org_id              BIGINT REFERENCES organization(org_id),
    approver_personnel_id BIGINT NOT NULL REFERENCES personnel(personnel_id),
    max_leave_days      DECIMAL(5,1),
    leave_type_id       BIGINT REFERENCES leave_type(leave_type_id),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leave_request (
    request_id          BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    leave_type_id       BIGINT NOT NULL REFERENCES leave_type(leave_type_id),
    fiscal_id           BIGINT REFERENCES fiscal_year(fiscal_id),
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    start_period        VARCHAR(10) DEFAULT 'FULL',  -- FULL, AM, PM
    end_period          VARCHAR(10) DEFAULT 'FULL',
    total_days          DECIMAL(5,1) NOT NULL,
    reason              TEXT,
    contact_address     VARCHAR(500),
    contact_phone       VARCHAR(50),
    acting_person_id    BIGINT REFERENCES personnel(personnel_id),
    attachment_path     VARCHAR(500),
    status              VARCHAR(20) DEFAULT 'PENDING',
    current_approver_id BIGINT REFERENCES personnel(personnel_id),
    submitted_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leave_approval (
    approval_id         BIGSERIAL PRIMARY KEY,
    request_id          BIGINT NOT NULL REFERENCES leave_request(request_id),
    approver_id         BIGINT NOT NULL REFERENCES personnel(personnel_id),
    approval_level      INT,
    decision            VARCHAR(20) NOT NULL,  -- APPROVED, REJECTED, FORWARDED
    comments            TEXT,
    decided_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organization_holiday (
    holiday_id          BIGSERIAL PRIMARY KEY,
    org_id              BIGINT REFERENCES organization(org_id),
    holiday_date        DATE NOT NULL,
    holiday_name        VARCHAR(200) NOT NULL,
    holiday_type_id     BIGINT REFERENCES lookup_value(value_id),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 12. OVERTIME (ค่าล่วงเวลา OT)
-- ============================================================================

CREATE TABLE overtime_config (
    config_id           BIGSERIAL PRIMARY KEY,
    ot_type_id          BIGINT REFERENCES lookup_value(value_id),
    rate_multiplier     DECIMAL(4,2) NOT NULL,
    max_hours_per_day   DECIMAL(4,2),
    max_hours_per_month DECIMAL(5,2),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE overtime_assignment (
    assignment_id       BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    fiscal_id           BIGINT REFERENCES fiscal_year(fiscal_id),
    ot_date             DATE NOT NULL,
    start_time          TIME NOT NULL,
    end_time            TIME NOT NULL,
    ot_hours            DECIMAL(4,2),
    ot_type_id          BIGINT REFERENCES lookup_value(value_id),
    reason              TEXT,
    status              VARCHAR(20) DEFAULT 'PENDING',
    approved_by         BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE overtime_payment_summary (
    summary_id          BIGSERIAL PRIMARY KEY,
    fiscal_id           BIGINT NOT NULL REFERENCES fiscal_year(fiscal_id),
    org_id              BIGINT NOT NULL REFERENCES organization(org_id),
    pay_period          VARCHAR(20),
    total_hours         DECIMAL(8,2),
    total_amount        DECIMAL(15,2),
    status              VARCHAR(20) DEFAULT 'DRAFT',
    approved_by         BIGINT REFERENCES users(user_id),
    approved_date       DATE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 13. KPI & PERFORMANCE ASSESSMENT (การประเมินผล)
-- ============================================================================

CREATE TABLE kpi_config (
    config_id           BIGSERIAL PRIMARY KEY,
    fiscal_id           BIGINT NOT NULL REFERENCES fiscal_year(fiscal_id),
    config_name         VARCHAR(200) NOT NULL,
    assessment_type     VARCHAR(50),
    weight_kpi          DECIMAL(5,2),
    weight_competency   DECIMAL(5,2),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE kpi_category (
    category_id         BIGSERIAL PRIMARY KEY,
    category_code       VARCHAR(20) NOT NULL,
    category_name       VARCHAR(300) NOT NULL,
    description         TEXT,
    parent_category_id  BIGINT REFERENCES kpi_category(category_id),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE kpi_indicator (
    indicator_id        BIGSERIAL PRIMARY KEY,
    category_id         BIGINT REFERENCES kpi_category(category_id),
    indicator_code      VARCHAR(20) NOT NULL,
    indicator_name      VARCHAR(500) NOT NULL,
    description         TEXT,
    unit_of_measure     VARCHAR(50),
    target_value        DECIMAL(12,2),
    weight              DECIMAL(5,2),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE competency (
    competency_id       BIGSERIAL PRIMARY KEY,
    competency_code     VARCHAR(20) NOT NULL,
    competency_name     VARCHAR(300) NOT NULL,
    competency_type_id  BIGINT REFERENCES lookup_value(value_id),
    description         TEXT,
    max_level           INT DEFAULT 5,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE competency_level (
    level_id            BIGSERIAL PRIMARY KEY,
    competency_id       BIGINT NOT NULL REFERENCES competency(competency_id),
    level_number        INT NOT NULL,
    level_name          VARCHAR(200),
    description         TEXT,
    UNIQUE (competency_id, level_number)
);

CREATE TABLE assessment (
    assessment_id       BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    fiscal_id           BIGINT NOT NULL REFERENCES fiscal_year(fiscal_id),
    config_id           BIGINT REFERENCES kpi_config(config_id),
    assessor_id         BIGINT REFERENCES personnel(personnel_id),
    kpi_score           DECIMAL(5,2),
    competency_score    DECIMAL(5,2),
    total_score         DECIMAL(5,2),
    assessment_level_id BIGINT REFERENCES lookup_value(value_id),
    comments            TEXT,
    status              VARCHAR(20) DEFAULT 'DRAFT',
    submitted_at        TIMESTAMP,
    approved_at         TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assessment_kpi_detail (
    detail_id           BIGSERIAL PRIMARY KEY,
    assessment_id       BIGINT NOT NULL REFERENCES assessment(assessment_id),
    indicator_id        BIGINT NOT NULL REFERENCES kpi_indicator(indicator_id),
    target_value        DECIMAL(12,2),
    actual_value        DECIMAL(12,2),
    score               DECIMAL(5,2),
    weight              DECIMAL(5,2),
    weighted_score      DECIMAL(5,2),
    comments            TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assessment_competency_detail (
    detail_id           BIGSERIAL PRIMARY KEY,
    assessment_id       BIGINT NOT NULL REFERENCES assessment(assessment_id),
    competency_id       BIGINT NOT NULL REFERENCES competency(competency_id),
    expected_level      INT,
    actual_level        INT,
    score               DECIMAL(5,2),
    weight              DECIMAL(5,2),
    weighted_score      DECIMAL(5,2),
    comments            TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE probation_assessment (
    probation_id        BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    assessor_id         BIGINT REFERENCES personnel(personnel_id),
    score               DECIMAL(5,2),
    result              VARCHAR(20),  -- PASS, FAIL, EXTEND
    comments            TEXT,
    status              VARCHAR(20) DEFAULT 'PENDING',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 14. RECRUITMENT (การสรรหา)
-- ============================================================================

CREATE TABLE exam_list (
    exam_id             BIGSERIAL PRIMARY KEY,
    exam_name           VARCHAR(300) NOT NULL,
    position_id         BIGINT REFERENCES position(position_id),
    org_id              BIGINT NOT NULL REFERENCES organization(org_id),
    announcement_date   DATE,
    expiry_date         DATE,
    total_candidates    INT DEFAULT 0,
    status              VARCHAR(20) DEFAULT 'ACTIVE',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exam_candidate (
    candidate_id        BIGSERIAL PRIMARY KEY,
    exam_id             BIGINT NOT NULL REFERENCES exam_list(exam_id),
    citizen_id          VARCHAR(13),
    title_id            BIGINT REFERENCES lookup_value(value_id),
    first_name          VARCHAR(200) NOT NULL,
    last_name           VARCHAR(200) NOT NULL,
    rank_number         INT,
    score               DECIMAL(8,2),
    status              VARCHAR(20) DEFAULT 'PENDING',
    appointed_date      DATE,
    appointed_org_id    BIGINT REFERENCES organization(org_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exam_list_request (
    request_id          BIGSERIAL PRIMARY KEY,
    exam_id             BIGINT NOT NULL REFERENCES exam_list(exam_id),
    requesting_org_id   BIGINT NOT NULL REFERENCES organization(org_id),
    number_requested    INT NOT NULL,
    reason              TEXT,
    status              VARCHAR(20) DEFAULT 'PENDING',
    approved_by         BIGINT REFERENCES users(user_id),
    request_date        DATE,
    approved_date       DATE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE appointment_order (
    order_id            BIGSERIAL PRIMARY KEY,
    order_number        VARCHAR(100) NOT NULL,
    order_date          DATE NOT NULL,
    order_type          VARCHAR(50),
    report_date         DATE,
    status              VARCHAR(20) DEFAULT 'PENDING',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE appointment_order_detail (
    detail_id           BIGSERIAL PRIMARY KEY,
    order_id            BIGINT NOT NULL REFERENCES appointment_order(order_id),
    candidate_id        BIGINT REFERENCES exam_candidate(candidate_id),
    personnel_id        BIGINT REFERENCES personnel(personnel_id),
    position_id         BIGINT REFERENCES position(position_id),
    org_id              BIGINT REFERENCES organization(org_id),
    reported_date       DATE,
    status              VARCHAR(20) DEFAULT 'PENDING',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 15. ORDERS & COMMANDS (การจัดการคำสั่ง)
-- ============================================================================

CREATE TABLE order_type (
    type_id             BIGSERIAL PRIMARY KEY,
    type_code           VARCHAR(50) NOT NULL UNIQUE,
    type_name           VARCHAR(200) NOT NULL,
    personnel_type_id   BIGINT REFERENCES lookup_value(value_id),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE movement_type (
    movement_id         BIGSERIAL PRIMARY KEY,
    movement_code       VARCHAR(50) NOT NULL UNIQUE,
    movement_name       VARCHAR(200) NOT NULL,
    order_type_id       BIGINT REFERENCES order_type(type_id),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE personnel_order (
    order_id            BIGSERIAL PRIMARY KEY,
    order_number        VARCHAR(100),
    order_date          DATE,
    order_type_id       BIGINT NOT NULL REFERENCES order_type(type_id),
    movement_type_id    BIGINT REFERENCES movement_type(movement_id),
    subject             TEXT,
    effective_date      DATE,
    org_id              BIGINT REFERENCES organization(org_id),
    cover_page_template VARCHAR(200),
    attachment_template VARCHAR(200),
    status              VARCHAR(20) DEFAULT 'DRAFT',
    signer_id           BIGINT REFERENCES authorized_signer(signer_id),
    signed_date         DATE,
    created_by          BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE personnel_order_detail (
    detail_id           BIGSERIAL PRIMARY KEY,
    order_id            BIGINT NOT NULL REFERENCES personnel_order(order_id),
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    sequence_number     INT,
    from_position_id    BIGINT REFERENCES position(position_id),
    to_position_id      BIGINT REFERENCES position(position_id),
    from_org_id         BIGINT REFERENCES organization(org_id),
    to_org_id           BIGINT REFERENCES organization(org_id),
    from_salary         DECIMAL(12,2),
    to_salary           DECIMAL(12,2),
    effective_date      DATE,
    remarks             TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 16. TRANSFER & SECONDMENT (ย้าย/โอน/ช่วยราชการ)
-- ============================================================================

CREATE TABLE transfer_request (
    request_id          BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    request_type        VARCHAR(20) NOT NULL,  -- TRANSFER, SECONDMENT
    from_org_id         BIGINT REFERENCES organization(org_id),
    to_org_id           BIGINT REFERENCES organization(org_id),
    from_position_id    BIGINT REFERENCES position(position_id),
    to_position_id      BIGINT REFERENCES position(position_id),
    reason              TEXT,
    desired_date        DATE,
    status              VARCHAR(20) DEFAULT 'PENDING',
    approved_by         BIGINT REFERENCES users(user_id),
    order_id            BIGINT REFERENCES personnel_order(order_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 17. TRAINING & DEVELOPMENT (การพัฒนาบุคลากร)
-- ============================================================================

CREATE TABLE training_course (
    course_id           BIGSERIAL PRIMARY KEY,
    course_code         VARCHAR(50) UNIQUE,
    course_name         VARCHAR(300) NOT NULL,
    course_name_en      VARCHAR(300),
    description         TEXT,
    course_type_id      BIGINT REFERENCES lookup_value(value_id),
    duration_hours      DECIMAL(6,2),
    duration_days       DECIMAL(5,1),
    provider            VARCHAR(300),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE trainer (
    trainer_id          BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT REFERENCES personnel(personnel_id),
    title_id            BIGINT REFERENCES lookup_value(value_id),
    first_name          VARCHAR(200) NOT NULL,
    last_name           VARCHAR(200) NOT NULL,
    organization        VARCHAR(300),
    expertise           TEXT,
    phone               VARCHAR(50),
    email               VARCHAR(255),
    is_internal         BOOLEAN DEFAULT FALSE,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE training_activity (
    activity_id         BIGSERIAL PRIMARY KEY,
    course_id           BIGINT REFERENCES training_course(course_id),
    activity_name       VARCHAR(300) NOT NULL,
    activity_type_id    BIGINT REFERENCES lookup_value(value_id),
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    location            VARCHAR(300),
    budget              DECIMAL(15,2),
    max_participants    INT,
    status              VARCHAR(20) DEFAULT 'PLANNED',
    org_id              BIGINT REFERENCES organization(org_id),
    created_by          BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE training_participant (
    participant_id      BIGSERIAL PRIMARY KEY,
    activity_id         BIGINT NOT NULL REFERENCES training_activity(activity_id),
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    registration_date   DATE,
    attendance_status   VARCHAR(20) DEFAULT 'REGISTERED',
    score               DECIMAL(5,2),
    result              VARCHAR(20),  -- PASS, FAIL, INCOMPLETE
    certificate_number  VARCHAR(100),
    remarks             TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (activity_id, personnel_id)
);

CREATE TABLE training_activity_trainer (
    id                  BIGSERIAL PRIMARY KEY,
    activity_id         BIGINT NOT NULL REFERENCES training_activity(activity_id),
    trainer_id          BIGINT NOT NULL REFERENCES trainer(trainer_id),
    role                VARCHAR(50) DEFAULT 'LECTURER',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (activity_id, trainer_id)
);

CREATE TABLE study_leave (
    leave_id            BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    study_type_id       BIGINT REFERENCES lookup_value(value_id),
    institution_name    VARCHAR(300),
    country_id          BIGINT REFERENCES lookup_value(value_id),
    program_name        VARCHAR(300),
    degree_level_id     BIGINT REFERENCES lookup_value(value_id),
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    scholarship_type_id BIGINT REFERENCES lookup_value(value_id),
    status              VARCHAR(20) DEFAULT 'ACTIVE',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 18. DISCIPLINE (วินัย)
-- ============================================================================

CREATE TABLE fact_finding (
    finding_id          BIGSERIAL PRIMARY KEY,
    case_number         VARCHAR(100),
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    allegation          TEXT NOT NULL,
    investigator_id     BIGINT REFERENCES personnel(personnel_id),
    start_date          DATE,
    end_date            DATE,
    finding_result      TEXT,
    status              VARCHAR(20) DEFAULT 'OPEN',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE disciplinary_investigation (
    investigation_id    BIGSERIAL PRIMARY KEY,
    finding_id          BIGINT REFERENCES fact_finding(finding_id),
    case_number         VARCHAR(100),
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    charge              TEXT NOT NULL,
    committee_order     VARCHAR(200),
    committee_date      DATE,
    investigation_result TEXT,
    recommended_action  TEXT,
    status              VARCHAR(20) DEFAULT 'OPEN',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE disciplinary_order (
    discipline_id       BIGSERIAL PRIMARY KEY,
    investigation_id    BIGINT REFERENCES disciplinary_investigation(investigation_id),
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    order_id            BIGINT REFERENCES personnel_order(order_id),
    punishment_type_id  BIGINT REFERENCES lookup_value(value_id),
    description         TEXT,
    effective_date      DATE,
    status              VARCHAR(20) DEFAULT 'ACTIVE',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 19. CAREER PATH (เส้นทางความก้าวหน้าทางอาชีพ)
-- ============================================================================

CREATE TABLE career_path (
    path_id             BIGSERIAL PRIMARY KEY,
    path_name           VARCHAR(300) NOT NULL,
    job_series_id       BIGINT REFERENCES lookup_value(value_id),
    description         TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE career_path_step (
    step_id             BIGSERIAL PRIMARY KEY,
    path_id             BIGINT NOT NULL REFERENCES career_path(path_id),
    step_number         INT NOT NULL,
    position_level_id   BIGINT REFERENCES lookup_value(value_id),
    position_type_id    BIGINT REFERENCES lookup_value(value_id),
    min_years_exp       INT,
    required_education_id BIGINT REFERENCES lookup_value(value_id),
    required_training   TEXT,
    description         TEXT,
    UNIQUE (path_id, step_number)
);

CREATE TABLE career_progress_tracking (
    tracking_id         BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    path_id             BIGINT NOT NULL REFERENCES career_path(path_id),
    current_step_id     BIGINT REFERENCES career_path_step(step_id),
    target_step_id      BIGINT REFERENCES career_path_step(step_id),
    progress_percent    DECIMAL(5,2),
    last_reviewed       DATE,
    remarks             TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 20. SERVICES (การให้บริการ)
-- ============================================================================

CREATE TABLE business_card_request (
    request_id          BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    card_template_id    BIGINT REFERENCES lookup_value(value_id),
    display_name        VARCHAR(200),
    display_name_en     VARCHAR(200),
    display_position    VARCHAR(300),
    display_org         VARCHAR(300),
    phone               VARCHAR(50),
    email               VARCHAR(255),
    quantity            INT DEFAULT 100,
    status              VARCHAR(20) DEFAULT 'PENDING',
    approved_by         BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gov_id_card_request (
    request_id          BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    request_type        VARCHAR(20) NOT NULL,  -- NEW, RENEW, REPLACE
    reason              TEXT,
    photo_path          VARCHAR(500),
    status              VARCHAR(20) DEFAULT 'PENDING',
    approved_by         BIGINT REFERENCES users(user_id),
    card_number         VARCHAR(50),
    issue_date          DATE,
    expiry_date         DATE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE asset_declaration (
    declaration_id      BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    declaration_date    DATE NOT NULL,
    declaration_type_id BIGINT REFERENCES lookup_value(value_id),
    total_assets        DECIMAL(15,2),
    total_liabilities   DECIMAL(15,2),
    status              VARCHAR(20) DEFAULT 'SUBMITTED',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 21. NOTIFICATION (ระบบแจ้งเตือน)
-- ============================================================================

CREATE TABLE notification_config (
    config_id           BIGSERIAL PRIMARY KEY,
    event_type          VARCHAR(100) NOT NULL UNIQUE,
    notification_channel VARCHAR(50) DEFAULT 'EMAIL',
    template_subject    VARCHAR(500),
    template_body       TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notification (
    notification_id     BIGSERIAL PRIMARY KEY,
    config_id           BIGINT REFERENCES notification_config(config_id),
    recipient_user_id   BIGINT REFERENCES users(user_id),
    subject             VARCHAR(500),
    body                TEXT,
    channel             VARCHAR(50) DEFAULT 'EMAIL',
    status              VARCHAR(20) DEFAULT 'PENDING',
    sent_at             TIMESTAMP,
    read_at             TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_message (
    message_id          BIGSERIAL PRIMARY KEY,
    message_type_id     BIGINT REFERENCES lookup_value(value_id),
    title               VARCHAR(300) NOT NULL,
    body                TEXT,
    priority            VARCHAR(10) DEFAULT 'NORMAL',
    target_audience     VARCHAR(50),  -- ALL, ROLE, ORG, INDIVIDUAL
    target_id           BIGINT,
    publish_date        TIMESTAMP,
    expiry_date         TIMESTAMP,
    is_active           BOOLEAN DEFAULT TRUE,
    created_by          BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 22. COMMUNICATION (ระบบสื่อสาร)
-- ============================================================================

CREATE TABLE inbox_message (
    message_id          BIGSERIAL PRIMARY KEY,
    sender_user_id      BIGINT REFERENCES users(user_id),
    recipient_user_id   BIGINT NOT NULL REFERENCES users(user_id),
    subject             VARCHAR(500),
    body                TEXT,
    is_read             BOOLEAN DEFAULT FALSE,
    read_at             TIMESTAMP,
    is_archived         BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE forum_topic (
    topic_id            BIGSERIAL PRIMARY KEY,
    title               VARCHAR(300) NOT NULL,
    body                TEXT,
    category_id         BIGINT REFERENCES lookup_value(value_id),
    author_user_id      BIGINT NOT NULL REFERENCES users(user_id),
    view_count          INT DEFAULT 0,
    reply_count         INT DEFAULT 0,
    is_pinned           BOOLEAN DEFAULT FALSE,
    is_locked           BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE forum_reply (
    reply_id            BIGSERIAL PRIMARY KEY,
    topic_id            BIGINT NOT NULL REFERENCES forum_topic(topic_id),
    parent_reply_id     BIGINT REFERENCES forum_reply(reply_id),
    body                TEXT NOT NULL,
    author_user_id      BIGINT NOT NULL REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_room (
    room_id             BIGSERIAL PRIMARY KEY,
    room_name           VARCHAR(200),
    room_type           VARCHAR(20) DEFAULT 'PRIVATE',  -- PRIVATE, GROUP
    created_by          BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_room_member (
    member_id           BIGSERIAL PRIMARY KEY,
    room_id             BIGINT NOT NULL REFERENCES chat_room(room_id),
    user_id             BIGINT NOT NULL REFERENCES users(user_id),
    joined_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (room_id, user_id)
);

CREATE TABLE chat_message (
    message_id          BIGSERIAL PRIMARY KEY,
    room_id             BIGINT NOT NULL REFERENCES chat_room(room_id),
    sender_user_id      BIGINT NOT NULL REFERENCES users(user_id),
    message_text        TEXT NOT NULL,
    attachment_path     VARCHAR(500),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 23. TASK NOTIFICATION / WORKFLOW (ระบบแจ้งงาน)
-- ============================================================================

CREATE TABLE task_notification (
    task_id             BIGSERIAL PRIMARY KEY,
    task_type_id        BIGINT REFERENCES lookup_value(value_id),
    title               VARCHAR(300) NOT NULL,
    description         TEXT,
    assigned_to         BIGINT NOT NULL REFERENCES users(user_id),
    assigned_by         BIGINT REFERENCES users(user_id),
    due_date            DATE,
    priority            VARCHAR(10) DEFAULT 'NORMAL',
    status              VARCHAR(20) DEFAULT 'PENDING',
    reference_type      VARCHAR(50),
    reference_id        BIGINT,
    completed_at        TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 24. DATA EXCHANGE / API (การถ่ายโอนข้อมูล)
-- ============================================================================

CREATE TABLE open_api_config (
    api_id              BIGSERIAL PRIMARY KEY,
    api_name            VARCHAR(200) NOT NULL,
    api_key             VARCHAR(500),
    endpoint_url        VARCHAR(500),
    method              VARCHAR(10) DEFAULT 'GET',
    description         TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_by          BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE data_export_log (
    export_id           BIGSERIAL PRIMARY KEY,
    export_type         VARCHAR(100) NOT NULL,
    export_format       VARCHAR(20),
    file_path           VARCHAR(500),
    record_count        INT,
    status              VARCHAR(20) DEFAULT 'COMPLETED',
    exported_by         BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE data_import_log (
    import_id           BIGSERIAL PRIMARY KEY,
    import_type         VARCHAR(100) NOT NULL,
    file_path           VARCHAR(500),
    total_records       INT,
    success_records     INT,
    failed_records      INT,
    error_details       TEXT,
    status              VARCHAR(20) DEFAULT 'COMPLETED',
    imported_by         BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 25. REPORT CONFIGURATION (รายงาน)
-- ============================================================================

CREATE TABLE report_datasource (
    datasource_id       BIGSERIAL PRIMARY KEY,
    datasource_name     VARCHAR(200) NOT NULL,
    datasource_url      VARCHAR(500),
    datasource_type     VARCHAR(50),
    endpoint            VARCHAR(500),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE report_config (
    report_id           BIGSERIAL PRIMARY KEY,
    report_name         VARCHAR(300) NOT NULL,
    report_type         VARCHAR(50),  -- PIVOT, TABLE, CHART
    datasource_id       BIGINT REFERENCES report_datasource(datasource_id),
    query_template      TEXT,
    parameters          JSONB,
    is_active           BOOLEAN DEFAULT TRUE,
    created_by          BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 26. TERMS & CONDITIONS (ข้อกำหนดและเงื่อนไข)
-- ============================================================================

CREATE TABLE terms_and_conditions (
    terms_id            BIGSERIAL PRIMARY KEY,
    title               VARCHAR(300) NOT NULL,
    content             TEXT NOT NULL,
    version             INT DEFAULT 1,
    is_published        BOOLEAN DEFAULT FALSE,
    published_date      TIMESTAMP,
    remarks             TEXT,
    created_by          BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 27. ROYAL DECORATION (เครื่องราชอิสริยาภรณ์)
-- ============================================================================

CREATE TABLE royal_decoration (
    decoration_id       BIGSERIAL PRIMARY KEY,
    personnel_id        BIGINT NOT NULL REFERENCES personnel(personnel_id),
    decoration_type_id  BIGINT REFERENCES lookup_value(value_id),
    decoration_name     VARCHAR(300),
    received_date       DATE,
    gazette_number      VARCHAR(100),
    gazette_date        DATE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 28. USER DISPLAY PREFERENCES (ตั้งค่าการแสดงผล)
-- ============================================================================

CREATE TABLE user_display_preference (
    preference_id       BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users(user_id) UNIQUE,
    font_family         VARCHAR(100),
    font_size           INT,
    theme               VARCHAR(50),
    table_rows_per_page INT DEFAULT 10,
    table_style         VARCHAR(50),
    date_format         VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    year_format         VARCHAR(10) DEFAULT 'BE',  -- BE, CE
    id_card_format      VARCHAR(20),
    report_font         VARCHAR(100),
    report_font_size    INT,
    report_header_color VARCHAR(10),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
