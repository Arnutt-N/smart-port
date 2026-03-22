# Phase 2: Backend APIs - Research

**Researched:** 2026-03-22
**Domain:** PHP REST API development (pure PHP, no framework), MySQL qualification engine
**Confidence:** HIGH

## Summary

Phase 2 builds PHP REST endpoints for candidate list qualification queries and probation enrollment CRUD. The codebase uses pure PHP with PDO and MySQL -- no framework, no Composer dependencies beyond firebase/php-jwt (which is only used for auth, already in place). All new code follows the established switch-case routing pattern in `api.php` with route logic extracted to separate files.

The core technical challenge is the QualificationEngine -- a computation class that reads `promotion_criteria` from the database, compares personnel tenure against education-dependent year thresholds, and returns qualification status. The database schema (Phase 1) already provides all necessary tables, views, and seed data. The `vw_probation_dashboard` view already computes `remaining_days` via `DATEDIFF`, which the probation GET endpoint can use directly.

**Primary recommendation:** Follow the existing `civil-servants` endpoint pattern exactly (search, pagination, count query, response shape) for both candidate and probation list endpoints. Extract computation logic into `QualificationEngine.php` as a stateless class with `$pdo` injected via constructor.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** QualificationEngine as separate file `QualificationEngine.php` -- complex calculation logic should be isolated
- **D-02:** Add cases in `api.php` switch -> `include 'routes/candidates.php'` and `include 'routes/probation.php'` -- api.php stays as gateway, route logic in separate files
- **D-03:** Shared `helpers.php` for Thai date formatting and level code mapping -- used by both candidates and probation
- **D-04:** Pass `$pdo` as parameter to route handlers -- `handleCandidates($pdo, $method, $path)` -- explicit, no globals
- **D-05:** URL pattern: `GET /candidates/{targetLevel}` -- path param (e.g., `/candidates/K2`, `/candidates/O2`)
- **D-06:** Detail endpoint: `GET /candidates/{targetLevel}/{personnelId}` -- basic info only for v1
- **D-07:** Response includes `summary: { total, qualified, not_yet }` with `data[]` in one response
- **D-08:** Pagination `?limit=20&offset=0` from the start
- **D-09:** Search `?search=keyword` for name/position filtering
- **D-10:** Missing `current_level_code` or `current_level_start_date` -> status "check_data"
- **D-11:** Add `education_level VARCHAR(30)` column to `personnel` table -- default BACHELOR if missing
- **D-12:** Probation API reads from `probation_enrollment` table only -- no display without enrollment record
- **D-13:** Error response format: `{ "error": "message" }` -- consistent with existing codebase
- **D-14:** Full CRUD for probation: GET list, GET detail, POST create, PUT update
- **D-15:** remaining_days computed dynamically: `DATEDIFF(end_date, CURDATE())` -- never stored
- **D-16:** Thai date formatting: `2026-03-22` -> `22 มี.ค. 2569` (add 543 for Buddhist Era)
- **D-17:** Level code mapping: `K1`->`ปฏิบัติการ`, `K2`->`ชำนาญการ`, etc. in helpers.php

### Claude's Discretion
- SQL query optimization (JOIN strategy, index usage)
- Exact function signatures and internal architecture of QualificationEngine
- Error message wording (Thai/English)
- PHP code style details (type hints, docblocks)
- Database migration script format for adding education_level column

### Deferred Ideas (OUT OF SCOPE)
- Drill-down full data (position history, supportive experience) -- DV-01, v2
- Batch recalculation endpoint -- DV-05, v2
- CSV export -- DV-06, v2
- Probation task checklist per enrollment -- DV-02, v2
- Probation stakeholder display -- DV-03, v2
- M1/M2/S1/S2 promotion criteria -- AC-01, AC-02, v2
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CL-01 | QualificationEngine.php computing status from promotion_criteria + personnel tenure + education | Architecture pattern for engine class; promotion_criteria schema with 8 seed rows (3 K2 by education, 1 K3, 1 K4, 2 O2 by education, 1 O3) |
| CL-02 | GET /candidates/:targetLevel -- list with computed qualification status | Existing civil-servants endpoint pattern (search, pagination, count); response shape matching frontend mock data |
| CL-03 | GET /candidates/:targetLevel/:personnelId -- detailed breakdown | Single-record query pattern from existing profile endpoint |
| CL-04 | Qualification status computation: remaining_days, qualification_date, status | Date arithmetic via MySQL DATEDIFF and PHP date functions; 3 status values: qualified/not_yet/check_data |
| CL-05 | Education-aware calculation (K1->K2: 6yr bachelor, 4yr master, 2yr doctorate) | promotion_criteria table has separate rows per education_condition; engine must match personnel.education_level to correct criteria row |
| PT-01 | GET /probation -- list with remaining days | vw_probation_dashboard view already computes remaining_days; can query directly |
| PT-02 | GET /probation/:enrollmentId -- detailed info | JOIN probation_enrollment with personnel, organization, position tables |
| PT-03 | POST /probation -- create enrollment | INSERT into probation_enrollment with validation; existing pattern for reading POST body via php://input |
| PT-04 | PUT /probation/:enrollmentId -- update enrollment | UPDATE probation_enrollment; existing PUT pattern not present but straightforward |
| PT-05 | remaining_days computed dynamically as DATEDIFF(end_date, CURDATE()) | Already in vw_probation_dashboard; for detail endpoint use inline DATEDIFF |
| SH-01 | Thai date formatting utility (Buddhist Era) | PHP date functions + 543 year offset; month name array in Thai |
| SH-02 | Level code to Thai name mapping | Static associative array in helpers.php |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PHP | 8.3 | Backend runtime | Already in Docker, no change needed |
| PDO (MySQL) | Built-in | Database access | Already configured in config.php with prepared statements |
| MySQL | 8.0 | Database | Already running in Docker on port 3306 |

### Supporting
No additional libraries needed. This phase uses only built-in PHP functions and existing project dependencies. The JWT auth layer (auth.php) is already in place and protects all non-login routes automatically.

### Alternatives Considered
None. The decisions lock this to pure PHP with no framework, matching the existing codebase.

## Architecture Patterns

### Recommended Project Structure
```
backend/
├── api.php                    # Gateway -- add 2 new cases (candidates, probation)
├── auth.php                   # Existing JWT auth (unchanged)
├── config.php                 # Existing PDO config (unchanged)
├── helpers.php                # NEW: Thai date formatting + level code mapping
├── QualificationEngine.php    # NEW: Qualification computation class
├── routes/
│   ├── candidates.php         # NEW: handleCandidates($pdo, $method, $path)
│   └── probation.php          # NEW: handleProbation($pdo, $method, $path)
└── ...
database/
└── 07-add-education-level.sql # NEW: ALTER TABLE personnel ADD education_level
```

### Pattern 1: Route Delegation (from existing api.php)
**What:** api.php switch statement delegates to included route files
**When to use:** All new endpoint groups
**Example:**
```php
// In api.php -- add new cases to existing switch
case 'candidates':
    include __DIR__ . '/routes/candidates.php';
    handleCandidates($pdo, $method, $path);
    break;

case 'probation':
    include __DIR__ . '/routes/probation.php';
    handleProbation($pdo, $method, $path);
    break;
```

### Pattern 2: List Endpoint with Search + Pagination (from civil-servants)
**What:** GET list with `?search=` and `?limit=&offset=` query params, dual query (data + count)
**When to use:** Both candidate list and probation list endpoints
**Example:**
```php
// Source: backend/api.php lines 127-185 (civil-servants case)
$search = $_GET['search'] ?? '';
$limit = intval($_GET['limit'] ?? 20);
$offset = intval($_GET['offset'] ?? 0);

$params = [];
$whereClause = ' WHERE 1=1';
if (!empty($search)) {
    $whereClause .= ' AND (p.first_name LIKE ? OR p.last_name LIKE ?)';
    $searchTerm = "%{$search}%";
    $params = [$searchTerm, $searchTerm];
}

// Data query with LIMIT/OFFSET
$sql = "SELECT ... FROM ... {$whereClause} ORDER BY ... LIMIT {$limit} OFFSET {$offset}";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$data = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Count query for pagination
$countSql = "SELECT COUNT(*) as total FROM ... {$whereClause}";
$countStmt = $pdo->prepare($countSql);
$countStmt->execute($params);
$total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];

echo json_encode([
    'success' => true,
    'data' => $data,
    'summary' => ['total' => $total, 'qualified' => $qualCount, 'not_yet' => $notYetCount],
    'pagination' => ['total' => $total, 'limit' => $limit, 'offset' => $offset, 'has_more' => ($offset + $limit) < $total]
]);
```

### Pattern 3: QualificationEngine Class
**What:** Stateless computation class that reads promotion_criteria and computes qualification status per personnel
**When to use:** Called by candidates route handler
**Example:**
```php
class QualificationEngine {
    private PDO $pdo;

    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
    }

    /**
     * Compute qualification for a list of personnel targeting a specific level
     * @param string $targetLevel e.g. 'K2', 'K3', 'O2'
     * @return array Each item has: personnel data + qualification_date, remaining_days, status
     */
    public function computeForLevel(string $targetLevel, ?string $search = null, int $limit = 20, int $offset = 0): array {
        // 1. Determine source_level from target (K2 -> K1, K3 -> K2, O2 -> O1, etc.)
        // 2. Get promotion_criteria rows for this target_level_code
        // 3. Query personnel WHERE current_level_code = source_level
        // 4. For each person, match criteria by education_level
        // 5. Compute: qualification_date = current_level_start_date + (min_years * 365.25)
        // 6. Compute: remaining_days = DATEDIFF(qualification_date, CURDATE())
        // 7. Determine status: remaining_days <= 0 -> 'qualified', > 0 -> 'not_yet', missing data -> 'check_data'
        // 8. Return with summary counts
    }

    public function computeDetail(string $targetLevel, int $personnelId): ?array {
        // Single-person detailed breakdown
    }
}
```

### Pattern 4: Thai Date Formatting Helper
**What:** Convert SQL date to Thai Buddhist Era formatted string
**When to use:** All date fields in API responses
**Example:**
```php
// In helpers.php
function formatThaiDate(?string $dateStr): ?string {
    if (!$dateStr) return null;
    $months = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
               'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    $date = new DateTime($dateStr);
    $day = intval($date->format('d'));
    $month = intval($date->format('m'));
    $yearBE = intval($date->format('Y')) + 543;
    return "{$day} {$months[$month]} {$yearBE}";
}

function getLevelName(string $code): string {
    $map = [
        'K1' => 'ปฏิบัติการ', 'K2' => 'ชำนาญการ', 'K3' => 'ชำนาญการพิเศษ',
        'K4' => 'เชี่ยวชาญ', 'K5' => 'ทรงคุณวุฒิ',
        'O1' => 'ปฏิบัติงาน', 'O2' => 'ชำนาญงาน', 'O3' => 'อาวุโส',
        'M1' => 'อำนวยการ ต้น', 'M2' => 'อำนวยการ สูง',
        'S1' => 'บริหาร ต้น', 'S2' => 'บริหาร สูง',
    ];
    return $map[$code] ?? $code;
}
```

### Anti-Patterns to Avoid
- **Global $pdo usage:** Pass `$pdo` explicitly as parameter (D-04). Never use `global $pdo` inside route handlers.
- **Storing remaining_days in DB:** Always compute dynamically via DATEDIFF (D-15). The `remaining_days` column in `probation_enrollment` exists in schema but should NOT be written to -- the view computes it.
- **Hardcoded promotion criteria:** Read from `promotion_criteria` table, never hardcode year thresholds in PHP code.
- **Inline route logic in api.php:** Keep api.php slim -- all route logic goes in `routes/` files.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT auth | Custom JWT library | Existing `auth.php` + `getAuthHeader()` | Already works, battle-tested in this codebase |
| Date arithmetic | PHP date math for remaining days | MySQL `DATEDIFF()` in queries | Database handles timezone-consistent date math; avoids PHP/MySQL date mismatch |
| Probation dashboard query | Custom JOINs for probation list | `vw_probation_dashboard` view | View already computes remaining_days, joins personnel/org/position, filters IN_PROGRESS |
| Input validation for POST/PUT | Custom validation framework | Simple inline checks with early-return error responses | No framework in this project; keep it simple and consistent |

**Key insight:** The Phase 1 database views (`vw_probation_dashboard`, `vw_job_series_tenure`) were designed specifically to simplify these API queries. Use them rather than rewriting the JOIN logic.

## Common Pitfalls

### Pitfall 1: Education Level Missing from Personnel Table
**What goes wrong:** The `personnel` table from Phase 1 does NOT have an `education_level` column. The QualificationEngine needs it to select the correct promotion_criteria row (K1->K2 has 3 rows: BACHELOR=6yr, MASTER=4yr, DOCTORATE=2yr).
**Why it happens:** Phase 1 created the personnel table based on the original schema which didn't include education.
**How to avoid:** Create migration `07-add-education-level.sql` with `ALTER TABLE personnel ADD COLUMN education_level VARCHAR(30) DEFAULT 'BACHELOR'`. Update seed data to give sample personnel varied education levels for testing.
**Warning signs:** All K1->K2 candidates showing 6-year threshold regardless of actual education.

### Pitfall 2: Target Level to Source Level Mapping
**What goes wrong:** The API receives a target level (e.g., `K2`) but needs to query personnel at the source level (`K1`). If the mapping is wrong, the wrong people appear in the list.
**Why it happens:** The `promotion_criteria` table stores both `source_level_code` and `target_level_code`, but you need to extract the source level from the criteria to filter personnel.
**How to avoid:** Query `promotion_criteria WHERE target_level_code = ?` first, get DISTINCT `source_level_code`, then filter personnel by those source levels. This handles edge cases like multiple source levels for one target.
**Warning signs:** Empty candidate lists, or lists showing people already at the target level.

### Pitfall 3: PDO Integer Binding for LIMIT/OFFSET
**What goes wrong:** PDO prepared statements bind LIMIT/OFFSET as strings by default, causing MySQL errors or unexpected behavior.
**Why it happens:** PDO::PARAM_STR is the default. LIMIT requires integer.
**How to avoid:** Either use `intval()` and interpolate directly (as the existing `civil-servants` endpoint does -- see api.php line 163), OR use `bindValue($n, $val, PDO::PARAM_INT)`. The existing codebase interpolates after `intval()` -- follow the same pattern for consistency.
**Warning signs:** SQL errors on paginated queries.

### Pitfall 4: Date Calculation Precision (Years to Days)
**What goes wrong:** Converting "6 years" to days using `6 * 365` misses leap years. A person with exactly 6 years tenure might show as "not yet" due to off-by-one.
**Why it happens:** Calendar years vary in length.
**How to avoid:** Use MySQL `DATE_ADD(current_level_start_date, INTERVAL min_years YEAR)` to compute qualification_date, then `DATEDIFF(qualification_date, CURDATE())` for remaining days. This handles leap years correctly. Note: `min_years` in promotion_criteria is DECIMAL(4,1), so for whole years use `INTERVAL X YEAR`. For fractional years, convert to months or use `DATE_ADD` with months.
**Warning signs:** Off-by-one errors near qualification dates, especially around Feb 29.

### Pitfall 5: `routes/` Directory Does Not Exist
**What goes wrong:** `include __DIR__ . '/routes/candidates.php'` fails if the `routes/` directory hasn't been created.
**Why it happens:** The existing backend has no subdirectories for route files.
**How to avoid:** The plan must explicitly create the `backend/routes/` directory before writing route files.
**Warning signs:** PHP fatal error on include.

### Pitfall 6: Existing `candidates` Case in api.php
**What goes wrong:** There is already a `case 'candidates':` in api.php (lines 228-269) that queries `civil_servants` table. The new implementation replaces this entirely.
**Why it happens:** The old endpoint was a simple list from `civil_servants`; the new one queries `personnel` with qualification computation.
**How to avoid:** Replace the existing `case 'candidates':` block entirely with the new route delegation. Do not add a second case -- that would be a PHP syntax error.
**Warning signs:** Old endpoint behavior persisting, queries hitting wrong table.

### Pitfall 7: Frontend Field Name Mismatch
**What goes wrong:** Frontend expects camelCase keys (`currentPosition`, `remainingDays`, `dueDate`) but PHP/MySQL convention is snake_case.
**Why it happens:** Frontend mock data uses camelCase; backend typically returns snake_case from MySQL column aliases.
**How to avoid:** Use MySQL column aliases to match frontend expectations OR transform keys in PHP before json_encode. Given the frontend will be updated in Phase 3, use snake_case in the API (`current_position`, `remaining_days`, `due_date`) and let Phase 3 handle the mapping. But check D-07 and the CONTEXT specifics -- the response shape should be documented clearly so Phase 3 knows what to expect. The existing backend uses snake_case (`servant_id`, `full_name`) so stick with snake_case.
**Warning signs:** Frontend receiving undefined values for expected fields.

## Code Examples

### Qualification Computation SQL
```sql
-- Get personnel eligible for a target level with qualification computation
-- Example: target_level = 'K2' (source = 'K1')
SELECT
    p.personnel_id,
    CONCAT(p.first_name, ' ', p.last_name) AS full_name,
    pos.position_name,
    p.current_level_code,
    p.current_level_start_date,
    COALESCE(p.education_level, 'BACHELOR') AS education_level,
    pc.min_years,
    DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR) AS qualification_date,
    DATEDIFF(
        DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
        CURDATE()
    ) AS remaining_days,
    CASE
        WHEN p.current_level_start_date IS NULL OR p.current_level_code IS NULL THEN 'check_data'
        WHEN DATEDIFF(
            DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
            CURDATE()
        ) <= 0 THEN 'qualified'
        ELSE 'not_yet'
    END AS status
FROM personnel p
LEFT JOIN position pos ON p.current_position_id = pos.position_id
LEFT JOIN organization o ON p.current_org_id = o.org_id
LEFT JOIN promotion_criteria pc ON pc.target_level_code = :targetLevel
    AND pc.source_level_code = p.current_level_code
    AND (pc.education_condition = COALESCE(p.education_level, 'BACHELOR')
         OR pc.education_condition = 'ANY')
    AND pc.is_active = 1
WHERE p.current_level_code IN (
    SELECT DISTINCT source_level_code FROM promotion_criteria
    WHERE target_level_code = :targetLevel AND is_active = 1
)
AND p.is_active = 1
ORDER BY remaining_days ASC;
```

### Probation List Using View
```sql
-- Probation list with dynamic remaining_days (from vw_probation_dashboard)
SELECT
    enrollment_id,
    personnel_id,
    full_name,
    position_name,
    department,
    probation_start AS start_date,
    probation_end AS end_date,
    remaining_days,
    overall_status AS status,
    total_tasks,
    completed_tasks
FROM vw_probation_dashboard
ORDER BY remaining_days ASC;
```

### POST Probation Enrollment
```php
// Source: follows existing pattern from api.php auth/login case
$data = json_decode(file_get_contents('php://input'), true);

// Validate required fields
$required = ['personnel_id', 'program_id', 'start_date', 'end_date'];
foreach ($required as $field) {
    if (empty($data[$field])) {
        http_response_code(400);
        echo json_encode(['error' => "Missing required field: {$field}"]);
        return;
    }
}

$stmt = $pdo->prepare("
    INSERT INTO probation_enrollment (personnel_id, program_id, start_date, end_date, overall_status)
    VALUES (?, ?, ?, ?, 'IN_PROGRESS')
");
$stmt->execute([$data['personnel_id'], $data['program_id'], $data['start_date'], $data['end_date']]);
$enrollmentId = $pdo->lastInsertId();

echo json_encode(['success' => true, 'enrollment_id' => $enrollmentId]);
```

### PUT Probation Enrollment Update
```php
$data = json_decode(file_get_contents('php://input'), true);
$enrollmentId = $path[1] ?? null;

if (!$enrollmentId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing enrollment ID']);
    return;
}

// Build dynamic SET clause from allowed fields
$allowed = ['overall_status', 'final_result', 'final_result_date', 'extension_end_date', 'extension_reason', 'remarks'];
$sets = [];
$params = [];
foreach ($allowed as $field) {
    if (isset($data[$field])) {
        $sets[] = "{$field} = ?";
        $params[] = $data[$field];
    }
}

if (empty($sets)) {
    http_response_code(400);
    echo json_encode(['error' => 'No valid fields to update']);
    return;
}

$params[] = $enrollmentId;
$sql = "UPDATE probation_enrollment SET " . implode(', ', $sets) . " WHERE enrollment_id = ?";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);

echo json_encode(['success' => true]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Existing `case 'candidates':` queries `civil_servants` table | New implementation queries `personnel` table with qualification engine | Phase 2 | Must replace existing case block entirely |
| No education_level on personnel | Add via ALTER TABLE migration | Phase 2 | Required for education-aware K1->K2 calculation |
| No route file separation | Route logic in `routes/` subdirectory | Phase 2 | New pattern for this codebase; api.php stays slim |

## Open Questions

1. **education_level values for O-series (vocational track)**
   - What we know: K-series uses BACHELOR/MASTER/DOCTORATE. O-series seed data uses VOCATIONAL_CERT and HIGH_VOCATIONAL.
   - What's unclear: Whether current sample personnel have O-series education levels, and whether the `education_level` column needs to support both K-series and O-series education categories.
   - Recommendation: Use a single `education_level` column with values: BACHELOR, MASTER, DOCTORATE, VOCATIONAL_CERT, HIGH_VOCATIONAL. The promotion_criteria `education_condition` column already handles the mapping per target level. Default to BACHELOR for K-series, VOCATIONAL_CERT for O-series when missing -- or simpler: just default to the highest-threshold education per Decision D-11 (BACHELOR for all, which means safe/conservative default).

2. **Fractional min_years in promotion_criteria**
   - What we know: `min_years` is DECIMAL(4,1) allowing values like 2.0, 4.0, 6.0. All seed data uses whole numbers.
   - What's unclear: Whether fractional years (e.g., 2.5) will ever be needed.
   - Recommendation: Use `INTERVAL FLOOR(min_years) YEAR` + `INTERVAL ((min_years - FLOOR(min_years)) * 12) MONTH` for precision, but for v1 with whole numbers, `INTERVAL CAST(min_years AS UNSIGNED) YEAR` is sufficient.

3. **vw_probation_dashboard filters only IN_PROGRESS**
   - What we know: The view has `WHERE pe.overall_status = 'IN_PROGRESS'` hardcoded.
   - What's unclear: Whether the probation list API should show all statuses or only IN_PROGRESS.
   - Recommendation: For the GET list, query the view for the default case (shows active probations). If a `?status=all` param is needed later, write a direct query bypassing the view. For v1, the view is sufficient per D-12.

## Sources

### Primary (HIGH confidence)
- `backend/api.php` -- Existing routing pattern, response format, search/pagination implementation (lines 127-185 for civil-servants)
- `backend/config.php` -- PDO configuration with utf8mb4, ERRMODE_EXCEPTION, FETCH_ASSOC defaults
- `backend/auth.php` -- JWT validation flow, getAuthHeader() function
- `database/04-career-path.sql` -- promotion_criteria schema, qualification_calculation table, views
- `database/05-probation.sql` -- probation_enrollment schema, vw_probation_dashboard view definition
- `database/06-seed-data.sql` -- 8 promotion_criteria rows, 7 sample personnel, 3 probation enrollments
- `database/03-personnel-stubs.sql` -- personnel table schema (columns: current_level_code, current_level_start_date, no education_level yet)
- `frontend/src/pages/CandidateListsPage.vue` -- Mock data shape: id, name, currentPosition, currentLevel, dueDate, remainingDays, status, section
- `frontend/src/pages/ProbationEndPage.vue` -- Mock data shape: id, name, position, department, startDate, endDate, remainingDays, status
- `.planning/phases/02-backend-apis/2-CONTEXT.md` -- All locked decisions D-01 through D-17

### Secondary (MEDIUM confidence)
- PHP 8.3 PDO documentation -- date handling, prepared statement behavior with LIMIT/OFFSET
- MySQL 8.0 DATE_ADD / DATEDIFF functions -- leap year handling confirmed correct

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing tools
- Architecture: HIGH -- follows established patterns from existing codebase, all decisions locked
- Pitfalls: HIGH -- identified from direct code analysis of existing api.php and database schema
- Qualification engine: MEDIUM -- SQL approach verified against schema, but edge cases around fractional years and multi-criteria matching need implementation-time validation

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- pure PHP backend with no external dependency changes expected)
