# Roadmap: Smart Port — Candidate List & Probation Tracking

## Overview

This roadmap delivers two HR automation modules — Career Path Candidate List and Probation Tracking — to replace manual Excel workflows at the Ministry of Justice. The build follows a strict dependency chain: MySQL schema foundation first (everything depends on correct tables), then backend calculation engine and APIs (the core value — automated qualification computation), then frontend integration wiring live data into existing Vue 3 page shells. Coarse granularity compresses this into 3 phases.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Database Foundation** - Convert PostgreSQL schemas to MySQL 8.0, seed promotion criteria, create dashboard views
- [ ] **Phase 2: Backend APIs** - Build qualification engine, candidate list endpoints, probation endpoints, and shared utilities
- [ ] **Phase 3: Frontend Integration** - Wire candidate list and probation pages to live APIs with composables, stats, search, and Thai formatting

## Phase Details

### Phase 1: Database Foundation
**Goal**: All career path and probation tables exist in MySQL 8.0 with correct schema, seed data loaded for promotion criteria, and dashboard views computing dynamic values
**Depends on**: Nothing (first phase)
**Requirements**: DB-01, DB-02, DB-03, DB-04, DB-05, DB-06, DB-07
**Success Criteria** (what must be TRUE):
  1. Career path tables (promotion_criteria, qualification_calculation, and related tables) exist in MySQL 8.0 and accept INSERT/SELECT operations without errors
  2. Probation tracking tables (probation_enrollment, probation_program, and related tables) exist in MySQL 8.0 and accept INSERT/SELECT operations without errors
  3. The civil_servants table has current_level_start_date, current_level_code, and probation_end_date columns available
  4. Promotion criteria seed data returns correct year thresholds when queried (e.g., K1 to K2 with bachelor degree returns 6 years)
  5. Views vw_probation_dashboard, vw_job_series_tenure, and vw_executive_tenure return results with dynamically computed remaining_days via DATEDIFF
**Plans**: TBD

Plans:
- [ ] 01-01: Career path schema conversion and seed data
- [ ] 01-02: Probation schema conversion and views

### Phase 2: Backend APIs
**Goal**: PHP backend provides working REST endpoints for candidate list qualification queries and probation enrollment CRUD, with a data-driven qualification engine that reads rules from the database
**Depends on**: Phase 1
**Requirements**: CL-01, CL-02, CL-03, CL-04, CL-05, PT-01, PT-02, PT-03, PT-04, PT-05, SH-01, SH-02
**Success Criteria** (what must be TRUE):
  1. GET /candidates/:targetLevel returns a list of personnel with computed qualification status (qualified/not yet/check data), remaining days, and qualification date
  2. GET /candidates/:targetLevel/:personnelId returns a detailed breakdown showing tenure calculation and education-dependent year threshold
  3. Qualification engine correctly applies education-aware rules (e.g., K1 to K2 = 6 years for bachelor, 4 for master, 2 for doctorate)
  4. GET /probation returns enrollment list with dynamically computed remaining days and status
  5. POST /probation and PUT /probation/:enrollmentId create and update enrollments successfully
**Plans**: TBD

Plans:
- [ ] 02-01: Qualification engine and candidate list API
- [ ] 02-02: Probation tracking API and shared utilities

### Phase 3: Frontend Integration
**Goal**: Candidate List and Probation pages display live data from the backend with full tab navigation, stat cards, search/filter, color-coded status badges, and Thai date formatting
**Depends on**: Phase 2
**Requirements**: CL-06, CL-07, CL-08, CL-09, CL-10, CL-11, CL-12, CL-13, CL-14, PT-06, PT-07, PT-08, PT-09, PT-10, PT-11, SH-03, SH-04
**Success Criteria** (what must be TRUE):
  1. Candidate List page shows 4 tabs (General, Academic, Management-pending, Executive-pending) with sub-tabs for each promotion path, all populated from live API data
  2. Each candidate list sub-tab displays stat cards (total, qualified, not yet qualified) and a sortable table with name, position, level, level start date, qualification date, remaining days, and status badge
  3. Probation page displays enrollment list with color-coded remaining days (green >30, yellow 15-30, orange 7-14, red <7) and status badges (IN_PROGRESS, COMPLETED, FAILED, EXTENDED)
  4. Search and filter work on both pages — filtering by name, position, and (for probation) department
  5. All dates display in Thai Buddhist Era format and level codes display as Thai names

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Database Foundation | 0/2 | Not started | - |
| 2. Backend APIs | 0/2 | Not started | - |
| 3. Frontend Integration | 0/2 | Not started | - |
