-- Smart Port multiplier time counting seed mockup
-- Purpose: shape/reference only. Do not run as production seed.
-- Phase 0 must confirm official areas, districts, legal references, and dates
-- before copying any row into a real database migration.

-- Required target table columns from the revised PRD:
-- special_area_multiplier(
--   province, district, basis_type, multiplier_ratio,
--   effective_start_date, effective_end_date,
--   legal_reference, source_reference, is_active
-- )

-- ---------------------------------------------------------------------------
-- Mockup A: initial martial-law period
-- Domain review finding: use 2004-01-26 to 2004-09-30, not the older draft
-- range 2004-01-05 to 2005-07-20.
-- ---------------------------------------------------------------------------

INSERT INTO special_area_multiplier
  (
    province,
    district,
    basis_type,
    multiplier_ratio,
    effective_start_date,
    effective_end_date,
    legal_reference,
    source_reference,
    is_active
  )
VALUES
  -- Province-level rows: keep only if Phase 0 confirms whole-province coverage.
  (
    'ยะลา',
    NULL,
    'MARTIAL_LAW',
    200.00,
    '2004-01-26',
    '2004-09-30',
    'TODO Phase 0: official cabinet/provincial reference',
    'TODO Phase 0: HR evidence file/page',
    1
  ),
  (
    'ปัตตานี',
    NULL,
    'MARTIAL_LAW',
    200.00,
    '2004-01-26',
    '2004-09-30',
    'TODO Phase 0: official cabinet/provincial reference',
    'TODO Phase 0: HR evidence file/page',
    1
  ),
  (
    'นราธิวาส',
    NULL,
    'MARTIAL_LAW',
    200.00,
    '2004-01-26',
    '2004-09-30',
    'TODO Phase 0: official cabinet/provincial reference',
    'TODO Phase 0: HR evidence file/page',
    1
  ),

  -- Songkhla district-level examples from the older draft.
  -- Phase 0 must confirm the final district list.
  (
    'สงขลา',
    'เทพา',
    'MARTIAL_LAW',
    200.00,
    '2004-01-26',
    '2004-09-30',
    'TODO Phase 0: official cabinet/provincial reference',
    'TODO Phase 0: HR evidence file/page',
    1
  ),
  (
    'สงขลา',
    'สะบ้าย้อย',
    'MARTIAL_LAW',
    200.00,
    '2004-01-26',
    '2004-09-30',
    'TODO Phase 0: official cabinet/provincial reference',
    'TODO Phase 0: HR evidence file/page',
    1
  ),
  (
    'สงขลา',
    'นาทวี',
    'MARTIAL_LAW',
    200.00,
    '2004-01-26',
    '2004-09-30',
    'TODO Phase 0: official cabinet/provincial reference',
    'TODO Phase 0: HR evidence file/page',
    1
  ),
  (
    'สงขลา',
    'จะนะ',
    'MARTIAL_LAW',
    200.00,
    '2004-01-26',
    '2004-09-30',
    'TODO Phase 0: official cabinet/provincial reference',
    'TODO Phase 0: HR evidence file/page',
    1
  ),

  -- Satun must NOT be seeded as whole province.
  -- Replace these placeholders with the confirmed four districts.
  (
    'สตูล',
    'TODO_PHASE0_CONFIRM_SATUN_DISTRICT_1',
    'MARTIAL_LAW',
    200.00,
    '2004-01-26',
    '2004-09-30',
    'TODO Phase 0: official cabinet/provincial reference',
    'TODO Phase 0: HR evidence file/page',
    1
  ),
  (
    'สตูล',
    'TODO_PHASE0_CONFIRM_SATUN_DISTRICT_2',
    'MARTIAL_LAW',
    200.00,
    '2004-01-26',
    '2004-09-30',
    'TODO Phase 0: official cabinet/provincial reference',
    'TODO Phase 0: HR evidence file/page',
    1
  ),
  (
    'สตูล',
    'TODO_PHASE0_CONFIRM_SATUN_DISTRICT_3',
    'MARTIAL_LAW',
    200.00,
    '2004-01-26',
    '2004-09-30',
    'TODO Phase 0: official cabinet/provincial reference',
    'TODO Phase 0: HR evidence file/page',
    1
  ),
  (
    'สตูล',
    'TODO_PHASE0_CONFIRM_SATUN_DISTRICT_4',
    'MARTIAL_LAW',
    200.00,
    '2004-01-26',
    '2004-09-30',
    'TODO Phase 0: official cabinet/provincial reference',
    'TODO Phase 0: HR evidence file/page',
    1
  );

-- ---------------------------------------------------------------------------
-- Mockup B: post-2548 emergency-decree coverage
-- Dates below are placeholders. Replace with official Phase 0 dates.
-- Keep as district/province scope only if the source document confirms it.
-- ---------------------------------------------------------------------------

INSERT INTO special_area_multiplier
  (
    province,
    district,
    basis_type,
    multiplier_ratio,
    effective_start_date,
    effective_end_date,
    legal_reference,
    source_reference,
    is_active
  )
VALUES
  (
    'ยะลา',
    NULL,
    'EMERGENCY_DECREE',
    200.00,
    'TODO_PHASE0_START_DATE',
    NULL,
    'TODO Phase 0: emergency decree reference',
    'TODO Phase 0: HR evidence file/page',
    0
  ),
  (
    'ปัตตานี',
    NULL,
    'EMERGENCY_DECREE',
    200.00,
    'TODO_PHASE0_START_DATE',
    NULL,
    'TODO Phase 0: emergency decree reference',
    'TODO Phase 0: HR evidence file/page',
    0
  ),
  (
    'นราธิวาส',
    NULL,
    'EMERGENCY_DECREE',
    200.00,
    'TODO_PHASE0_START_DATE',
    NULL,
    'TODO Phase 0: emergency decree reference',
    'TODO Phase 0: HR evidence file/page',
    0
  );

-- ---------------------------------------------------------------------------
-- Phase 0 validation helper queries
-- ---------------------------------------------------------------------------

-- 1) Whole-province Satun rows must be zero.
SELECT COUNT(*) AS satun_whole_province_rows
FROM special_area_multiplier
WHERE province = 'สตูล'
  AND district IS NULL
  AND is_active = 1;

-- 2) Active rows that share the same exact start date should be unique after
-- district NULL normalization. This mirrors the PRD district_key constraint.
SELECT
  province,
  COALESCE(district, '__ALL__') AS district_key,
  basis_type,
  effective_start_date,
  COUNT(*) AS duplicate_count
FROM special_area_multiplier
WHERE is_active = 1
GROUP BY
  province,
  COALESCE(district, '__ALL__'),
  basis_type,
  effective_start_date
HAVING COUNT(*) > 1;

-- 3) Potential same-scope active overlaps.
SELECT
  a.area_multiplier_id AS first_id,
  b.area_multiplier_id AS second_id,
  a.province,
  a.district,
  a.basis_type,
  a.effective_start_date AS first_start,
  a.effective_end_date AS first_end,
  b.effective_start_date AS second_start,
  b.effective_end_date AS second_end
FROM special_area_multiplier a
JOIN special_area_multiplier b
  ON a.area_multiplier_id < b.area_multiplier_id
 AND a.province = b.province
 AND COALESCE(a.district, '__ALL__') = COALESCE(b.district, '__ALL__')
 AND a.basis_type = b.basis_type
 AND a.is_active = 1
 AND b.is_active = 1
 AND a.effective_start_date <= COALESCE(b.effective_end_date, '9999-12-31')
 AND b.effective_start_date <= COALESCE(a.effective_end_date, '9999-12-31');
