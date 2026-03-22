---
phase: 02-backend-apis
plan: 02
subsystem: api
tags: [php, mysql, probation-tracking, rest-api, crud, thai-date, datediff]

requires:
  - phase: 01-database-foundation
    provides: probation_enrollment table, vw_probation_dashboard view, personnel/organization/position tables
  - phase: 02-backend-apis
    plan: 01
    provides: helpers.php (formatThaiDate, getLevelName), route delegation pattern in api.php
provides:
  - Probation tracking REST endpoints (GET list, GET detail, POST create, PUT update)
  - Dynamic remaining_days computation via DATEDIFF (never stored)
  - Summary counts (in_progress, near_deadline, overdue) for dashboard
affects: [03-frontend-integration]

tech-stack:
  added: []
  patterns: [probation-crud-via-view-and-direct-query, dynamic-set-clause-for-updates]

key-files:
  created:
    - backend/routes/probation.php
  modified:
    - backend/api.php
    - docker-compose.yaml

key-decisions:
  - "GET list uses vw_probation_dashboard view (pre-computed remaining_days + joins), GET detail queries probation_enrollment directly (view filters only IN_PROGRESS)"
  - "Summary counts (in_progress, near_deadline, overdue) computed in PHP from result set for simplicity"
  - "PUT update uses dynamic SET clause with allowed-fields whitelist for flexibility and security"

patterns-established:
  - "CRUD route handler pattern: single function dispatches to sub-functions by HTTP method"
  - "View for list, direct query for detail: use DB view for aggregated list, query base table for single-record detail"

requirements-completed: [PT-01, PT-02, PT-03, PT-04, PT-05]

duration: 3min
completed: 2026-03-22
---

# Phase 02 Plan 02: Probation Tracking API Summary

**Probation tracking CRUD endpoints with vw_probation_dashboard for list, DATEDIFF-based remaining_days computation, search/pagination/summary counts, and dynamic update with allowed-fields whitelist**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T02:32:32Z
- **Completed:** 2026-03-22T02:35:16Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- GET /probation returns list from vw_probation_dashboard with search, pagination, and summary counts (in_progress, near_deadline, overdue)
- GET /probation/{id} returns detailed enrollment info with all fields including extension and order data, remaining_days via DATEDIFF
- POST /probation creates enrollment with validation for personnel_id, program_id, start_date, end_date
- PUT /probation/{id} updates allowed fields dynamically with whitelist pattern
- Thai date formatting applied to all date fields in both list and detail responses
- Docker compose updated to mount education_level migration (07-add-education-level.sql)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create probation route handler with full CRUD** - `c87abb3` (feat)
2. **Task 2: Wire probation routes into api.php gateway** - `69eaf28` (feat)

## Files Created/Modified
- `backend/routes/probation.php` - Probation CRUD route handler with handleProbation function (253 lines)
- `backend/api.php` - Added case 'probation' to switch statement for route delegation
- `docker-compose.yaml` - Added 07-add-education-level.sql mount to db service volumes

## Decisions Made
- GET list endpoint uses vw_probation_dashboard view which already computes remaining_days via DATEDIFF and joins personnel/org/position data, avoiding redundant joins
- GET detail queries probation_enrollment directly instead of view, since view filters only IN_PROGRESS status and detail should show any status
- Summary counts computed in PHP loop over result set rather than separate COUNT queries for simplicity
- PUT update uses dynamic SET clause construction with allowed-fields whitelist for security and flexibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The 07-add-education-level.sql migration is now wired into docker-compose for automatic initialization.

## Known Stubs

None - all endpoints return computed data from database queries. No hardcoded/mock data.

## Next Phase Readiness
- All backend API endpoints complete: candidate list (Plan 01) and probation tracking (Plan 02)
- Phase 03 frontend integration can wire ProbationEndPage.vue to GET /probation endpoint
- Response format includes both snake_case fields and Thai-formatted date fields ready for UI rendering

## Self-Check: PASSED

- FOUND: backend/routes/probation.php
- FOUND: .planning/phases/02-backend-apis/02-02-SUMMARY.md
- FOUND: c87abb3 (Task 1 commit)
- FOUND: 69eaf28 (Task 2 commit)

---
*Phase: 02-backend-apis*
*Completed: 2026-03-22*
