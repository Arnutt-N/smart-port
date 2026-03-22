# Architecture Patterns

**Domain:** Time-counting features (เกื้อกูล, แตกต่าง, เทียบตำแหน่ง) for Smart Port HRIS
**Researched:** 2026-03-22
**Confidence:** HIGH (based on direct codebase analysis of existing implementation)

## Executive Summary

The 3 new time-counting features integrate cleanly into the existing architecture. The codebase already has:
- Database tables created and empty (`supportive_experience`, `diverse_experience`, `position_equivalence`)
- Sidebar navigation with sub-menu links pointing to placeholder pages (`/time-counting`, `/time-difference`, `/position-compare`)
- Router entries for all 3 routes (currently rendering `PlaceholderPage.vue`)
- A `QualificationEngine.php` that computes qualification dates but currently ignores supportive/diverse/equivalence data

The work is **extension, not greenfield**. Every layer has a slot waiting to be filled.

## Current Architecture (As-Is)

```
Browser
  |
  +-- Vue 3 SPA (AppLayout > Pages)
  |     |-- router/index.js          (routes defined, placeholder pages)
  |     |-- composables/useApi.js    (fetch wrapper with JWT)
  |     |-- composables/useCandidates.js  (GET /candidates/:level)
  |     |-- composables/useProbation.js   (GET/POST/PUT /probation)
  |     |-- pages/CandidateListsPage.vue  (5-tab candidate view)
  |     |-- pages/ProbationEndPage.vue    (probation tracking)
  |     +-- components/ (StatCard, StatusBadge, PaginationBar, etc.)
  |
  +-- PHP REST API
  |     |-- api.php                  (gateway, switch on path[0])
  |     |-- routes/candidates.php    (GET-only, delegates to QualificationEngine)
  |     |-- routes/probation.php     (CRUD handler pattern)
  |     |-- QualificationEngine.php  (SQL-based qualification computation)
  |     +-- helpers.php              (formatThaiDate, getLevelName)
  |
  +-- MySQL 8.0
        |-- personnel, position, organization  (populated)
        |-- promotion_criteria                 (populated with seed data)
        |-- supportive_experience              (EMPTY - needs CRUD)
        |-- diverse_experience                 (EMPTY - needs CRUD)
        |-- position_equivalence               (EMPTY - needs CRUD)
        |-- supportive_job_series              (EMPTY - needs seed data)
        |-- qualification_calculation          (EMPTY - cache table)
        +-- vw_job_series_tenure, vw_executive_tenure (views exist)
```

## Integration Points for Each Feature

### 1. การนับเกื้อกูล (Supportive Experience)

**What it does:** Records time spent in "supportive" job series. Days are multiplied by a ratio (50-100%) and added to total qualifying time.

**Database:** `supportive_experience` table exists. `supportive_job_series` mapping table exists but needs seed data.

**Backend integration:**
- New route file: `backend/routes/supportive.php`
- New case in `api.php`: `case 'supportive':` (follows `candidates`/`probation` pattern)
- CRUD operations: GET list (by personnel_id), GET detail, POST create, PUT update, DELETE
- Calculation: `effective_days = total_days * ratio_percent / 100`
- Server-side auto-compute: `total_days = DATEDIFF(end_date, start_date)`, `effective_days`, `net_years/months/days`

**Frontend integration:**
- New page: `frontend/src/pages/SupportiveExpPage.vue`
- New composable: `frontend/src/composables/useSupportive.js`
- Router: Replace PlaceholderPage at `/time-counting` with SupportiveExpPage
- UI: Personnel search/select, date range picker, ratio input, computed days display, CRUD table

**QualificationEngine change:** Add `LEFT JOIN` on `supportive_experience` to sum `effective_days` per personnel, then subtract from required tenure to adjust `qualification_date`.

### 2. การนับแตกต่าง (Diverse Experience / 3 ต่าง)

**What it does:** Tracks whether personnel have worked across 3+ different dimensions (different job series, different org, different location, different work nature). Required for M1 (อำนวยการต้น) promotion.

**Database:** `diverse_experience` table exists with `is_diff_job_series`, `is_diff_org`, `is_diff_location`, `is_diff_work_nature`, `diff_count` columns.

**Backend integration:**
- New route file: `backend/routes/diverse.php`
- New case in `api.php`: `case 'diverse':`
- CRUD operations: GET list (by personnel_id), GET detail, POST create (with auto-compute of diff_count), PUT update, DELETE
- Server-side auto-compute: `diff_count = is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature`
- Key query: "Does this person have diff_count >= 3?" feeds into qualification for M1

**Frontend integration:**
- New page: `frontend/src/pages/DiverseExpPage.vue`
- New composable: `frontend/src/composables/useDiverse.js`
- Router: Replace PlaceholderPage at `/time-difference` with DiverseExpPage
- UI: Personnel search, from/to job assignment comparison, checkbox toggles for each "diff" type, visual diff_count indicator

**QualificationEngine change:** For M1 targets only, check `diverse_experience.qualified_date` exists and `diff_count >= 3`. This is a gate (pass/fail), not a day adjustment.

### 3. การเทียบตำแหน่ง (Position Equivalence)

**What it does:** Records when a personnel's actual position is "equivalent to" a higher-category position (e.g., K4 position counted as M1 for promotion to S1). Has an approval workflow.

**Database:** `position_equivalence` table exists with `approval_status` (PENDING/APPROVED/REJECTED), `approved_by`, `approved_start_date`, `approved_end_date`, `approved_total_days`.

**Backend integration:**
- New route file: `backend/routes/equivalence.php`
- New case in `api.php`: `case 'equivalence':`
- CRUD operations: GET list, GET detail, POST create (status=PENDING), PUT update
- Additional endpoint: PUT `/equivalence/{id}/approve` for approval workflow
- Server-side: Only `APPROVED` records count toward qualification

**Frontend integration:**
- New page: `frontend/src/pages/PositionEquivPage.vue`
- New composable: `frontend/src/composables/useEquivalence.js`
- Router: Replace PlaceholderPage at `/position-compare` with PositionEquivPage
- UI: Personnel search, position fields, date range, approval status badge, approve/reject actions (if admin)

**QualificationEngine change:** For S1 targets, sum `approved_total_days` from `position_equivalence WHERE approval_status = 'APPROVED'`. Compare against `promotion_criteria.requires_equiv_years`.

## New Components Needed

### Backend Files (4 new files)

| File | Pattern Source | Purpose |
|------|---------------|---------|
| `backend/routes/supportive.php` | Copy from `routes/probation.php` | CRUD for supportive_experience |
| `backend/routes/diverse.php` | Copy from `routes/probation.php` | CRUD for diverse_experience |
| `backend/routes/equivalence.php` | Copy from `routes/probation.php` | CRUD + approval for position_equivalence |
| `database/05-supportive-seed.sql` | New | Seed data for supportive_job_series mapping |

### Frontend Files (6 new files)

| File | Pattern Source | Purpose |
|------|---------------|---------|
| `frontend/src/pages/SupportiveExpPage.vue` | Adapt from ProbationEndPage.vue | CRUD UI for supportive experience |
| `frontend/src/pages/DiverseExpPage.vue` | Adapt from ProbationEndPage.vue | CRUD UI for diverse experience |
| `frontend/src/pages/PositionEquivPage.vue` | Adapt from ProbationEndPage.vue | CRUD UI + approval workflow |
| `frontend/src/composables/useSupportive.js` | Copy from useProbation.js | API calls for supportive |
| `frontend/src/composables/useDiverse.js` | Copy from useProbation.js | API calls for diverse |
| `frontend/src/composables/useEquivalence.js` | Copy from useProbation.js | API calls for equivalence |

### Modified Files (3 files)

| File | Change |
|------|--------|
| `backend/api.php` | Add 3 new `case` blocks in the switch statement (lines 229-238 area) |
| `backend/QualificationEngine.php` | Add LEFT JOINs for supportive/diverse/equivalence data in computeForLevel() and computeDetail() |
| `frontend/src/router/index.js` | Replace PlaceholderPage imports at lines 56-71 with real page components |

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `SupportiveExpPage.vue` | CRUD UI for supportive experience records | `useSupportive.js`, StatusBadge, PaginationBar, StatCard |
| `DiverseExpPage.vue` | CRUD UI for diverse experience records, diff checkboxes | `useDiverse.js`, StatusBadge, PaginationBar |
| `PositionEquivPage.vue` | CRUD UI + approval workflow | `useEquivalence.js`, StatusBadge, PaginationBar |
| `useSupportive.js` | HTTP calls + response mapping for supportive_experience | `useApi.js` |
| `useDiverse.js` | HTTP calls + response mapping for diverse_experience | `useApi.js` |
| `useEquivalence.js` | HTTP calls + response mapping for position_equivalence | `useApi.js` |
| `routes/supportive.php` | CRUD handler, auto-computes effective_days | `helpers.php`, MySQL |
| `routes/diverse.php` | CRUD handler, auto-computes diff_count | `helpers.php`, MySQL |
| `routes/equivalence.php` | CRUD handler + approve/reject logic | `helpers.php`, MySQL |
| `QualificationEngine.php` | Enhanced qualification computation | All 3 tables + existing tables |

## Reusable Components (No New Shared Components Needed)

The existing shared components cover all UI needs:

| Component | Reused For |
|-----------|-----------|
| `StatCard.vue` | Summary cards at top of each page (total records, pending, etc.) |
| `StatusBadge.vue` | Status display (PENDING/APPROVED/REJECTED for equivalence, diff_count badges for diverse) |
| `PaginationBar.vue` | Table pagination for all 3 CRUD pages |
| `SkeletonLoader.vue` | Loading states |
| `EmptyState.vue` | Empty table states |
| `useRemainingDays.js` | Remaining days display utility |

**StatusBadge may need new status mappings** for PENDING/APPROVED/REJECTED (position equivalence) and diff_count levels, but this is a config addition, not a new component.

## Data Flow

### Current Flow (Candidate List)
```
GET /candidates/K2
  -> QualificationEngine.computeForLevel('K2')
  -> SQL: personnel JOIN promotion_criteria
  -> qualification_date = level_start_date + min_years
  -> remaining_days = qualification_date - today
```

### Enhanced Flow (After v1.1)
```
GET /candidates/K2
  -> QualificationEngine.computeForLevel('K2')
  -> SQL: personnel
         JOIN promotion_criteria
         LEFT JOIN supportive_experience (SUM effective_days)
         LEFT JOIN diverse_experience (check diff_count >= 3)
         LEFT JOIN position_equivalence (SUM approved_total_days WHERE APPROVED)
  -> adjusted_days = total_days_in_series + supportive_effective_days
  -> qualification_date = computed from adjusted_days vs min_years requirement
  -> For M1: additional gate check on diverse_experience.qualified_date
  -> For S1: additional check on equivalence_days vs requires_equiv_years
  -> remaining_days = qualification_date - today
```

### CRUD Flow (New -- per feature)
```
Frontend Page                  Composable              API Route              Database
SupportiveExpPage.vue  -->  useSupportive.js  -->  /supportive  -->  supportive_experience
  - fetchList()                 api.get()              GET list        SELECT with pagination
  - createRecord()              api.post()             POST create     INSERT + auto-compute days
  - updateRecord()              api.put()              PUT update      UPDATE + recompute
  - deleteRecord()              api.del()              DELETE          soft/hard delete
```

## Patterns to Follow

### Pattern 1: Route Handler (from probation.php)
The probation route handler is the template for all 3 new CRUD routes. Key aspects to replicate:
- `handleXxx(PDO $pdo, string $method, array $path): void` signature
- Switch on `$method` for GET/POST/PUT/DELETE
- `include_once __DIR__ . '/../helpers.php'` for Thai date formatting
- Prepared statements with parameter binding for all queries
- JSON response with `['success' => true, 'data' => ...]` envelope
- Pagination with `limit`/`offset` query parameters

```php
// backend/routes/supportive.php
function handleSupportive(PDO $pdo, string $method, array $path): void {
    switch ($method) {
        case 'GET':    // List or detail by ID
        case 'POST':   // Create with auto-compute
        case 'PUT':    // Update with recompute
        case 'DELETE':  // Remove record
    }
}
```

### Pattern 2: Composable (from useProbation.js)
Each composable wraps API calls and maps snake_case backend fields to camelCase frontend fields.

```javascript
// frontend/src/composables/useSupportive.js
export function useSupportive() {
  const api = useApi()
  async function fetchList(personnelId, opts) { ... }
  async function create(data) { ... }
  async function update(id, data) { ... }
  async function remove(id) { ... }
  function mapRow(row) { ... } // snake_case -> camelCase
  return { fetchList, create, update, remove }
}
```

### Pattern 3: API Gateway Registration (from api.php)
```php
// api.php -- add 3 cases alongside existing candidates/probation
case 'supportive':
    include __DIR__ . '/routes/supportive.php';
    handleSupportive($pdo, $method, $path);
    break;

case 'diverse':
    include __DIR__ . '/routes/diverse.php';
    handleDiverse($pdo, $method, $path);
    break;

case 'equivalence':
    include __DIR__ . '/routes/equivalence.php';
    handleEquivalence($pdo, $method, $path);
    break;
```

### Pattern 4: Page Structure (from CandidateListsPage.vue)
Each page follows: breadcrumb > header with action buttons > stat cards > search bar > data table > pagination.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Inline SQL in api.php
**What:** Writing SQL queries directly in api.php instead of route handler files.
**Why bad:** api.php is already 242 lines. Adding CRUD SQL inline makes it unmaintainable.
**Instead:** Follow the `routes/probation.php` pattern with dedicated handler files.

### Anti-Pattern 2: Duplicating QualificationEngine Logic
**What:** Computing adjusted qualification dates in the new CRUD routes.
**Why bad:** Qualification calculation must stay centralized in QualificationEngine.php.
**Instead:** CRUD routes only manage records. QualificationEngine reads them at computation time via JOINs.

### Anti-Pattern 3: Client-Side Day Calculation
**What:** Computing `total_days`, `effective_days`, `diff_count` in JavaScript.
**Why bad:** Date math is error-prone in JS (timezone issues). Server is source of truth.
**Instead:** Backend auto-computes derived fields on POST/PUT, returns them in GET. Frontend displays only.

### Anti-Pattern 4: Shared Form Component Premature Abstraction
**What:** Building a generic "TimeCountingForm" component for all 3 features.
**Why bad:** The 3 features have very different fields (ratio % vs checkboxes vs approval workflow). A shared abstraction would be forced and leaky.
**Instead:** 3 separate page components. Share atomic components (StatCard, StatusBadge, PaginationBar) but not form structure.

### Anti-Pattern 5: Approval Logic in Frontend
**What:** Letting the frontend decide if a position equivalence record is APPROVED.
**Why bad:** Security. Approval status changes must be server-validated.
**Instead:** Backend `/equivalence/{id}/approve` endpoint validates permissions and sets status.

## API Endpoint Design

| Method | Endpoint | Purpose | Query Params / Body |
|--------|----------|---------|---------------------|
| GET | `/supportive?personnel_id=&search=&limit=&offset=` | List supportive records | personnel_id (filter), search, pagination |
| GET | `/supportive/{id}` | Detail one record | - |
| POST | `/supportive` | Create record | Body: personnel_id, job_series_name, start_date, end_date, ratio_percent |
| PUT | `/supportive/{id}` | Update record | Body: partial fields |
| DELETE | `/supportive/{id}` | Delete record | - |
| GET | `/diverse?personnel_id=&search=&limit=&offset=` | List diverse records | Same pattern |
| GET | `/diverse/{id}` | Detail | - |
| POST | `/diverse` | Create with auto diff_count | Body: personnel_id, from_*/to_* fields, is_diff_* booleans |
| PUT | `/diverse/{id}` | Update with recompute | Body: partial fields |
| DELETE | `/diverse/{id}` | Delete | - |
| GET | `/equivalence?personnel_id=&search=&limit=&offset=` | List equivalence records | Same pattern |
| GET | `/equivalence/{id}` | Detail | - |
| POST | `/equivalence` | Create (status=PENDING) | Body: personnel_id, actual_position, equivalent_type, request dates |
| PUT | `/equivalence/{id}` | Update fields | Body: partial fields |
| PUT | `/equivalence/{id}/approve` | Approve/reject | Body: approval_status, approved_by |
| GET | `/supportive-series?primary=` | Lookup supportive job series mapping | primary series filter |

## QualificationEngine Enhancement Detail

The key change is in the SQL within `computeForLevel()` and `computeDetail()`:

```
Current:
  qualification_date = level_start_date + min_years

Enhanced:
  supportive_days = SUM(se.effective_days) WHERE se.personnel_id = p.personnel_id
  adjusted_start = DATE_SUB(level_start_date, INTERVAL supportive_days DAY)
  qualification_date = adjusted_start + min_years

  For M1 targets:
    must also have diverse_experience with diff_count >= 3

  For S1 targets:
    must also have SUM(pe.approved_total_days) >= requires_equiv_years * 365
```

This translates to additional LEFT JOINs and subqueries in the existing SQL, plus CASE WHEN adjustments in the status computation. The existing `computeForLevel()` already uses `LEFT JOIN promotion_criteria` with conditional matching -- the same pattern extends to the 3 new tables.

## Suggested Build Order

The build order is driven by dependencies and incremental value:

### Phase 1: Seed Data + Backend CRUD (all 3 features)
**Rationale:** Backend follows a proven pattern (copy from probation.php), can be tested via cURL, has no UI dependencies.

1. `database/05-supportive-seed.sql` -- seed `supportive_job_series` mapping
2. `backend/routes/supportive.php` + register in `api.php` (simplest CRUD, no workflow)
3. `backend/routes/diverse.php` + register in `api.php` (adds diff_count auto-compute)
4. `backend/routes/equivalence.php` + register in `api.php` (adds approval workflow)

### Phase 2: Frontend Pages (all 3 features)
**Rationale:** All 3 pages follow the same structure. Build them in the same order as backend.

1. `SupportiveExpPage.vue` + `useSupportive.js` + router update (simplest CRUD form)
2. `DiverseExpPage.vue` + `useDiverse.js` + router update (checkbox UI for diff types)
3. `PositionEquivPage.vue` + `useEquivalence.js` + router update (approval workflow UI)

### Phase 3: QualificationEngine Enhancement
**Rationale:** Must come last because it depends on data existing in the 3 tables and needs all backend routes working to test end-to-end.

1. Add supportive_days adjustment to `computeForLevel()` and `computeDetail()`
2. Add diverse_experience gate check for M1 targets
3. Add equivalence_days check for S1 targets
4. Verify Candidate List page reflects enhanced calculations

## Sources

- Direct codebase analysis: `backend/api.php` (242 lines, switch-based gateway)
- Route pattern: `backend/routes/candidates.php` (GET-only, QualificationEngine delegation)
- Route pattern: `backend/routes/probation.php` (full CRUD handler with search/pagination)
- Computation engine: `backend/QualificationEngine.php` (SQL-based, DATE_ADD/DATEDIFF)
- Helper utilities: `backend/helpers.php` (formatThaiDate, getLevelName)
- Frontend routing: `frontend/src/router/index.js` (placeholder routes at lines 55-71)
- Sidebar navigation: `frontend/src/components/AppSidebar.vue` (time-extra submenu at lines 124-129)
- Composable patterns: `frontend/src/composables/useCandidates.js`, `useProbation.js`
- Database schema: `database/04-career-path.sql` (all 3 target tables defined)
- Project requirements: `.planning/PROJECT.md` (v1.1 Active requirements)
