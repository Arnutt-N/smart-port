# Domain Pitfalls: v1.1 Time-Counting Features

**Domain:** Career path time-counting (เกื้อกูล, แตกต่าง, เทียบตำแหน่ง) added to existing Thai government HRIS
**Researched:** 2026-03-22
**Milestone:** v1.1 การนับเวลาเพิ่มเติม
**Confidence:** HIGH (based on existing codebase analysis, v1.0 retrospective, schema review)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or wrong qualification calculations.

---

### Pitfall 1: Date Arithmetic Errors in Supportive Days Calculation

**What goes wrong:**
The supportive experience (เกื้อกูล) formula is `effective_days = total_days x ratio_percent / 100`. Developers calculate `total_days` from `DATEDIFF(end_date, start_date)` but forget that this is exclusive of the end date (returns 0 for same-day). Thai civil service counting is inclusive: working from Jan 1 to Jan 1 counts as 1 day. This off-by-one error compounds across multiple supportive records, potentially shifting a qualification date by weeks.

Additionally, `effective_days` is `DECIMAL(10,2)` but when summing multiple records and converting back to days for QualificationEngine, fractional days get truncated or rounded inconsistently between PHP `intval()` and MySQL `CAST(... AS SIGNED)`.

**Why it happens:**
- `DATEDIFF` is exclusive by convention, but the Excel sheets HR currently uses count inclusively
- PHP and MySQL handle decimal-to-integer conversion differently (PHP truncates, MySQL rounds)
- Multiple supportive records sum fractional days that accumulate rounding error

**Consequences:**
- qualification_date shifts by 1+ days per supportive record
- HR notices discrepancy vs. their Excel calculations and loses trust in the system

**Prevention:**
- Add `+1` to all `DATEDIFF` calculations for civil service day counting (or document the convention explicitly and match it against Excel reference)
- Use `FLOOR()` consistently in SQL and `floor()` in PHP for fractional day conversion
- Create a test case comparing known Excel row against engine output for at least 3 personnel

**Detection:**
- Compare system output against HR's existing Excel for 5+ known records
- Watch for qualification dates that are consistently 1 day later than expected

**Phase to address:** Backend API phase (when building supportive CRUD + extending QualificationEngine)

---

### Pitfall 2: QualificationEngine Extension Breaks Existing Candidate List

**What goes wrong:**
The current `QualificationEngine::computeForLevel()` calculates `qualification_date` purely from `current_level_start_date + min_years`. When v1.1 adds supportive/diverse/equivalence days, the engine must subtract supportive days from the required tenure, which changes the JOIN logic and the `DATE_ADD` calculation. If the extension is not backward-compatible, the existing candidate list (which is shipped and validated in UAT) breaks for all K/O level queries.

**Why it happens:**
- The engine currently has a clean `LEFT JOIN promotion_criteria` that returns one row per personnel
- Adding supportive_experience requires a subquery or additional JOIN that can produce multiple rows (one per supportive record), causing duplicate personnel in results
- The `CASE WHEN` status logic is duplicated in both `computeForLevel` and `computeDetail` -- changing one but not the other creates inconsistency

**Consequences:**
- Duplicate rows in candidate list (one personnel appears multiple times)
- `summary.total` count inflated
- Existing pages that work in v1.0 suddenly show wrong data

**Prevention:**
- Aggregate supportive/diverse/equivalence data into a subquery or CTE that returns exactly ONE row per personnel_id before joining
- Extract the status CASE logic into a shared SQL fragment or PHP method to avoid duplication
- Run existing candidate list queries before and after engine changes to verify identical output when no supportive data exists (regression test)

**Detection:**
- `COUNT(DISTINCT personnel_id) != COUNT(*)` in query results
- Summary totals don't match between overview dashboard and individual tab

**Phase to address:** Backend API phase (QualificationEngine extension). Must include regression check.

---

### Pitfall 3: Approval Workflow State Machine for Position Equivalence

**What goes wrong:**
`position_equivalence.approval_status` has values `PENDING`, `APPROVED`, `REJECTED` (implied). Developers build CRUD without enforcing state transitions, allowing direct updates like `PENDING -> REJECTED -> APPROVED` or re-approval of already-approved records. Worse, the QualificationEngine may count PENDING equivalence days as if they were approved, or fail to include APPROVED days.

**Why it happens:**
- The existing probation CRUD pattern (which v1.1 will copy) uses a simple `allowed` array for PUT fields with no state validation
- `approval_status` is just a VARCHAR -- no database-level CHECK constraint
- Developers focus on the form working, not on business rules around state transitions

**Consequences:**
- Unapproved equivalence days counted toward qualification (incorrect promotion eligibility)
- HR approves a record, then someone edits it back to PENDING, losing the approval audit trail
- `approved_by` and approval timestamps become inconsistent with actual status

**Prevention:**
- Add state transition validation in the PUT handler: `PENDING->APPROVED`, `PENDING->REJECTED` only. No backward transitions.
- QualificationEngine must filter `WHERE approval_status = 'APPROVED'` exclusively
- Store `approved_at` timestamp separately from `created_at`
- Consider adding `CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED'))` constraint in MySQL 8.0 (supported since 8.0.16)

**Detection:**
- position_equivalence records where `approved_by IS NOT NULL` but `approval_status != 'APPROVED'`
- Qualification calculations that change when filtering by approval_status

**Phase to address:** Backend API phase (position equivalence CRUD). State machine must be designed before building the PUT endpoint.

---

### Pitfall 4: Diverse Experience diff_count Validation Gap

**What goes wrong:**
The `diverse_experience` table has 4 boolean flags (`is_diff_job_series`, `is_diff_org`, `is_diff_location`, `is_diff_work_nature`) and a `diff_count` integer. Developers let the frontend send all 5 values independently, leading to `diff_count = 3` when only 2 flags are true, or `diff_count = 0` with flags set. The QualificationEngine for M1 promotion requires `diff_count >= 3` (the "3 ต่าง" rule), so inconsistent data means wrong qualification results.

**Why it happens:**
- Frontend form has checkboxes for each flag plus a separate computed field
- Backend trusts the client-sent `diff_count` instead of computing it server-side
- No database trigger or CHECK constraint enforcing consistency

**Consequences:**
- Personnel shown as meeting 3-ต่าง requirement when they don't (or vice versa)
- Audit reveals data inconsistency, requiring manual correction of all records

**Prevention:**
- ALWAYS compute `diff_count` server-side: `diff_count = is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature`
- Never accept `diff_count` from client input -- strip it from the request body
- Add a MySQL GENERATED column: `diff_count INT GENERATED ALWAYS AS (is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature) STORED`
- Frontend should display the computed value as read-only

**Detection:**
- `SELECT * FROM diverse_experience WHERE diff_count != (is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature)`

**Phase to address:** Database phase (ALTER TABLE to add generated column) + Backend API phase (strip diff_count from input)

---

## Moderate Pitfalls

Issues that cause significant rework or user confusion but don't corrupt data.

---

### Pitfall 5: Three New Routes Bloat api.php Switch Statement

**What goes wrong:**
The current `api.php` has 8 case blocks. Adding 3 new route groups (supportive, diverse, equivalence) with full CRUD means 3 more cases. Each route file follows the pattern of `routes/probation.php` with 3-4 handler functions. But developers add the route logic inline in `api.php` instead of using the file-separation pattern, making the file unreadable and unmaintainable.

**Why it happens:**
- v1.0 has a mix: some routes are inline (dashboard, civil-servants) and some are separated (candidates, probation)
- Copy-paste from inline routes is faster than creating a new file
- No enforced convention

**Consequences:**
- `api.php` grows to 500+ lines with duplicate include statements
- Merge conflicts when multiple features are developed

**Prevention:**
- Follow the established `routes/` pattern from v1.0: create `routes/supportive.php`, `routes/diverse.php`, `routes/equivalence.php`
- Keep `api.php` switch cases to 2-3 lines each: `include + handleFunction()` only
- Consider a shared CRUD base pattern since all three features have similar structure

**Phase to address:** Backend API phase (establish route files first, before writing handlers)

---

### Pitfall 6: Thai Text Search Broken by Missing Collation or IME Issues

**What goes wrong:**
Search across supportive/diverse/equivalence records needs to handle Thai text. Two known issues from v1.0 resurface:

1. **UTF-8 double encoding**: If new SQL seed files for `supportive_job_series` don't include `SET NAMES utf8mb4;` at the top, Thai series names are stored as mojibake. This was already solved in v1.0 but new seed files must follow the same pattern.

2. **Thai IME debounce**: The v1.0 `compositionstart/compositionend` guard in search inputs prevents premature API calls during Thai composition. New pages must copy this pattern. Without it, typing "นักวิชาการ" triggers API calls for incomplete characters.

3. **LIKE search with Thai**: `WHERE job_series_name LIKE '%นิติ%'` works with utf8mb4_unicode_ci collation but fails silently with utf8mb4_general_ci for certain character combinations. The existing tables use `utf8mb4_unicode_ci` (correct).

**Why it happens:**
- New developers copy SQL from other sources without the charset header
- Frontend search input created from scratch instead of reusing existing pattern
- Collation specified in CREATE TABLE but not verified in queries

**Consequences:**
- Thai text displays as garbled characters
- Search returns no results for valid Thai queries
- IME causes flickering/multiple API calls during typing

**Prevention:**
- Every new `.sql` file must start with `SET NAMES utf8mb4;` (established pattern)
- Reuse the existing debounced search composable pattern from `CandidateListsPage.vue`
- Verify new tables use `utf8mb4_unicode_ci` collation (already correct in 04-career-path.sql)

**Detection:**
- Thai text in database looks correct in MySQL client but garbled in API response
- Network tab shows multiple rapid-fire requests during Thai typing

**Phase to address:** Database phase (seed files) + Frontend phase (search inputs)

---

### Pitfall 7: Supportive Job Series Seed Data Volume and Maintenance

**What goes wrong:**
The `supportive_job_series` mapping table needs to be seeded with data from the PDF document (pages 32-82, covering every job series). This is potentially 200+ rows of mappings. Developers either:
1. Seed too few rows (only the series they test with), leaving the system incomplete
2. Seed all rows manually with typos in Thai series names, causing JOIN mismatches
3. Hard-code series names instead of referencing `lookup_value.value_id`, making maintenance impossible

**Why it happens:**
- The PDF is 86 pages and the mapping data is scattered across many pages
- Thai names have subtle variations (spaces, ๆ, abbreviations)
- No automated way to extract from PDF

**Consequences:**
- Supportive days not counted for certain job series because the mapping is missing
- HR reports "system doesn't recognize my series" for unlisted job series

**Prevention:**
- Start with a minimal but correct seed for the 5-10 most common series in the organization (สำนักงานปลัดกระทรวงยุติธรรม)
- Include an admin UI or manual SQL approach for HR to add missing mappings later
- Use `lookup_value.value_id` foreign keys where possible, falling back to name-based matching only when lookup data is unavailable
- Document which series are seeded vs. which need manual addition

**Detection:**
- `SELECT COUNT(*) FROM supportive_job_series` returns fewer than expected rows
- Personnel with known supportive experience show 0 supportive days

**Phase to address:** Database phase (seed data) + documented as known gap for later admin feature

---

### Pitfall 8: Frontend Form Validation Mismatch with Backend

**What goes wrong:**
Three new CRUD forms (supportive, diverse, equivalence) each have date fields, numeric fields, and dropdowns. The frontend validates dates as "required" but doesn't check:
- `end_date > start_date` (allows negative day ranges)
- `ratio_percent` between 0-100 for supportive experience
- `from_start_date < from_end_date` AND `to_start_date < to_end_date` for diverse experience
- `request_start_date <= request_end_date` for equivalence

The backend also skips these validations (copying the probation CRUD pattern which only checks field presence, not value correctness).

**Why it happens:**
- Probation CRUD (the template being copied) has minimal validation
- Date range validation requires comparing two field values, not just checking presence
- Developers assume "the form looks right" means the data is right

**Consequences:**
- Negative `total_days` stored in database
- `effective_days` becomes negative (total_days * ratio / 100 with negative total_days)
- QualificationEngine subtracts time instead of adding it

**Prevention:**
- Backend must validate: `end_date >= start_date` for all date ranges, return 400 with specific error
- Backend must validate: `ratio_percent BETWEEN 0 AND 100` for supportive experience
- Backend must compute `total_days` server-side from dates, never trust client-sent value
- Frontend validation is UX convenience only -- backend is the source of truth

**Detection:**
- `SELECT * FROM supportive_experience WHERE total_days < 0`
- `SELECT * FROM diverse_experience WHERE from_total_days < 0 OR to_total_days < 0`

**Phase to address:** Backend API phase (validation in POST/PUT handlers) + Frontend phase (UX validation)

---

## Minor Pitfalls

Issues that slow development or cause minor UX problems.

---

### Pitfall 9: Personnel Picker Component Not Reusable

**What goes wrong:**
All three CRUD forms need a "select personnel" input (ค้นหาบุคลากร). Developers build three separate personnel search inputs instead of creating one shared component. Each implementation handles the search API call differently, has different debounce timing, and displays results in different formats.

**Prevention:**
- Create a shared `PersonnelPicker.vue` component before building any of the three forms
- Component should: accept `v-model` for personnel_id, show name + department, use debounced search against `/civil-servants` endpoint
- Reuse the existing `compositionstart/compositionend` Thai IME guard

**Phase to address:** Frontend phase (build shared component first, then use in all 3 forms)

---

### Pitfall 10: Navigation Menu Structure Confusion

**What goes wrong:**
v1.1 adds 3 new sub-menus under a new "การนับเวลาเพิ่มเติม" parent menu. Developers add them as top-level routes instead of nested under a parent, making the sidebar inconsistent with existing structure (candidate list has sub-tabs, not sub-routes). Or they add them inside the candidate list page as additional tabs, which is conceptually wrong (time-counting is data entry, not a view).

**Prevention:**
- These are data management pages (CRUD), not views -- they should be separate routes, not tabs within candidate list
- Add a new sidebar group "การนับเวลาเพิ่มเติม" with 3 child routes
- Follow the existing sidebar structure from `AppSidebar.vue`

**Phase to address:** Frontend phase (route and navigation setup at the start)

---

### Pitfall 11: Docker Volume Stale Schema After ALTER TABLE

**What goes wrong:**
v1.1 might need to ALTER existing tables (e.g., making `diff_count` a GENERATED column). Docker MySQL only runs init scripts on first volume creation. Developers add the ALTER to a new SQL file, but existing volumes already have the old schema. The ALTER never runs, and the generated column doesn't exist.

**Why it happens:**
- v1.0 retrospective documented this for root password changes, but the same applies to any schema change
- Developers test with `docker-compose down -v` (clean slate) but CI/production has persistent volumes

**Prevention:**
- For local dev: document that `docker-compose down -v && docker-compose up` is required after schema changes
- Create a separate migration SQL file (e.g., `05-v1.1-migrations.sql`) that uses `ALTER TABLE IF EXISTS` / conditional DDL
- Consider checking schema version on backend startup (a `schema_version` table)

**Phase to address:** Database phase (migration file with idempotent statements)

---

### Pitfall 12: Vite Proxy Header Case Sensitivity (Recurring)

**What goes wrong:**
v1.0 already solved this: Vite dev proxy lowercases the `Authorization` header to `authorization`. The backend's `getAuthHeader()` now handles both cases. But when adding new routes in `routes/supportive.php` etc., developers might add their own auth checks that use `$_SERVER['HTTP_AUTHORIZATION']` directly instead of calling `getAuthHeader()`, reintroducing the bug.

**Prevention:**
- All new route files must use `getAuthHeader()` from `auth.php` -- never access headers directly
- Auth is already handled in `api.php` before routing, so route handlers should NOT re-check auth
- If a route needs the user_id from the token, decode it once in `api.php` and pass it to the handler

**Phase to address:** Backend API phase (code review checklist item)

---

## Phase-Specific Warning Summary

| Phase | Likely Pitfall | Severity | Mitigation |
|-------|---------------|----------|------------|
| Database / Schema | diff_count not GENERATED column (#4) | Critical | ALTER TABLE to add generated column |
| Database / Schema | Docker volume stale schema (#11) | Minor | Migration file + `down -v` documentation |
| Database / Seed | UTF-8 missing SET NAMES (#6) | Moderate | Copy `SET NAMES utf8mb4;` header pattern |
| Database / Seed | Incomplete job series mappings (#7) | Moderate | Seed common series, document gaps |
| Backend API | QualificationEngine extension breaks existing (#2) | Critical | Aggregate subquery, regression test |
| Backend API | Date arithmetic off-by-one (#1) | Critical | Inclusive counting, compare vs Excel |
| Backend API | Approval state machine missing (#3) | Critical | State transition validation in PUT |
| Backend API | Validation gaps in CRUD (#8) | Moderate | Server-side date range + numeric validation |
| Backend API | Route bloat in api.php (#5) | Moderate | Follow routes/ file pattern |
| Backend API | Auth header re-checking (#12) | Minor | Use getAuthHeader(), don't re-check in routes |
| Frontend | Thai IME not guarded (#6) | Moderate | Reuse composition event pattern |
| Frontend | No shared PersonnelPicker (#9) | Minor | Build shared component first |
| Frontend | Wrong navigation structure (#10) | Minor | Separate routes, not tabs |

---

## Pre-Implementation Checklist

Before starting v1.1 implementation, verify:

- [ ] All new SQL files start with `SET NAMES utf8mb4;`
- [ ] `diff_count` is a GENERATED column (not client-submitted)
- [ ] QualificationEngine changes are regression-tested against v1.0 output
- [ ] Supportive days use inclusive date counting (+1 to DATEDIFF)
- [ ] Position equivalence only counts `WHERE approval_status = 'APPROVED'`
- [ ] All CRUD endpoints validate date ranges server-side
- [ ] `total_days` and `effective_days` computed server-side, not from client
- [ ] New route files follow `routes/` pattern (not inline in api.php)
- [ ] New frontend pages reuse Thai IME composition guard
- [ ] Shared PersonnelPicker component built before individual forms
- [ ] Docker `down -v` documented for schema migration

---

## Sources

- `backend/QualificationEngine.php` -- current engine logic (computeForLevel, computeDetail)
- `database/04-career-path.sql` -- table schemas for all 3 time-counting features
- `backend/routes/probation.php` -- CRUD pattern template (POST/PUT validation gaps visible)
- `backend/routes/candidates.php` -- route handler pattern to follow
- `backend/api.php` -- routing structure, auth handling
- `.planning/RETROSPECTIVE.md` -- v1.0 lessons (UTF-8, Docker volumes, header case, IME)
- `.planning/PROJECT.md` -- v1.1 requirements and constraints
