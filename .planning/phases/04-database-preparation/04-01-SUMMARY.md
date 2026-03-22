---
phase: 04-database-preparation
plan: 01
subsystem: database
tags: [mysql, alter-table, generated-column, seed-data, docker]

requires:
  - phase: 03-personnel-stubs
    provides: "career path tables (supportive_job_series, diverse_experience)"
provides:
  - "ratio_percent column on supportive_job_series"
  - "STORED GENERATED diff_count on diverse_experience"
  - "14 directional seed rows for K-series supportive job mappings"
  - "Docker init script 08-career-path-v11.sql"
affects: [05-backend-apis, 06-frontend-candidate-list]

tech-stack:
  added: []
  patterns: [ALTER TABLE migration file pattern, STORED GENERATED columns]

key-files:
  created:
    - database/08-career-path-v11.sql
  modified:
    - docker-compose.yaml

key-decisions:
  - "Used MODIFY COLUMN for GENERATED conversion (table is empty, safe)"
  - "FK IDs set to NULL — name-based matching is the primary lookup mechanism"
  - "14 directional mappings cover K-series วิชาการ group only; O-series left for HR/admin UI"

patterns-established:
  - "Migration SQL naming: 08-career-path-v11.sql follows sequential numbering"
  - "Docker init wiring: volume mount to /docker-entrypoint-initdb.d/"

requirements-completed: [SE-01]

duration: 3min
completed: 2026-03-22
---

# Phase 04: Database Preparation Summary

**ALTER TABLE adds ratio_percent + GENERATED diff_count columns, 14 K-series directional seed mappings wired into Docker init**

## Performance

- **Duration:** 3 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `ratio_percent INT DEFAULT 100` to `supportive_job_series` via ALTER TABLE
- Converted `diff_count` from plain INT to STORED GENERATED column summing 4 boolean flags
- Inserted 14 directional seed rows covering K-series วิชาการ job series group (13 SAME_GROUP + 1 EXCLUSIVE)
- Wired `08-career-path-v11.sql` into docker-compose.yaml as init script #8

## Task Commits

1. **Task 1 + Task 2: Create migration SQL + Docker wiring** - `320b8f4` (feat)

## Files Created/Modified
- `database/08-career-path-v11.sql` - ALTER TABLEs + 14 seed INSERT rows with Thai series names
- `docker-compose.yaml` - Volume mount for 08 init script

## Decisions Made
- Used MODIFY COLUMN approach for GENERATED conversion — MySQL 8.0 supports non-generated to stored generated, and table is empty so no data loss risk
- Set FK ID columns to NULL in seed data — name-based matching is the primary lookup per research anti-patterns
- Scoped to 14 K-series mappings only; O-series and full PDF coverage deferred to HR admin UI

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema is ready for Phase 05 backend CRUD APIs
- `docker-compose down -v && docker-compose up` required to reinitialize database with new script

---
*Phase: 04-database-preparation*
*Completed: 2026-03-22*
