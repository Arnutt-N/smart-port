-- ============================================================================
-- 13-multiplier-time-counting.sql
-- การนับเวลาราชการเป็นทวีคูณ
--
-- Scope for first vertical slice (#19):
-- - master data table for special-area multiplier periods
-- - record table for future multiplier entries
-- - provisional seed for page/lookup shell
--
-- Data governance note:
-- The seed below is user-approved to unblock development after Phase 0 was
-- explicitly skipped. Legal/source references remain marked SOURCE_PENDING and
-- must be replaced before production use. Satun is intentionally omitted until
-- the four eligible districts are confirmed; do not seed Satun as whole province.
-- ============================================================================

CREATE TABLE special_area_multiplier (
    area_multiplier_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    province VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    district_key VARCHAR(100) GENERATED ALWAYS AS (COALESCE(district, '__ALL__')) VIRTUAL,
    basis_type VARCHAR(50) NOT NULL,
    multiplier_ratio DECIMAL(5,2) NOT NULL,
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    legal_reference VARCHAR(300),
    source_reference VARCHAR(500),
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (multiplier_ratio >= 100.00),
    CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_area_multiplier_lookup
    ON special_area_multiplier(province, district, is_active, effective_start_date, effective_end_date);

CREATE UNIQUE INDEX uq_area_multiplier_exact_period
    ON special_area_multiplier(province, district_key, basis_type, effective_start_date);

CREATE TABLE multiplier_experience (
    multiplier_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    area_multiplier_id BIGINT NOT NULL,
    province VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    basis_type VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    eligible_start_date DATE NOT NULL,
    eligible_end_date DATE NOT NULL,
    service_days INT,
    eligible_days INT,
    multiplier_ratio DECIMAL(5,2) DEFAULT 200.00,
    effective_days DECIMAL(10,2),
    bonus_days DECIMAL(10,2),
    net_end_date DATE,
    net_years INT,
    net_months INT,
    net_day_remainder INT,
    proof_reference VARCHAR(500),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (area_multiplier_id) REFERENCES special_area_multiplier(area_multiplier_id),
    CHECK (end_date >= start_date),
    CHECK (eligible_end_date >= eligible_start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_multiplier_exp_pid ON multiplier_experience(personnel_id);
CREATE INDEX idx_multiplier_exp_area ON multiplier_experience(area_multiplier_id);

INSERT INTO special_area_multiplier
  (province, district, basis_type, multiplier_ratio, effective_start_date, effective_end_date, legal_reference, source_reference, is_active)
VALUES
  ('ยะลา', NULL, 'MARTIAL_LAW', 200.00, '2004-01-26', '2004-09-30', 'SOURCE_PENDING: user-approved development seed', 'GitHub #18 / docs/multiplier_phase0_validation_pack.md', 1),
  ('ปัตตานี', NULL, 'MARTIAL_LAW', 200.00, '2004-01-26', '2004-09-30', 'SOURCE_PENDING: user-approved development seed', 'GitHub #18 / docs/multiplier_phase0_validation_pack.md', 1),
  ('นราธิวาส', NULL, 'MARTIAL_LAW', 200.00, '2004-01-26', '2004-09-30', 'SOURCE_PENDING: user-approved development seed', 'GitHub #18 / docs/multiplier_phase0_validation_pack.md', 1),
  ('สงขลา', 'เทพา', 'MARTIAL_LAW', 200.00, '2004-01-26', '2004-09-30', 'SOURCE_PENDING: user-approved development seed', 'GitHub #18 / docs/multiplier_phase0_validation_pack.md', 1),
  ('สงขลา', 'สะบ้าย้อย', 'MARTIAL_LAW', 200.00, '2004-01-26', '2004-09-30', 'SOURCE_PENDING: user-approved development seed', 'GitHub #18 / docs/multiplier_phase0_validation_pack.md', 1),
  ('สงขลา', 'นาทวี', 'MARTIAL_LAW', 200.00, '2004-01-26', '2004-09-30', 'SOURCE_PENDING: user-approved development seed', 'GitHub #18 / docs/multiplier_phase0_validation_pack.md', 1),
  ('สงขลา', 'จะนะ', 'MARTIAL_LAW', 200.00, '2004-01-26', '2004-09-30', 'SOURCE_PENDING: user-approved development seed', 'GitHub #18 / docs/multiplier_phase0_validation_pack.md', 1);
