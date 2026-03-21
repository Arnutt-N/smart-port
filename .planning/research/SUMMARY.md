# Project Research Summary

**Project:** Smart Port — Career Path Qualification Calculator & Probation Tracking
**Domain:** Thai Government HRIS Extension (Ministry of Justice)
**Researched:** 2026-03-22
**Confidence:** HIGH

## Executive Summary

This project adds two mission-critical HR automation modules to an existing Vue 3 + PHP 8.3 + MySQL 8.0 system: a Career Path Qualification Calculator (บัญชีรายชื่อผู้มีคุณสมบัติเลื่อนระดับ) and a Probation Tracking system (พ้นทดลองปฏิบัติราชการ). Both replace fragile Excel workflows that HR staff currently maintain manually. The recommended approach is a strict database-first build order: convert the PostgreSQL reference schemas to MySQL 8.0 first, seed the promotion criteria rules, build the backend calculation engine, then wire up the frontend pages that already exist as shells. The existing stack requires only three frontend additions (VueUse, date-fns, and @date-fns/tz); the backend needs no new Composer dependencies because PHP's native DateTime covers all required date arithmetic.

The central architectural decision is that qualification calculations must be server-side and data-driven — the `promotion_criteria` table encodes the Thai civil service rules (กฎ ก.พ.), and a `QualificationEngine.php` class evaluates them dynamically. Hardcoding promotion rules in PHP is the single highest-recovery-cost mistake this project can make. The system must handle four position types (ทั่วไป, วิชาการ, อำนวยการ, บริหาร) but should only fully implement the first two in Phase 1; อำนวยการ and บริหาร require screening lists and "3 differences" (3 ต่าง) logic that are significantly more complex and should be deferred.

The dominant technical risk is the PostgreSQL-to-MySQL schema conversion. The reference schemas use PostgreSQL date arithmetic that silently produces wrong numbers in MySQL (`date1 - date2` vs `DATEDIFF()`), plus PostgreSQL-only string concatenation (`||` vs `CONCAT()`). These errors are visually plausible and easy to miss, making them dangerous. A second major risk is Thai Buddhist Era (พ.ศ.) date handling — all database columns must store Gregorian dates, and any data imported from Excel requires year-conversion validation (year > 2400 indicates พ.ศ. not converted). Both risks must be addressed in Phase 1 before any backend code is written.

## Key Findings

### Recommended Stack

The existing stack (Vue 3.5, Pinia 3, Vue Router 4.5, Tailwind CSS 4, PHP 8.3, MySQL 8.0) is fixed and well-suited to this domain. Three frontend libraries should be added: VueUse for composable utilities (date formatting, interval refresh), date-fns v4 for tree-shakeable date arithmetic, and @date-fns/tz for Bangkok timezone consistency. The backend needs no new dependencies — PHP's built-in `DateTime`/`DateInterval`/`DateTimeImmutable` covers all calculation requirements. See `STACK.md` for full rationale and alternatives considered.

**Core technology additions:**
- `@vueuse/core ^14.2.1`: Composable utilities (`useIntervalFn`, `useDateFormat`, `useLocalStorage`, `useDebounce`) — tree-shakeable, battle-tested, requires Vue 3.5+ which is already in use
- `date-fns ^4.1.0`: Date arithmetic (`differenceInDays`, `addMonths`, `format`) — functional API, tree-shakeable, 34M weekly downloads, idiomatic with Vue 3 composition style
- `@date-fns/tz ^1.4.1`: Bangkok timezone (`Asia/Bangkok`) for consistent calculations when server runs UTC — prevents off-by-one day errors
- `PHP DateTime (built-in)`: No new Composer dependency needed — `DateInterval::diff()` handles all year/month/day arithmetic required for tenure calculations
- `MySQL EVENT SCHEDULER`: Nightly `remaining_days` refresh — runs inside the database container, no external cron infrastructure needed

**What NOT to use:** Moment.js (deprecated), Vuetify/Element Plus (conflicts with Tailwind 4 custom components), Carbon PHP (unnecessary for no-framework backend), TanStack Table (overkill for <200-row candidate lists), axios (not in the Vue 3 migration — use fetch with a composable wrapper).

### Expected Features

The system must replace Excel as the authoritative source for promotion eligibility and probation tracking. HR staff at the Ministry of Justice expect specific workflows: tab-based views matching their Excel mental model, color-coded urgency, and status badges. Missing table-stakes features means reversion to Excel. See `FEATURES.md` for full prioritization matrix and dependency tree.

**Must have (Phase 1 — table stakes):**
- MySQL schema conversion (career path + probation tables, 20+ tables, 3 views) — nothing works without this
- Promotion criteria seed data for O1->O2, O2->O3, K1->K2, K2->K3, K3->K4 — system is useless without rules loaded
- Qualification calculation engine — THE differentiator replacing manual Excel formulas
- Candidate List page with 4 tabs (ทั่วไป + วิชาการ functional, อำนวยการ + บริหาร show "อยู่ระหว่างพัฒนา")
- Sub-tabs per promotion path within each type
- Remaining days display with "ถึงเกณฑ์/ยังไม่ถึงเกณฑ์/Check Data" status badges
- Probation enrollment list with color-coded urgency (>30 green, 15-30 yellow, 7-14 orange, <7 red)
- Search/filter and summary stat cards on both pages

**Should have (Phase 1.5 — after core validation):**
- Detail/drill-down view per candidate (full qualification breakdown: tenure days, education, supportive days)
- Probation task checklist with per-enrollment progress tracking
- Supportive experience (เกื้อกูล) calculation — adds supportive days to qualifying days for K2/K3 paths
- Probation stakeholder display (mentor, supervisor, director per enrollment)
- Batch recalculation endpoint
- CSV export as interim report solution

**Defer (v2+):**
- อำนวยการ (M1/M2) and บริหาร (S1/S2) full implementation — requires screening lists, 3 ต่าง rules, position equivalence
- Email/notification alerts — requires email infrastructure, out of scope for Phase 1
- PDF report generation — Thai font handling is complex; browser print CSS is the interim solution
- Probation evaluation forms — multi-evaluator digital workflow requires organizational change management
- Probation committee management — committee creation, scheduling, and minutes tracking

### Architecture Approach

The recommended architecture extends the existing pattern (thin `api.php` router -> PDO -> MySQL) by extracting new feature logic into separate PHP files (`candidate_lists.php`, `probation.php`) and a central `QualificationEngine.php` class. The frontend extends the existing composable pattern with `useCandidates()` and `useProbation()` composables that encapsulate API calls, reactive state, and computed stats. MySQL VIEWs (`vw_candidate_list`, `vw_probation_dashboard`) pre-join complex queries so PHP service files query a single source. The critical entity bridge: new tables must reference `civil_servants.servant_id` (the production table), NOT a non-existent `personnel` table from the reference schemas. See `ARCHITECTURE.md` for component map, data flow diagrams, and build order.

**Major components:**
1. `QualificationEngine.php` — stateless PHP class; reads `promotion_criteria` dynamically; returns `QualificationResult` with qualified status, qualification date, remaining days, and breakdown; the most architecturally critical component
2. `CandidateListService.php` / `candidate_lists.php` — orchestrates qualification queries; queries `vw_candidate_list` VIEW; handles batch recalculation
3. `ProbationService.php` / `probation.php` — queries `vw_probation_dashboard` VIEW; manages enrollment CRUD and task progress
4. `useCandidates()` composable — fetches candidate list by position type, manages client-side search/filter state, derives stats as computed properties
5. `useProbation()` composable — fetches probation enrollments, computes color tier from remaining days
6. MySQL VIEWs (`vw_candidate_list`, `vw_probation_dashboard`) — pre-joined dashboard queries; compute `remaining_days` dynamically via `DATEDIFF(end_date, CURDATE())` — never stored as a stale column
7. Split migration files (03-08) — ordered by dependency to enable incremental testing and rollback

### Critical Pitfalls

The top pitfalls discovered across both features, ordered by recovery cost and likelihood of occurrence. See `PITFALLS.md` for full details including warning signs and recovery strategies.

1. **PostgreSQL date arithmetic in MySQL** — `date1 - date2` returns wrong values in MySQL (numeric subtraction, not day count). Replace ALL instances with `DATEDIFF(date1, date2)` during schema conversion. Create test queries with known date pairs to verify. Recovery cost: LOW if caught in Phase 1; HIGH if discovered after data is in production.

2. **Hardcoded promotion criteria in PHP** — Encoding level-specific rules (K1->K2 = 6 years, etc.) as if/else chains makes the system unmaintainable when OCSC circulars (ว.) change the rules. Build `QualificationEngine.php` to read rules from the `promotion_criteria` table dynamically. Test: adding a new promotion path should require only a DB row insert, no code change. Recovery cost: HIGH — requires full refactor.

3. **Thai Buddhist Era (พ.ศ.) date corruption** — Thai staff enter dates in พ.ศ. (CE + 543). If `2567` is stored in a MySQL DATE column without conversion, all tenure calculations produce nonsense (~negative 541 years). Rule: all DATE columns store Gregorian (CE); frontend converts for display; data imports validate that year > 2400 is พ.ศ. and subtract 543. Recovery cost: HIGH — requires data migration with risk of ambiguous records.

4. **Stale `remaining_days` columns** — Storing `remaining_days` as a column that is set at insert time and never updated means the probation urgency color codes become wrong within 24 hours. Solution: compute dynamically in VIEWs using `DATEDIFF(end_date, CURDATE())`. Never store remaining_days as a static value. Recovery cost: LOW but causes user distrust before discovery.

5. **PostgreSQL string concatenation and BOOLEAN in VIEWs** — `||` for string concat and `BOOLEAN` for true/false do not work the same way in MySQL. Use `CONCAT()` and `TINYINT(1)` throughout. Every VIEW must be tested individually in MySQL 8.0 after conversion. Recovery cost: LOW if caught during conversion testing.

## Implications for Roadmap

Based on the dependency chain identified in ARCHITECTURE.md and the pitfall risk profile from PITFALLS.md, the build order is non-negotiable: database tables must exist before backend code, and backend calculation must be correct before frontend integration. The most risky phase is Phase 2 (calculation engine); the most error-prone mechanical work is Phase 1 (schema conversion).

### Phase 1: Database Foundation

**Rationale:** All other phases depend on correct MySQL tables and seed data. The PostgreSQL-to-MySQL conversion is the highest-risk mechanical task and must be validated with test queries before any PHP or Vue work begins. Schema errors discovered later are expensive to fix with live data.

**Delivers:** Correct MySQL 8.0 tables for career path and probation domains; seed data for all Phase 1 promotion criteria; validated VIEWs that compute remaining_days dynamically.

**Addresses features:** MySQL schema conversion (P1), promotion criteria seed data (P1), Thai date formatting rules established.

**Avoids pitfalls:** PostgreSQL date arithmetic errors (Pitfall 1), stale remaining_days (Pitfall 4), PostgreSQL string concat/BOOLEAN issues (Pitfall 5), foreign key order errors.

**Build artifacts:**
- `03-career-path-tables.sql` — ALTER civil_servants + new career tables (bridge to `servant_id`)
- `04-probation-tables.sql` — ALTER civil_servants + new probation tables
- `05-career-path-views.sql` — `vw_candidate_list`, `vw_job_series_tenure`
- `06-probation-views.sql` — `vw_probation_dashboard`
- `07-seed-promotion-criteria.sql` — O1->O2, O2->O3, K1->K2, K2->K3, K3->K4 rules with all education conditions
- `08-seed-probation-programs.sql` — default probation task templates

**Research flag:** STANDARD — schema conversion is well-understood mechanical work. Checklist-driven, no additional research needed.

### Phase 2: Qualification Engine (Backend Core)

**Rationale:** This is the architecturally most critical and highest-risk component. The QualificationEngine encodes complex Thai civil service rules. It must be built and unit-tested before any frontend work begins. A correct engine that the frontend cannot yet display is safe; an incorrect engine that the frontend displays causes user distrust and potential legal/HR consequences.

**Delivers:** Working PHP calculation engine that reads `promotion_criteria` dynamically; REST endpoints for candidate list and probation; all backend API endpoints for Phase 1 features.

**Addresses features:** Qualification calculation engine (P1 HIGH), candidate list API (P1), probation enrollment API (P1).

**Avoids pitfalls:** Data-driven criteria engine (Pitfall 2), supportive experience rounding (Pitfall 6), N+1 query in qualification calculation (performance trap), role-based access control (security).

**Build artifacts:**
- `backend/QualificationEngine.php` — stateless class; reads promotion_criteria; returns QualificationResult
- `backend/CandidateListService.php` — query orchestration; batch recalculation
- `backend/ProbationService.php` — enrollment CRUD; task progress
- `backend/candidate_lists.php` + `probation.php` — thin route handlers included by api.php
- Buddhist Era utility functions (PHP side)

**Research flag:** NEEDS RESEARCH — combination group evaluation logic (OR-conditions across multiple source levels for M2) and diverse experience (3 ต่าง) rules should be reviewed with HR stakeholders before coding. The calculation rules for supportive experience ratios need explicit rounding policy documented.

### Phase 3: Frontend Integration (Candidate List + Probation Pages)

**Rationale:** Frontend pages already exist as shells with mock data (CandidateListsPage.vue, ProbationEndPage.vue). This phase replaces mock data with real API calls and wires up the composables. Comes after the backend is proven correct because the frontend is a display layer for pre-computed server-side results.

**Delivers:** Functional Candidate List page with working tabs and qualification status display; functional Probation Tracking page with color-coded countdown; Thai date formatting throughout; search/filter and stat cards working against live data.

**Addresses features:** Candidate List UI with 4 tabs (P1), sub-tabs by promotion path (P1), probation list with color-coded days (P1), search/filter (P1), stat cards (P1), status badges + Thai dates (P1).

**Avoids pitfalls:** Buddhist Era display formatting (UX pitfall), color-coded remaining days legend (UX pitfall), tab count badges (UX pitfall).

**Uses stack:** `@vueuse/core`, `date-fns`, `@date-fns/tz`, Pinia stores, `useCandidates()` + `useProbation()` composables.

**Research flag:** STANDARD — Vue 3 composable pattern and Pinia store pattern are well-documented and follow existing project conventions.

### Phase 4: Detail Views and Phase 1.5 Enhancements

**Rationale:** Once Phase 1 (core list views) is validated with HR users, add depth: drill-down views showing WHY someone qualifies or doesn't, probation task checklists, and supportive experience calculation. These features increase system value but are not required for the initial Excel-replacement workflow.

**Delivers:** Qualification breakdown detail view per candidate; probation task checklist with progress per enrollment; supportive experience (เกื้อกูล) integration into qualification calculation; probation stakeholder display; CSV export; batch recalculation.

**Addresses features:** Detail/drill-down view (P2), supportive experience calculation (P2), probation task checklist (P2), probation stakeholder display (P2), CSV export (P2), batch recalculation (P2).

**Avoids pitfalls:** Missing qualification explanation (UX pitfall — "no explanation of WHY not qualified"), multi-evaluator workflow state machine (Pitfall 5).

**Research flag:** NEEDS RESEARCH — supportive experience ratio rules (which job series are considered "supportive" and at what ratio) need HR domain expert input. The `supportive_job_series` mapping table needs authoritative data.

### Phase 5: Position Types 3 and 4 (อำนวยการ and บริหาร)

**Rationale:** Deferred because อำนวยการ (M1/M2) requires "3 ต่าง" diverse experience validation (Pitfall 4 — deceptively complex) and screening list processes. บริหาร (S1/S2) requires position equivalence rules. These features need dedicated research into อ.ก.พ. กระทรวงยุติธรรม interpretations before implementation.

**Delivers:** Full candidate list functionality for M1/M2/S1/S2 promotion paths; diverse experience tracking with HR approval workflow; screening list management; position equivalence mapping.

**Avoids pitfalls:** Diverse experience ambiguity (Pitfall 4 — get HR interpretation of ต่างพื้นที่ and concurrent positions before writing code).

**Research flag:** NEEDS RESEARCH — M1/M2/S1/S2 rules require reading pages 31-82 of ops-career-path.pdf and consultation with HR stakeholders on edge cases. Do not start this phase without dedicated research.

### Phase Ordering Rationale

- **Database first:** All backend logic depends on correct schemas. Schema bugs with live data are expensive. Testing schemas in isolation (with known date pairs and expected day counts) is cheap.
- **Engine before UI:** The QualificationEngine is the highest-value, highest-risk component. A working engine without UI is safe. An incorrect engine surfaced by UI creates user distrust.
- **Core list views before detail views:** The Excel-replacement value is delivered by the list views (who qualifies, remaining days). Detail views add depth but are not required for the initial workflow transition.
- **Simple promotion types before complex:** ทั่วไป and วิชาการ have straightforward tenure + education rules. อำนวยการ and บริหาร add combination groups, screening lists, and diverse experience — defer until Phase 1 is validated.
- **This order avoids the "looks done but isn't" trap** identified in PITFALLS.md: each phase ends with a testable, independently useful deliverable.

### Research Flags

Phases that need `/gsd:research-phase` during planning:
- **Phase 2:** Combination group evaluation logic for M2; supportive experience rounding policy; role-based access control requirements; whether HR stakeholders want manual vs auto-calculated diverse experience flags
- **Phase 4:** Supportive job series mapping — which position families count as supportive and at what ratio percentage
- **Phase 5:** อำนวยการ/บริหาร promotion rules (requires reading legal documents + HR stakeholder validation of edge cases); diverse experience minimum duration thresholds; screening list format and data source

Phases with standard patterns (skip research-phase):
- **Phase 1:** MySQL schema conversion is mechanical. Well-documented syntax differences. Use conversion checklist from PITFALLS.md.
- **Phase 3:** Vue 3 composable and Pinia patterns are established. The existing `useApi()` composable, `auth.js` and `ui.js` stores provide clear precedent.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing codebase is fixed; additions are minimal and well-justified. VueUse/date-fns versions verified against npm. PHP DateTime sufficiency is authoritative. |
| Features | HIGH | Domain rules are encoded in legal documents and SQL schemas. Excel workflow is the authoritative source of user expectations. MVP is tightly scoped. |
| Architecture | HIGH | Based on direct analysis of existing `api.php`, Pinia stores, and composable patterns. Component map follows conventions already in the codebase. |
| Pitfalls | HIGH | Pitfalls are derived from concrete schema analysis (PostgreSQL syntax in MySQL context), not speculation. Most are verifiable with test queries. |

**Overall confidence:** HIGH

### Gaps to Address

The following areas are known unknowns that need resolution during planning or early implementation:

- **Supportive job series mapping:** The `supportive_job_series` table requires authoritative data on which job series are considered supportive of which target series, and at what ratio percentage. This data must come from HR domain experts, not from the existing schemas. Skipping this table is listed as an acceptable MVP shortcut in PITFALLS.md but must be flagged as a known inaccuracy.

- **Promotion criteria seed data completeness:** The SQL schemas define the table structure for `promotion_criteria` but do not contain the actual values. The rules (exact year thresholds per education level for each promotion path) must be extracted from pages 31-82 of `docs/documents/ops-carrer-path.pdf`. This extraction needs HR review before the Phase 2 engine is built.

- **Existing `civil_servants` data quality:** The new schema ALTERs add columns like `current_level_start_date` and `current_level_code` to the existing `civil_servants` table. These will be NULL for all existing records until a backfill migration is run. The backfill logic (populate from `personnel_position_history` MAX effective_date) needs verification against actual data before Phase 2 begins.

- **Probation program/task template content:** The `probation_program` and `probation_task_template` tables require actual task definitions (what evaluations are required, in what order, with what deadlines). This content must come from the ministry's current probation process documents.

- **CORS configuration:** The backend hardcodes `https://smart-port.onrender.com` as the allowed origin in `api.php`. If a staging or test environment is used during development, this needs to be updated to support additional origins without exposing production.

## Sources

### Primary (HIGH confidence)
- `docs/gap_analysis_career_path_v2.sql` — 9 new tables, 2 VIEWs, 3 ALTERs; career path schema design
- `docs/probation_tracking_schema.sql` — 10 new tables, 1 VIEW; probation tracking schema design
- `backend/api.php`, `backend/config.php` — existing backend routing and connection patterns
- `frontend/src/pages/CandidateListsPage.vue`, `ProbationEndPage.vue` — existing mock UI shells
- `frontend/src/stores/` — existing Pinia store patterns (auth.js, ui.js)
- MySQL 8.0 documentation — DATE arithmetic (DATEDIFF), CONCAT vs ||, BOOLEAN/TINYINT(1)

### Secondary (MEDIUM confidence)
- [VueUse official site](https://vueuse.org/) — version 14.2.1, Vue 3.5+ requirement verified
- [date-fns npm](https://www.npmjs.com/package/date-fns) — version 4.1.0, tree-shakeable, 34M weekly downloads
- [Ascent E-Probation](https://www.eilisys.com/e-probation-confirmation/) — commercial probation features for competitive baseline
- กฎ ก.พ. ว่าด้วยการทดลองปฏิบัติหน้าที่ราชการ พ.ศ. 2553, นร 1006/ว5, นร 1006/ว3, นร 1006/ว17

### Tertiary (LOW confidence — needs validation)
- `docs/documents/ops-carrer-path.pdf` (86 pages) — career path promotion rules; exact year thresholds per education level need extraction and HR review
- `docs/hr_database_schema.sql`, `docs/probation_tracking_schema.sql` — PostgreSQL syntax; promotion criteria values not yet seeded; require conversion and data population

---
*Research completed: 2026-03-22*
*Ready for roadmap: yes*
