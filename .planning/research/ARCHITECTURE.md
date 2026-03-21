# Architecture Patterns

**Domain:** Thai Government HR Career Path & Probation Tracking System
**Researched:** 2026-03-22
**Confidence:** HIGH (based on existing codebase analysis + schema design documents)

## Current Architecture (Baseline)

```
Vue 3 SPA (Vite + Tailwind CSS 4)
    |
    +-- useApi() composable (fetch + JWT auth)
    |
    +-- [HTTPS / Nginx reverse proxy]
    |
    v
PHP 8.3 API Gateway (api.php, switch-based routing)
    |
    +-- PDO prepared statements
    |
    v
MySQL 8.0
```

**Key characteristics:**
- Single-file API gateway (`api.php`) with `switch($path[0])` routing
- No PHP framework, no ORM, no migration tool
- Frontend uses Pinia stores (`auth.js`, `ui.js`) + `useApi()` composable
- Existing tables: `civil_servants`, `prefixes`, `civil_servant_photos`, `advance_notifications`, `performance_proposals`
- The DB uses `civil_servants` as the central entity (not `personnel` from the reference schemas)

## Recommended Architecture for New Features

### High-Level Component Map

```
+------------------------------------------------------------------+
|  FRONTEND (Vue 3 + Vite)                                          |
|                                                                    |
|  Pages:                                                            |
|  +------------------+  +---------------------+                     |
|  | CandidateListsPage|  | ProbationEndPage   |  (existing shells) |
|  | - 4 tabs by type  |  | - enrollment list   |                    |
|  | - table + search  |  | - color-coded days  |                    |
|  | - stat cards      |  | - stat cards        |                    |
|  +--------+---------+  +--------+------------+                     |
|           |                      |                                  |
|  Composables:                                                      |
|  +------------------+  +---------------------+                     |
|  | useCandidates()  |  | useProbation()      |   (NEW)            |
|  | - fetch by type  |  | - fetch enrollments |                     |
|  | - search/filter  |  | - fetch detail      |                     |
|  | - stats computed |  | - stats computed    |                     |
|  +--------+---------+  +--------+------------+                     |
|           |                      |                                  |
|  +--------+----------------------+------------+                     |
|  |               useApi()                      |   (existing)      |
|  +---------------------+----------------------+                     |
+------------------------------|-------------------------------------+
                               | HTTP (JSON)
+------------------------------|-------------------------------------+
|  BACKEND (PHP 8.3)           v                                      |
|                                                                     |
|  api.php                                                            |
|  +---------------------------------------------------------------+  |
|  | case 'candidate-lists':   --> candidate_lists.php              |  |
|  | case 'probation':         --> probation.php                    |  |
|  | case 'qualification':     --> qualification.php                |  |
|  +---------------------------------------------------------------+  |
|                                                                     |
|  Service Layer (PHP files):                                         |
|  +---------------------------+  +-------------------------------+   |
|  | CandidateListService.php  |  | ProbationService.php          |   |
|  | - getByPositionType()     |  | - getEnrollments()            |   |
|  | - calculateQualification()|  | - getEnrollmentDetail()       |   |
|  | - recalculateAll()        |  | - getTaskProgress()           |   |
|  +---------------------------+  | - updateTaskStatus()          |   |
|                                 +-------------------------------+   |
|  +---------------------------------------------------------------+  |
|  | QualificationEngine.php (CORE CALCULATION)                     |  |
|  | - evaluateCriteria(personnel_id, target_level)                 |  |
|  | - calculateTenureDays(personnel_id, level_code)                |  |
|  | - checkSupportiveExperience(personnel_id)                      |  |
|  | - checkDiverseExperience(personnel_id)                         |  |
|  | - checkScreeningList(personnel_id)                             |  |
|  | - getQualificationDate(personnel_id, target_level)             |  |
|  +---------------------------------------------------------------+  |
|                                                                     |
+------------------------------|--------------------------------------+
                               |
+------------------------------|--------------------------------------+
|  DATABASE (MySQL 8.0)        v                                      |
|                                                                     |
|  Existing tables:                                                   |
|    civil_servants, prefixes, civil_servant_photos,                  |
|    advance_notifications, performance_proposals                     |
|                                                                     |
|  NEW tables (career path):                                          |
|    promotion_criteria, qualification_calculation,                    |
|    diverse_experience, supportive_experience,                       |
|    position_equivalence, screening_list,                            |
|    supportive_job_series, promotion_evaluation                      |
|                                                                     |
|  NEW tables (probation):                                            |
|    probation_program, probation_task_template,                      |
|    probation_enrollment, probation_stakeholder,                     |
|    probation_task_progress, probation_evaluation,                   |
|    probation_committee, probation_committee_member,                 |
|    elearning_course, elearning_enrollment                           |
|                                                                     |
|  NEW views:                                                         |
|    vw_candidate_list, vw_probation_dashboard,                       |
|    vw_job_series_tenure                                             |
+---------------------------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **CandidateListsPage.vue** | Renders candidate tables with 4 tabs, search, stat cards | `useCandidates()` composable |
| **ProbationEndPage.vue** | Renders probation enrollment list with color-coded urgency | `useProbation()` composable |
| **useCandidates()** | Fetches candidate list data by position type, manages client-side search/filter state | `useApi()` -> backend |
| **useProbation()** | Fetches probation enrollments, manages filter/search state | `useApi()` -> backend |
| **useApi()** | HTTP layer with JWT auth injection, 401 redirect (existing) | Backend API |
| **api.php** | Route dispatch + auth guard (existing, extend with new cases) | PHP service files |
| **candidate_lists.php** | Request handler for candidate list endpoints | `CandidateListService.php` |
| **probation.php** | Request handler for probation endpoints | `ProbationService.php` |
| **QualificationEngine.php** | Core business logic: career path rule evaluation | MySQL via PDO |
| **CandidateListService.php** | Query orchestration for candidate list data | `QualificationEngine.php`, MySQL |
| **ProbationService.php** | Query orchestration for probation tracking data | MySQL |
| **MySQL Views** | Pre-joined queries for dashboard performance | Raw tables |

### Data Flow

#### Flow 1: Candidate List Page Load

```
1. User navigates to /candidates/general
2. CandidateListsPage.vue activates "general" tab
3. useCandidates() calls api.get('/candidate-lists?type=general&from=O1&to=O2')
4. api.php routes to candidate_lists.php
5. candidate_lists.php calls CandidateListService::getByPositionType('general')
6. Service queries vw_candidate_list VIEW (pre-joined personnel + qualification_calculation)
7. Returns JSON array: [{personnel_id, name, position, level, qualification_date, remaining_days, status}]
8. useCandidates() stores result in ref, computed properties derive stats
9. CandidateListsPage.vue renders table + stat cards
```

#### Flow 2: Qualification Calculation (Batch - Admin Triggered or Scheduled)

```
1. Admin triggers recalculation via POST /candidate-lists/recalculate
2. api.php routes to candidate_lists.php
3. CandidateListService calls QualificationEngine::recalculateAll()
4. For each active civil servant:
   a. Query current_level_code from civil_servants
   b. Determine applicable promotion_criteria rows
   c. Calculate tenure days from position history
   d. Add supportive_experience days (if applicable)
   e. Check diverse_experience (for M1 targets)
   f. Check screening_list (for M1/M2 targets)
   g. Compute qualification_date = current_level_start + required_days
   h. Compute remaining_days = qualification_date - deadline_date
   i. INSERT/UPDATE qualification_calculation table
5. Returns {success: true, calculated: N, errors: [...]}
```

#### Flow 3: Probation Dashboard Load

```
1. User navigates to /probation-end
2. ProbationEndPage.vue triggers useProbation().fetchAll()
3. api.get('/probation/enrollments?status=IN_PROGRESS')
4. ProbationService queries vw_probation_dashboard VIEW
5. Returns [{enrollment_id, name, department, position, start_date, end_date,
             remaining_days, total_tasks, completed_tasks, mentor_name, status}]
6. Frontend computes color class from remaining_days:
   - > 30: green (ปกติ)
   - 15-30: yellow (เตือน)
   - 7-14: orange (เร่งด่วน)
   - < 7: red (ด่วนที่สุด)
7. Renders table with color-coded remaining days column
```

#### Flow 4: Probation Detail View (Phase 1+ stretch goal)

```
1. User clicks on a probation enrollment row
2. Router navigates to /probation-end/:enrollmentId
3. useProbation().fetchDetail(enrollmentId)
4. api.get('/probation/enrollments/{id}')
5. ProbationService queries:
   a. probation_enrollment (main record)
   b. probation_stakeholder (mentor, supervisor, director)
   c. probation_task_progress JOIN probation_task_template (checklist)
   d. probation_evaluation (assessment scores)
6. Returns composite JSON object
7. Frontend renders detail view with task checklist + evaluator info
```

## Patterns to Follow

### Pattern 1: Backend File Extraction (Keep api.php Manageable)

The current `api.php` has all logic inline. New features should extract logic into separate files to keep the gateway thin.

**What:** Each new feature gets a PHP file (`candidate_lists.php`, `probation.php`) that `api.php` includes via the switch statement.

**When:** For every new route group.

**Example:**

```php
// api.php - keep it thin
case 'candidate-lists':
    require_once 'candidate_lists.php';
    handleCandidateLists($pdo, $method, $path, $token);
    break;

case 'probation':
    require_once 'probation.php';
    handleProbation($pdo, $method, $path, $token);
    break;
```

```php
// candidate_lists.php
function handleCandidateLists($pdo, $method, $path, $token) {
    $action = $path[1] ?? '';

    switch ($method) {
        case 'GET':
            if ($action === 'recalculate') {
                // ... trigger recalculation
            } else {
                $type = $_GET['type'] ?? 'general';
                $from = $_GET['from'] ?? null;
                $to = $_GET['to'] ?? null;
                $search = $_GET['search'] ?? '';
                // ... query and return
            }
            break;
    }
}
```

### Pattern 2: Vue Composable per Feature Domain

**What:** Each major feature gets its own composable that encapsulates API calls, reactive state, and computed properties.

**When:** For any feature with its own page and data lifecycle.

**Example:**

```javascript
// composables/useCandidates.js
import { ref, computed } from 'vue'
import { useApi } from './useApi'

export function useCandidates() {
  const api = useApi()
  const candidates = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function fetchByType(positionType, fromLevel, toLevel) {
    loading.value = true
    error.value = null
    try {
      const params = new URLSearchParams({ type: positionType, from: fromLevel, to: toLevel })
      const result = await api.get(`/candidate-lists?${params}`)
      candidates.value = result.data
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  const stats = computed(() => ({
    total: candidates.value.length,
    eligible: candidates.value.filter(c => c.status === 'eligible').length,
    overdue: candidates.value.filter(c => c.remaining_days < 0).length,
  }))

  return { candidates, loading, error, fetchByType, stats }
}
```

### Pattern 3: MySQL Views for Dashboard Queries

**What:** Use MySQL VIEWs to pre-join complex queries rather than building multi-table JOINs in PHP.

**When:** Any query joining 3+ tables, especially for list/dashboard pages.

**Why:** The reference schemas already define `vw_probation_dashboard` and `vw_job_series_tenure`. This pattern avoids duplicating JOIN logic across endpoints.

```sql
-- vw_candidate_list: pre-joined view for candidate list page
CREATE OR REPLACE VIEW vw_candidate_list AS
SELECT
    cs.servant_id,
    CONCAT(p.prefix_name_th, cs.first_name, ' ', cs.last_name) AS full_name,
    cs.current_level_code,
    cs.current_level_start_date,
    qc.target_level_code,
    qc.qualification_date,
    DATEDIFF(qc.qualification_date, CURDATE()) AS remaining_days,
    qc.status,
    qc.education_level,
    qc.total_qualifying_days
FROM civil_servants cs
LEFT JOIN prefixes p ON cs.prefix_id = p.prefix_id
LEFT JOIN qualification_calculation qc ON cs.servant_id = qc.personnel_id
WHERE cs.is_active = 1;
```

### Pattern 4: Entity Name Bridging (civil_servants <-> personnel)

**What:** The existing production DB uses `civil_servants` as the main table, but the reference schemas (career path, probation) reference `personnel`. The new tables must use `civil_servants.servant_id` as the foreign key, NOT `personnel.personnel_id`.

**When:** Converting every PostgreSQL reference schema table to MySQL.

**Why:** Avoid creating a duplicate `personnel` table. The `civil_servants` table IS the personnel table.

```sql
-- WRONG: creates orphan table
CREATE TABLE qualification_calculation (
    personnel_id BIGINT REFERENCES personnel(personnel_id),  -- table doesn't exist!

-- RIGHT: bridge to existing table
CREATE TABLE qualification_calculation (
    servant_id INT NOT NULL,
    FOREIGN KEY (servant_id) REFERENCES civil_servants(servant_id),
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Inline SQL in api.php

**What:** Adding more SQL queries directly in `api.php` switch cases (like the existing `dashboard`, `candidates`, `civil-servants` cases do).

**Why bad:** `api.php` is already 275 lines with 9 route handlers. Adding career path calculation SQL (which involves 5+ table joins and conditional logic) inline will make it unmaintainable.

**Instead:** Extract to service files. Keep `api.php` as a thin router that dispatches to feature-specific handlers.

### Anti-Pattern 2: Client-Side Qualification Calculation

**What:** Sending raw personnel data + promotion_criteria to the frontend and computing eligibility in JavaScript.

**Why bad:** The qualification rules involve complex date arithmetic, conditional education multipliers, combination groups, and cross-table lookups. This belongs in the backend where it can be batch-processed and cached in `qualification_calculation`.

**Instead:** Calculate server-side, store results in `qualification_calculation` table, serve pre-computed results to frontend.

### Anti-Pattern 3: One Giant Migration File

**What:** Converting both PostgreSQL schemas (career path + probation = ~20 tables, 3 views, 3 ALTERs) into a single SQL file.

**Why bad:** Hard to test incrementally, hard to rollback, mixing concerns. Career path tables and probation tables have zero dependencies on each other.

**Instead:** Split into ordered migration files:
1. `03-career-path-tables.sql` (ALTER civil_servants + new career tables)
2. `04-probation-tables.sql` (ALTER civil_servants + new probation tables)
3. `05-career-path-views.sql` (views that depend on career tables)
4. `06-probation-views.sql` (views that depend on probation tables)
5. `07-seed-promotion-criteria.sql` (reference data)
6. `08-seed-probation-programs.sql` (reference data)

### Anti-Pattern 4: Polling for Remaining Days

**What:** Using frontend `setInterval` to update remaining days counts.

**Why bad:** Remaining days change once per calendar day, not in real-time. Polling wastes resources.

**Instead:** Calculate `remaining_days` server-side via SQL `DATEDIFF(end_date, CURDATE())`. Refresh on page load only.

## Suggested Build Order (Dependencies)

The architecture has clear dependency chains that dictate build order:

```
Phase 1: Database Foundation
  03-career-path-tables.sql ----+
  04-probation-tables.sql ------+---> No cross-dependencies, can be parallel
                                |
Phase 2: Seed Data              |
  07-seed-promotion-criteria ---+---> Depends on career tables
  08-seed-probation-programs ---+---> Depends on probation tables
                                |
Phase 3: Backend Services       |
  QualificationEngine.php ------+---> Depends on career tables + seed data
  CandidateListService.php -----+---> Depends on QualificationEngine
  ProbationService.php ---------+---> Depends on probation tables
  candidate_lists.php + api.php-+---> Depends on CandidateListService
  probation.php + api.php ------+---> Depends on ProbationService
                                |
Phase 4: Frontend Integration   |
  useCandidates() composable ---+---> Depends on candidate-lists API
  useProbation() composable ----+---> Depends on probation API
  CandidateListsPage.vue ------+---> Depends on useCandidates()
  ProbationEndPage.vue ---------+---> Depends on useProbation()
  Views (05, 06) ---------------+---> Can be added any time after tables exist
```

**Critical path:** Tables -> Seed Data -> QualificationEngine -> Backend Endpoints -> Frontend Composables -> Page Integration.

The QualificationEngine is the riskiest component because it encodes complex Thai civil service promotion rules. It should be built and tested with seed data before frontend work begins.

## Scalability Considerations

| Concern | Current (~100 servants) | At 1,000 servants | At 10,000 servants |
|---------|------------------------|--------------------|--------------------|
| Qualification recalculation | < 1 second, run on demand | 5-10 seconds, still OK on demand | Batch job, run nightly or on schedule |
| Candidate list query | Direct query, no caching | MySQL VIEW handles well | Add pagination (already in useApi pattern), index on status |
| Probation dashboard | Simple query | Fine with VIEW | Fine with VIEW + index on end_date |
| API response size | All data in one response | Pagination needed | Pagination + server-side search |

For the Ministry of Justice scope (~500-2,000 civil servants), the current architecture is adequate. No need for caching layers, job queues, or microservice decomposition.

## Key Architectural Decision: QualificationEngine Design

The career path qualification calculation is the most complex piece. The `promotion_criteria` table encodes rules like:

- **Simple tenure:** K1->K2 requires 6 years with bachelor's, 4 with master's, 2 with doctorate
- **Combination groups:** M2 requires M1>=1yr OR (M1+K3)>=4yr OR K3>=4yr
- **Diverse experience:** M1 requires "3 differences" (different job series/org/location)
- **Screening lists:** M1/M2 require passing a screening process
- **Position equivalence:** K4->S1 requires 2 years of equivalent management position

The engine should be a stateless PHP class that:

1. Takes a `servant_id` and `target_level_code` as input
2. Queries `promotion_criteria` for applicable rules
3. Queries personnel history for tenure, education, diverse experience
4. Returns a `QualificationResult` object with: `{qualified: bool, qualification_date: date, remaining_days: int, status: string, breakdown: {...}}`
5. Stores the result in `qualification_calculation` table for fast retrieval

This is a **read-heavy, write-rare** pattern. Recalculation happens when:
- New personnel data is entered
- A deadline date changes
- Admin triggers batch recalculation
- Nightly scheduled job (optional)

## Sources

- Existing codebase analysis: `backend/api.php`, `backend/config.php`, `frontend/src/`
- Schema design: `docs/gap_analysis_career_path_v2.sql` (9 new tables + 2 VIEWs + 3 ALTERs)
- Schema design: `docs/probation_tracking_schema.sql` (10 new tables + 1 VIEW)
- Existing MySQL schema: `init.sql`, `additional_tables.sql`
- Legal references from schema comments: PDF ops-career-path (86 pages), career 2569.03.21 master-prep.xlsx
