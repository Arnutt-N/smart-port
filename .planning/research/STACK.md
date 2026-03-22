# Stack Research — v1.1 Career Path Time-Counting Features

**Project:** Smart Port HRIS - Time Counting Sub-menus (เกื้อกูล, แตกต่าง, เทียบตำแหน่ง)
**Researched:** 2026-03-22
**Scope:** Stack additions/changes needed for 3 new career path time-counting features
**Confidence:** HIGH

## Executive Summary

The existing stack (Vue 3, PHP 8.3, MySQL 8.0) requires **zero new library dependencies**. All 3 features are standard CRUD with date arithmetic, which the current codebase already handles. The work is creating new PHP route handlers (following `routes/candidates.php`), new Vue composables (following `useCandidates.js`), new Vue pages (replacing PlaceholderPage routes), and extending `QualificationEngine.php` to incorporate additional days into qualification_date calculations.

The previous v1.0 research recommended adding `@vueuse/core`, `date-fns`, and `@date-fns/tz`. These remain **optional nice-to-haves** but are NOT required for v1.1. The existing patterns (PHP `DATEDIFF`/`DATE_ADD` for server-side date math, `formatThaiDate()` helper, native fetch via `useApi.js` composable) cover all v1.1 needs without new dependencies.

## Existing Stack (Fixed -- Not Under Discussion)

| Technology | Version | Purpose | Already Handles |
|------------|---------|---------|-----------------|
| Vue 3 | ^3.5.0 | Frontend framework | Component composition, reactivity |
| Vite 6 | ^6.0.0 | Build tooling | HMR, proxy to backend |
| Tailwind CSS 4 | ^4.1.0 | Styling | All UI needs |
| Pinia 3 | ^3.0.0 | State management | Auth store, UI toast store |
| Vue Router 4 | ^4.5.0 | Routing | Placeholder routes already exist for all 3 pages |
| PHP 8.3 | 8.3 | Backend API | Custom routing, PDO, date functions |
| MySQL 8.0 | 8.0 | Database | All 4 career-path tables already exist in `04-career-path.sql` |

## New Dependencies Required

**None.** Zero new npm packages. Zero new Composer packages.

## What Already Exists (Do NOT Rebuild)

| Component | Location | Status |
|-----------|----------|--------|
| `supportive_experience` table | `database/04-career-path.sql` | Schema created |
| `diverse_experience` table | `database/04-career-path.sql` | Schema created |
| `position_equivalence` table | `database/04-career-path.sql` | Schema created |
| `supportive_job_series` mapping table | `database/04-career-path.sql` | Schema created, needs seed data |
| `qualification_calculation` table | `database/04-career-path.sql` | Schema created, has `supportive_days`, `diverse_exp_date`, `equivalence_days` columns |
| Route placeholders in Vue Router | `frontend/src/router/index.js` | Routes exist: `/time-counting`, `/time-difference`, `/position-compare` |
| QualificationEngine | `backend/QualificationEngine.php` | Working computation for basic qualification_date |
| API gateway routing pattern | `backend/api.php` | Switch-case dispatch to `routes/*.php` |
| Composable CRUD pattern | `frontend/src/composables/useCandidates.js` | fetch + map pattern established |
| Thai date helpers | `backend/helpers.php` | `formatThaiDate()`, `getLevelName()` |
| `useApi.js` composable | `frontend/src/composables/useApi.js` | HTTP client with JWT token injection |

## New Backend Components Needed

### 1. Route Handler: `backend/routes/supportive.php`

**Pattern:** Follow `routes/candidates.php` structure (function handler, PDO prepared statements).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/supportive?personnel_id={id}` | List supportive experience records for a person |
| POST | `/supportive` | Create new supportive experience record |
| PUT | `/supportive/{id}` | Update existing record |
| DELETE | `/supportive/{id}` | Delete record |

**Server-side computation on save:**
- `total_days = DATEDIFF(end_date, start_date)`
- `effective_days = total_days * ratio_percent / 100`
- Validate `job_series_name` against `supportive_job_series` mapping

**No new PHP libraries needed.** PDO + `DATEDIFF()` + arithmetic operators.

### 2. Route Handler: `backend/routes/diverse.php`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/diverse?personnel_id={id}` | List diverse experience records for a person |
| POST | `/diverse` | Create new record with diff flags |
| PUT | `/diverse/{id}` | Update existing record |
| DELETE | `/diverse/{id}` | Delete record |

**Server-side computation on save:**
- `from_total_days = DATEDIFF(from_end_date, from_start_date)`, same for `to_*`
- `diff_count = is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature`
- `qualified_date` = earliest date when cumulative diff_count >= 3

**No new PHP libraries needed.**

### 3. Route Handler: `backend/routes/equivalence.php`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/equivalence?personnel_id={id}` | List position equivalence records |
| POST | `/equivalence` | Create new request (status=PENDING) |
| PUT | `/equivalence/{id}` | Update record details |
| PUT | `/equivalence/{id}/approve` | Set status=APPROVED, populate approved_by/dates |
| PUT | `/equivalence/{id}/reject` | Set status=REJECTED |

**Approval workflow** is a simple status-field update. The `approved_by` FK uses `users.user_id` extracted from JWT payload (already available via `validateJWT()`).

**No new PHP libraries needed.**

### 4. Route Handler: `backend/routes/supportive-series.php`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/supportive-series` | List all supportive job series mappings |
| GET | `/supportive-series?primary_id={id}` | Get supportive series for a specific primary series |

**Read-only reference data.** Used by the Supportive Experience form to validate/suggest which job series qualify as supportive.

### 5. API Gateway Registration (4 new switch cases in `api.php`)

```php
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
case 'supportive-series':
    include __DIR__ . '/routes/supportive-series.php';
    handleSupportiveSeries($pdo, $method, $path);
    break;
```

### 6. QualificationEngine Extension

**Current formula:** `qualification_date = current_level_start_date + min_years`

**Extended formula:**
```
adjusted_qualification_date = DATE_SUB(
    DATE_ADD(current_level_start_date, INTERVAL min_years YEAR),
    INTERVAL SUM(supportive_effective_days) DAY
)
```

**Additional checks by target level:**
- **M1 targets:** Require `diverse_experience.diff_count >= 3` with a `qualified_date`
- **S1 targets:** Require `position_equivalence.approved_total_days >= requires_equiv_years * 365` where `approval_status = 'APPROVED'`

**Implementation approach:** Add LEFT JOINs to subqueries aggregating per-personnel supportive/diverse/equivalence data within the existing single-query pattern. Add a new method `computeForLevelExtended()` or modify `computeForLevel()` with optional flags.

**Technology used:** MySQL `DATE_SUB`, `DATE_ADD`, `DATEDIFF`, `SUM`, `CASE WHEN`. No PHP date library needed -- all computation stays in SQL.

## New Frontend Components Needed

### 1. Composables (3 new files)

Follow `useCandidates.js` pattern (import `useApi`, return object with async methods):

| File | Methods |
|------|---------|
| `composables/useSupportive.js` | `fetchByPersonnel(id)`, `create(data)`, `update(id, data)`, `remove(id)` |
| `composables/useDiverse.js` | `fetchByPersonnel(id)`, `create(data)`, `update(id, data)`, `remove(id)` |
| `composables/useEquivalence.js` | `fetchByPersonnel(id)`, `create(data)`, `update(id, data)`, `approve(id)`, `reject(id)` |

### 2. Pages (3 new Vue files replacing PlaceholderPage)

| File | Route | UI Pattern |
|------|-------|------------|
| `pages/SupportiveExpPage.vue` | `/time-counting` | Personnel selector + CRUD data table + add/edit modal |
| `pages/DiverseExpPage.vue` | `/time-difference` | Personnel selector + CRUD data table + 4 diff-flag checkboxes + diff_count indicator |
| `pages/PositionEquivPage.vue` | `/position-compare` | Personnel selector + CRUD data table + approval status badges + approve/reject buttons |

### 3. Reusable Components (extract from pages if patterns repeat)

| Component | Purpose | Reuse |
|-----------|---------|-------|
| `PersonnelSearchSelect.vue` | Searchable personnel dropdown (calls `/civil-servants` API) | All 3 pages |
| `DateRangeFields.vue` | Start/end date inputs with auto-computed total_days display | All 3 pages |

These are optional extractions. If only used once per page, inline them.

### 4. Router Updates

Update 3 existing routes in `frontend/src/router/index.js` to point to real page components:

```javascript
{ path: 'time-counting', name: 'time-counting', component: () => import('@/pages/SupportiveExpPage.vue') },
{ path: 'time-difference', name: 'time-difference', component: () => import('@/pages/DiverseExpPage.vue') },
{ path: 'position-compare', name: 'position-compare', component: () => import('@/pages/PositionEquivPage.vue') },
```

## Database Changes Needed

### Seed Data Only -- No Schema Changes

All required tables exist in `04-career-path.sql`. No `ALTER TABLE` or new tables needed.

**Required:** Seed data for `supportive_job_series` table.

| Item | Description |
|------|-------------|
| File | `database/05-supportive-series-seed.sql` |
| Content | Mappings from PDF pages 32-82 defining which job series support which |
| Estimated rows | 50-100 mappings |
| Format | `INSERT INTO supportive_job_series (primary_series_name, supportive_series_name, mapping_type) VALUES ...` |

## Complexity Assessment Per Feature

### 1. Supportive Experience (เกื้อกูล) -- LOW

Standard CRUD with date arithmetic (DATEDIFF, ratio multiplication). Validation against supportive_job_series mapping.

**Risk:** Ratio calculation rounding (use `DECIMAL(10,2)` -- already defined in schema).

### 2. Diverse Experience (แตกต่าง / 3 ต่าง) -- MEDIUM

CRUD with auto-computed `diff_count` from 4 boolean flags. UI needs clear visual for "which diffs are met."

**Risk:** Determining `qualified_date` when multiple records exist -- need to check historical records chronologically.

### 3. Position Equivalence (เทียบตำแหน่ง) -- MEDIUM

CRUD plus approval workflow (PENDING -> APPROVED/REJECTED). `approved_by` from JWT user context.

**Risk:** No RBAC exists. Currently any authenticated user can approve. Acceptable for v1.1 (single HR admin user), but flag for future.

### 4. QualificationEngine Extension -- HIGH

Integrates 3 data sources into existing single-query engine via LEFT JOIN subqueries. Different target levels need different checks (M1 needs diverse, S1 needs equivalence). Must not break existing candidate list.

**Risk:** Query performance with multiple subquery JOINs. Test with realistic data volume.

## Implementation Order Recommendation

1. **Supportive Experience CRUD** (backend + frontend) -- simplest, establishes the pattern
2. **Diverse Experience CRUD** (backend + frontend) -- adds boolean-flag computation
3. **Position Equivalence CRUD + approval** (backend + frontend) -- adds approval workflow
4. **Supportive Job Series seed data** -- reference data for validation
5. **QualificationEngine extension** -- depends on all 3 CRUDs being complete and having data
6. **Candidate List integration** -- display adjusted qualification dates with new data

## Alternatives Considered and Rejected

| Category | Rejected | Why Not |
|----------|----------|---------|
| Date library (JS) | date-fns, Day.js | All date computation is server-side in MySQL. Frontend only displays pre-formatted Thai dates from `formatThaiDate()`. No client-side date math needed for v1.1. |
| Date library (PHP) | Carbon | No-framework backend. PHP native `DateTime` + MySQL `DATEDIFF`/`DATE_ADD` cover all needs. |
| Form library | VeeValidate, FormKit | Only 3 simple forms with 5-10 fields each. Native Vue 3 `v-model` + manual validation is sufficient. |
| Table library | AG Grid, TanStack Table | Tables will have <50 rows per personnel. Native `<table>` + Tailwind + `v-for` matches existing pattern. |
| Workflow engine | Separate approval service | Position equivalence approval is a single status field update, not a multi-step workflow. |
| UI component library | Vuetify, Element Plus | Project uses Tailwind CSS 4 with custom components. Adding a component framework creates conflicts. |
| State management | New Pinia stores | v1.1 pages are standalone CRUD. Local component state with composables (like `useCandidates.js`) is sufficient. No cross-page state sharing needed. |

## What NOT to Add

| Avoid | Reason |
|-------|--------|
| New npm packages | All computation is server-side. Frontend is display + forms only. |
| New Composer packages | PHP DateTime + MySQL functions cover all date needs. |
| Separate approval microservice | Overkill. Status field update in `position_equivalence` table suffices. |
| Client-side date calculations | Server is the single source of truth for qualification dates. Keep it there. |
| RBAC system | Out of scope for v1.1. Current single-user JWT auth works. Flag for future. |

## Stack Additions Summary

| Category | New Dependencies | New Files (to create) |
|----------|------------------|-----------------------|
| PHP libraries | 0 | 4 route handlers + QualificationEngine extension |
| JS libraries | 0 | 3 composables + 3 page components + 0-2 shared components |
| CSS | 0 | Tailwind classes only |
| Database schema | 0 changes | 1 seed data SQL file |
| Build/infra | 0 changes | No Docker/Vite config changes |

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Zero new dependencies | HIGH | Verified all 3 features against existing codebase capabilities |
| Backend route pattern | HIGH | Direct replication of working `routes/candidates.php` |
| Frontend composable pattern | HIGH | Direct replication of working `useCandidates.js` |
| QualificationEngine extension | MEDIUM | SQL subquery JOINs are standard but untested with this schema; may need optimization |
| Approval workflow simplicity | MEDIUM | Works for single-admin use case; needs RBAC review for multi-user |

## Sources

- `backend/QualificationEngine.php` -- existing computation pattern (direct code review)
- `backend/routes/candidates.php` -- existing route handler pattern (direct code review)
- `backend/api.php` -- gateway routing pattern (direct code review)
- `frontend/src/composables/useCandidates.js` -- existing composable pattern (direct code review)
- `frontend/src/composables/useApi.js` -- existing HTTP client pattern (direct code review)
- `frontend/src/router/index.js` -- existing placeholder routes (direct code review)
- `database/04-career-path.sql` -- all required tables already defined (direct code review)
- `.planning/PROJECT.md` -- v1.1 milestone requirements and constraints (direct file review)

---
*Stack research for: v1.1 Career Path Time-Counting Features (Smart Port HRIS)*
*Researched: 2026-03-22*
