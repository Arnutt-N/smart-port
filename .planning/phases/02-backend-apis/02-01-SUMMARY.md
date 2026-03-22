---
phase: 02-backend-apis
plan: 01
subsystem: api
tags: [php, mysql, qualification-engine, thai-date, level-mapping, candidate-list, rest-api]

requires:
  - phase: 01-database-foundation
    provides: personnel table, promotion_criteria table, seed data for K/O series
provides:
  - QualificationEngine class with computeForLevel and computeDetail methods
  - Thai date formatting helper (Buddhist Era conversion)
  - Level code to Thai name mapping helper (12 codes)
  - Candidate list REST endpoints (GET /candidates/{level}, GET /candidates/{level}/{id})
  - education_level column on personnel table
affects: [02-02, 03-frontend-integration]

tech-stack:
  added: []
  patterns: [route-file-delegation, engine-class-with-pdo-injection, education-aware-criteria-matching]

key-files:
  created:
    - database/07-add-education-level.sql
    - backend/helpers.php
    - backend/QualificationEngine.php
    - backend/routes/candidates.php
  modified:
    - backend/api.php

key-decisions:
  - "Route delegation pattern: api.php includes routes/candidates.php and calls handleCandidates() instead of inline switch logic"
  - "Education-aware matching via LEFT JOIN with OR condition (exact match OR 'ANY') on promotion_criteria"
  - "DATE_ADD with CAST(min_years AS UNSIGNED) for leap-year-safe qualification date computation"
  - "Summary counts computed via subquery wrapping the main SELECT for consistency"

patterns-established:
  - "Route file pattern: backend/routes/{feature}.php with handle{Feature}(PDO, method, path) signature"
  - "Engine class pattern: PDO injected via constructor, methods return structured arrays with success/data/pagination"
  - "Helper functions: standalone PHP functions (no class), included via include_once"

requirements-completed: [CL-01, CL-02, CL-03, CL-04, CL-05, SH-01, SH-02]

duration: 3min
completed: 2026-03-22
---

# Phase 02 Plan 01: Candidate List API Summary

**QualificationEngine with education-aware promotion criteria matching, DATE_ADD-based qualification date computation, Thai date/level helpers, and candidate list REST endpoints with search, pagination, and summary counts**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T02:24:00Z
- **Completed:** 2026-03-22T02:27:51Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- QualificationEngine computes qualification status using promotion_criteria with education-aware matching (BACHELOR 6yr, MASTER 4yr, DOCTORATE 2yr for K1->K2)
- GET /candidates/{targetLevel} returns personnel list with computed status (qualified/not_yet/check_data), remaining_days, summary counts, search, and pagination
- GET /candidates/{targetLevel}/{id} returns individual qualification detail with Thai formatted dates
- Shared helpers provide formatThaiDate (Buddhist Era + 543) and getLevelName (12 level codes mapped to Thai)
- education_level column added to personnel with varied test data for 7 sample records

## Task Commits

Each task was committed atomically:

1. **Task 1: Create education_level migration and shared helpers** - `b9285cb` (feat)
2. **Task 2: Build QualificationEngine and candidate list routes with api.php wiring** - `744654d` (feat)

## Files Created/Modified
- `database/07-add-education-level.sql` - ALTER TABLE adding education_level + 7 UPDATE statements for test data
- `backend/helpers.php` - formatThaiDate() and getLevelName() standalone utility functions
- `backend/QualificationEngine.php` - Core qualification computation class with computeForLevel and computeDetail
- `backend/routes/candidates.php` - Route handler for GET /candidates/{level} and /candidates/{level}/{id}
- `backend/api.php` - Replaced old civil_servants candidates case with route delegation to routes/candidates.php

## Decisions Made
- Used route file delegation pattern (include + function call) to keep api.php switch/case clean, establishing pattern for future route files
- Education-aware criteria matching uses LEFT JOIN with dual condition (exact education match OR 'ANY') rather than post-query PHP filtering
- DATE_ADD with CAST(min_years AS UNSIGNED) chosen over raw arithmetic for leap-year safety
- Summary counts computed via subquery wrapping the main SELECT to ensure consistency between list and counts
- check_data status assigned when current_level_code, current_level_start_date, or min_years is NULL

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The SQL migration (07-add-education-level.sql) needs to be wired into docker-compose or run manually against the database.

## Known Stubs

None - all endpoints return computed data from database queries. No hardcoded/mock data.

## Next Phase Readiness
- QualificationEngine and helpers ready for reuse by Plan 02 (probation endpoints)
- Route file pattern established for probation route handler
- API response format (success/data/summary/pagination) ready for Phase 3 frontend integration

---
*Phase: 02-backend-apis*
*Completed: 2026-03-22*
