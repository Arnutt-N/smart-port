---
phase: 01-database-foundation
plan: 01
subsystem: database
tags: [mysql, career-path, promotion-criteria, views, seed-data, schema-conversion]

# Dependency graph
requires: []
provides:
  - "9 personnel foundation tables (7 stubs + personnel + personnel_position_history)"
  - "11 career path tables converted from PostgreSQL to MySQL 8.0"
  - "2 career path views (vw_job_series_tenure, vw_executive_tenure) with DATEDIFF"
  - "8 promotion criteria seed rows (5 K-series, 3 O-series)"
  - "7 sample personnel records with position history"
affects: [01-database-foundation, 02-backend-api, 03-frontend-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [postgresql-to-mysql-conversion, stub-table-pattern, bigint-auto-increment, tinyint-boolean]

key-files:
  created:
    - database/03-personnel-stubs.sql
    - database/04-career-path.sql
    - database/06-seed-data.sql
  modified: []

key-decisions:
  - "Created personnel as new full table (not ALTER on civil_servants) per D-01/D-02"
  - "All PostgreSQL BIGSERIAL converted to BIGINT AUTO_INCREMENT, BOOLEAN to TINYINT(1)"
  - "Views use DATEDIFF(COALESCE(end_date,CURDATE()), effective_date) for MySQL date arithmetic"
  - "O-series seed data uses VOCATIONAL_CERT/HIGH_VOCATIONAL education conditions (MEDIUM confidence)"

patterns-established:
  - "MySQL table convention: ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  - "Stub table pattern: PK + identifying column(s) + created_at for FK satisfaction"
  - "FK ordering: stub tables before personnel before personnel_position_history"
  - "View pattern: DROP VIEW IF EXISTS before CREATE VIEW (MySQL does not support CREATE OR REPLACE VIEW)"

requirements-completed: [DB-01, DB-03, DB-04, DB-05, DB-07]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 01 Plan 01: Personnel Foundation Summary

**MySQL 8.0 schema with 20 tables, 2 DATEDIFF views, and K/O-series promotion criteria seed data for career path candidate list features**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T20:47:57Z
- **Completed:** 2026-03-21T20:52:23Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments
- 9 personnel foundation tables created (7 stubs satisfying all downstream FK constraints + personnel with level tracking + personnel_position_history for views)
- 11 career path tables fully converted from PostgreSQL to MySQL 8.0 (no BIGSERIAL, BOOLEAN, date subtraction, or COMMENT ON remaining)
- 2 views (vw_job_series_tenure, vw_executive_tenure) using DATEDIFF for Thai civil service tenure calculations
- 8 promotion criteria seed rows covering K1->K2 (by education), K2->K3, K3->K4, O1->O2 (by education), O2->O3
- 7 sample personnel with varied levels and tenure dates plus 5 position history entries for view verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Create 03-personnel-stubs.sql** - `5a37e1b` (feat)
2. **Task 2: Create 04-career-path.sql** - `6dc3281` (feat)
3. **Task 3: Create 06-seed-data.sql** - `3b5a3a4` (feat)

## Files Created/Modified
- `database/03-personnel-stubs.sql` - 9 tables: 7 stub tables + personnel (with level tracking & probation columns) + personnel_position_history
- `database/04-career-path.sql` - 11 career path tables + 4 indexes + 2 views, all converted from PostgreSQL
- `database/06-seed-data.sql` - Promotion criteria seed data, sample personnel, position history entries

## Decisions Made
- Created personnel as new full table per D-01 (not ALTER on existing civil_servants per D-02)
- Included current_level_start_date, current_level_code directly in CREATE TABLE (not ALTER, since table is new)
- Used TINYINT(1) for all boolean columns with 0/1 defaults (not TRUE/FALSE)
- O-series education conditions use VOCATIONAL_CERT and HIGH_VOCATIONAL (not BACHELOR/MASTER) since general track uses vocational education levels
- Views use CURDATE() instead of CURRENT_DATE for MySQL idiom consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all files contain real schema definitions and seed data. No placeholder data flows to UI.

## Next Phase Readiness
- All career path tables ready for backend API development (Phase 2)
- Views vw_job_series_tenure and vw_executive_tenure ready for query integration
- Promotion criteria seed data ready for qualification calculation logic
- Note: 05-probation.sql (Plan 02 of this phase) still needed for probation tracking tables

## Self-Check: PASSED

All 3 created files verified on disk. All 3 task commits verified in git log.

---
*Phase: 01-database-foundation*
*Completed: 2026-03-22*
