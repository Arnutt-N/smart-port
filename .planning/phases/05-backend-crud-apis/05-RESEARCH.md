# Phase 5: Backend CRUD APIs - Research

**Researched:** 2026-03-22 (re-researched 2026-03-22)
**Domain:** PHP REST API CRUD endpoints with server-side business logic
**Confidence:** HIGH

## Summary

Phase 5 builds three sets of CRUD API endpoints following the exact architecture pattern already established in `routes/probation.php`. The primary technical challenges are: (1) server-side date arithmetic for `total_days` and `effective_days`, (2) handling MySQL GENERATED columns in INSERT/UPDATE, (3) enforcing approval status transitions for position equivalence, and (4) extracting `user_id` from JWT for `approved_by` -- a pattern not yet used in any existing route handler.

No new libraries or dependencies are needed. The existing pure-PHP, no-framework approach with PDO prepared statements is the established stack. All three route handlers follow the `handleX(PDO $pdo, string $method, array $path)` signature, dispatch on `$method` via switch, and delegate to sub-functions.

**Primary recommendation:** Create three route files (`routes/supportive.php`, `routes/diverse.php`, `routes/equivalence.php`) following the `probation.php` CRUD pattern verbatim, with server-side computation in the create/update handlers. The equivalence handler requires a new pattern: extracting `user_id` from the JWT token for the `approved_by` field.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Routes: `/supportive`, `/diverse`, `/equivalence` -- registered as case blocks in api.php
- **D-02:** All list endpoints accept `?personnel_id=X` as optional filter. Without it, return all records (paginated). This matches the civil-servants endpoint pattern.
- **D-03:** Pagination follows existing format: `?limit=20&offset=0` -> response includes `{ total, limit, offset, has_more }`
- **D-04:** Client sends `primary_series_name` in POST/PUT body. API looks up `ratio_percent` from `supportive_job_series` table using both `primary_series_name` and `job_series_name` (the supportive series). Default to 100 if no mapping found.
- **D-05:** `total_days = DATEDIFF(end_date, start_date) + 1` (inclusive Thai HR counting)
- **D-06:** `effective_days = total_days x ratio_percent / 100` -- computed server-side, never accepted from client
- **D-07:** `net_years = floor(effective_days / 365)`, `net_months = floor((effective_days % 365) / 30)`, `net_day_remainder = effective_days % 365 % 30`. `net_end_date = start_date + effective_days`. All computed server-side.
- **D-08:** `diff_count` is MySQL GENERATED STORED -- never include in INSERT/UPDATE. Only write the 4 boolean flags.
- **D-09:** `qualified_date` = `to_start_date` when diff_count >= 3, NULL otherwise. Computed in PHP after calculating diff_count from the 4 booleans.
- **D-10:** `from_total_days` and `to_total_days` computed server-side with DATEDIFF+1, same as supportive.
- **D-11:** Status transitions: PENDING -> APPROVED, PENDING -> REJECTED. No reverse. No APPROVED <-> REJECTED.
- **D-12:** On APPROVED: require `approved_start_date`, `approved_end_date` in request body. Compute `approved_total_days = DATEDIFF(approved_end_date, approved_start_date) + 1`. Record `approved_by` from JWT user_id.
- **D-13:** On REJECTED: NULL out `approved_start_date`, `approved_end_date`, `approved_total_days`.
- **D-14:** POST creates with `approval_status = 'PENDING'` always -- client cannot set status on creation.
- **D-15:** Thai error messages for validation errors (กรุณาระบุ..., ไม่พบรายการ..., ไม่สามารถเปลี่ยนสถานะ...)
- **D-16:** Success responses: `{ "success": true, "data": ... }` for GET, `{ "success": true, "<entity>_id": N }` for POST

### Claude's Discretion
- Exact column selection in SELECT queries (include all relevant columns)
- JOIN strategy for personnel name in GET detail/list
- Whether to include Thai-formatted dates in GET responses (recommended: yes, following probation.php pattern)
- DELETE implementation -- simple hard delete, no soft delete

### Deferred Ideas (OUT OF SCOPE)
- net_years/net_months/net_day_remainder computation needs HR validation against Excel -- flag for post-v1.1
- RBAC for approval (who can approve equivalence) -- deferred to v2
- DELETE cascading recalculation -- QualificationEngine (Phase 7) reads live data, no cascade needed
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SE-02 | API CRUD endpoints for supportive_experience (GET list, POST create, PUT update, DELETE) | Route handler pattern from probation.php; pagination from civil-servants endpoint; Pattern 1-5 below |
| SE-04 | Compute effective_days = total_days x ratio from supportive_job_series mapping | PHP DateTime::diff() for day calc; ratio lookup from supportive_job_series table using `primary_series_name` + `supportive_series_name` columns; Pattern 6 below |
| DE-01 | API CRUD endpoints for diverse_experience (GET list, POST create, PUT update, DELETE) | Route handler pattern; GENERATED column exclusion pattern; Pattern 1-5 below |
| DE-03 | Auto-compute diff_count + qualified_date when >= 3 diff | diff_count is MySQL GENERATED STORED (auto); qualified_date set in PHP when sum of 4 booleans >= 3; Pitfall 1 and 6 below |
| PE-01 | API CRUD endpoints for position_equivalence (GET list, POST request, PUT approve/reject) | Route handler pattern; status transition enforcement; Pattern 7 below |
| PE-03 | Compute approved_total_days from approved records only | DATEDIFF computation in PHP on approval; NULL on rejection; approved_by from JWT; Pattern 8 below |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PHP | 8.3 | Backend runtime | Already in Docker |
| PDO | built-in | Database access | Already configured in config.php |
| MySQL | 8.0 | Database | Already in Docker |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| helpers.php | existing | formatThaiDate, getLevelName | Date formatting in GET responses |

### Alternatives Considered
None needed. The stack is locked by the existing architecture.

## Architecture Patterns

### Recommended Project Structure
```
backend/
  api.php              # Gateway - add 3 new case blocks
  routes/
    candidates.php     # Existing (read-only)
    probation.php      # Existing (CRUD) - PRIMARY template
    supportive.php     # NEW - supportive experience CRUD
    diverse.php        # NEW - diverse experience CRUD
    equivalence.php    # NEW - position equivalence CRUD
  helpers.php          # Shared utilities - add new helpers if needed
  config.php           # DB connection (unchanged)
  auth.php             # JWT auth (unchanged)
```

### Pattern 1: Route Handler Function Signature
**What:** Every route file exports a single `handleX(PDO $pdo, string $method, array $path)` function
**When to use:** Always -- this is the established pattern
**Example (from probation.php):**
```php
function handleSupportive(PDO $pdo, string $method, array $path): void
{
    switch ($method) {
        case 'GET':
            $id = $path[1] ?? null;
            if ($id !== null) {
                getSupportiveDetail($pdo, intval($id));
            } else {
                getSupportiveList($pdo);
            }
            break;
        case 'POST':
            createSupportive($pdo);
            break;
        case 'PUT':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID']);
                return;
            }
            updateSupportive($pdo, intval($id));
            break;
        case 'DELETE':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID']);
                return;
            }
            deleteSupportive($pdo, intval($id));
            break;
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
}
```

### Pattern 2: API Gateway Registration
**What:** Each route is registered in api.php via a case in the switch statement
**When to use:** For each new route file
**Example:**
```php
case 'supportive':
    include __DIR__ . '/routes/supportive.php';
    handleSupportive($pdo, $method, $path);
    break;
```

### Pattern 3: List Endpoint with Pagination and Optional personnel_id Filter
**What:** GET list follows the civil-servants pagination format with optional `?personnel_id=X`
**When to use:** All list endpoints
**Example:**
```php
function getSupportiveList(PDO $pdo): void
{
    $personnelId = $_GET['personnel_id'] ?? null;
    $limit = intval($_GET['limit'] ?? 20);
    $offset = intval($_GET['offset'] ?? 0);

    $where = '';
    $params = [];

    if ($personnelId) {
        $where = ' WHERE se.personnel_id = ?';
        $params[] = intval($personnelId);
    }

    // Data query
    $sql = "SELECT se.*, CONCAT(p.first_name, ' ', p.last_name) AS full_name
            FROM supportive_experience se
            LEFT JOIN personnel p ON se.personnel_id = p.personnel_id
            {$where}
            ORDER BY se.start_date DESC
            LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Thai date formatting (following probation.php pattern)
    foreach ($rows as &$row) {
        $row['start_date_thai'] = formatThaiDate($row['start_date']);
        $row['end_date_thai'] = formatThaiDate($row['end_date']);
    }
    unset($row);

    // Count query
    $countSql = "SELECT COUNT(*) AS total FROM supportive_experience se {$where}";
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $total = intval($countStmt->fetch(PDO::FETCH_ASSOC)['total']);

    echo json_encode([
        'success' => true,
        'data' => $rows,
        'pagination' => [
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => ($offset + $limit) < $total
        ]
    ]);
}
```

### Pattern 4: Required Field Validation with Thai Error Messages
**What:** Loop through required fields and return 400 if missing
**When to use:** POST and PUT handlers
**Example (adapted from probation.php with D-15 Thai messages):**
```php
$data = json_decode(file_get_contents('php://input'), true);

$required = ['personnel_id', 'start_date', 'end_date'];
foreach ($required as $field) {
    if (!isset($data[$field]) || $data[$field] === '') {
        http_response_code(400);
        echo json_encode(['error' => "กรุณาระบุ {$field}"]);
        return;
    }
}
```

### Pattern 5: Allowed-Fields Update (Whitelist)
**What:** Whitelist approach for UPDATE to prevent arbitrary field writes
**When to use:** All PUT handlers
**Example (from probation.php):**
```php
$allowed = ['start_date', 'end_date', 'description'];
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
    echo json_encode(['error' => 'ไม่มีข้อมูลที่จะอัปเดต']);
    return;
}

$params[] = $id;
$sql = "UPDATE table SET " . implode(', ', $sets) . " WHERE id = ?";
```

### Pattern 6: Server-Side Date Computation with Ratio Lookup
**What:** Compute total_days from start_date/end_date, then derive effective_days using ratio from supportive_job_series
**When to use:** Supportive experience create/update
**Critical column mapping:** The lookup query must use `supportive_job_series.supportive_series_name` (NOT `job_series_name`) -- these are different column names across tables.
**Example:**
```php
// Compute total_days = DATEDIFF(end_date, start_date) + 1
$startDate = new DateTime($data['start_date']);
$endDate = new DateTime($data['end_date']);
$totalDays = $endDate->diff($startDate)->days + 1;

// Lookup ratio from supportive_job_series
// NOTE: supportive_experience.job_series_name maps to supportive_job_series.supportive_series_name
$ratioPercent = 100; // default if no mapping found (D-04)
if (isset($data['primary_series_name'])) {
    $ratioStmt = $pdo->prepare(
        "SELECT ratio_percent FROM supportive_job_series
         WHERE primary_series_name = ? AND supportive_series_name = ?
         AND is_active = 1 LIMIT 1"
    );
    $ratioStmt->execute([$data['primary_series_name'], $data['job_series_name']]);
    $ratioRow = $ratioStmt->fetch(PDO::FETCH_ASSOC);
    if ($ratioRow) {
        $ratioPercent = intval($ratioRow['ratio_percent']);
    }
}

$effectiveDays = $totalDays * $ratioPercent / 100;

// D-07: net_* computations
$netYears = floor($effectiveDays / 365);
$netMonths = floor(($effectiveDays % 365) / 30);
$netDayRemainder = $effectiveDays % 365 % 30;
// net_end_date = start_date + effective_days
$netEndDate = clone $startDate;
$netEndDate->modify("+{$effectiveDays} days");
$netEndDateStr = $netEndDate->format('Y-m-d');
```

### Pattern 7: Approval Status Transition Enforcement
**What:** Only allow PENDING -> APPROVED or PENDING -> REJECTED transitions
**When to use:** Position equivalence PUT handler
**Example:**
```php
// Fetch current status
$stmt = $pdo->prepare("SELECT approval_status FROM position_equivalence WHERE equivalence_id = ?");
$stmt->execute([$id]);
$current = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$current) {
    http_response_code(404);
    echo json_encode(['error' => 'ไม่พบรายการเทียบตำแหน่ง']);
    return;
}

$newStatus = $data['approval_status'] ?? null;
$validTransitions = ['PENDING' => ['APPROVED', 'REJECTED']];

if ($newStatus && !in_array($newStatus, $validTransitions[$current['approval_status']] ?? [])) {
    http_response_code(400);
    echo json_encode(['error' => "ไม่สามารถเปลี่ยนสถานะจาก {$current['approval_status']} เป็น {$newStatus}"]);
    return;
}
```

### Pattern 8: Extracting user_id from JWT for approved_by (NEW PATTERN)
**What:** Decode the JWT token inside a route handler to get the current user's ID
**When to use:** Position equivalence approval (D-12 requires `approved_by` from JWT user_id)
**Why this is new:** No existing route handler extracts user_id from JWT. The gateway (`api.php`) validates the token but does NOT pass the decoded payload to route handlers. The route handler must decode the token itself.
**Example:**
```php
// Get user_id from JWT for approved_by
$token = getAuthHeader();
$payload = validateJWT($token);
$userId = $payload['user_id'] ?? null;

// Use in UPDATE
// approved_by = $userId
```
**Note:** `validateJWT()` returns `$payload['data']` which is `['user_id' => $user_id]`. The token is already validated at the gateway level, so this second call is safe (just decoding). The `auth.php` functions are available because `api.php` includes `auth.php` before routing.

### Anti-Patterns to Avoid
- **Including diff_count in INSERT/UPDATE:** This is a MySQL GENERATED STORED column. Including it causes MySQL error 3105. Only include the 4 boolean flags; diff_count is auto-computed.
- **Client-submitted diff_count or effective_days:** These are server-computed values. Ignore any client-submitted values for these fields.
- **Missing +1 on DATEDIFF:** Thai HR date counting is inclusive. `total_days = DATEDIFF(end, start) + 1`. Forgetting the +1 causes off-by-one errors.
- **Allowing reverse status transitions:** APPROVED/REJECTED should NOT transition back to PENDING or to each other.
- **Hardcoding ratio_percent:** Always look up from supportive_job_series table; different mappings may have different ratios.
- **Using `job_series_name` as column name in supportive_job_series lookup:** The column in `supportive_job_series` is `supportive_series_name`, not `job_series_name`. The `job_series_name` column lives in `supportive_experience`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date difference | Manual day counting | PHP DateTime::diff() | Handles leap years, month boundaries correctly |
| JSON parsing | Custom parsing | json_decode(file_get_contents('php://input'), true) | Already established pattern in api.php |
| Thai date formatting | Custom formatter | formatThaiDate() from helpers.php | Already exists and handles Buddhist Era conversion |
| SQL injection prevention | String concatenation | PDO prepared statements with ? placeholders | Already configured in config.php with ERRMODE_EXCEPTION |
| Pagination | Custom logic | Existing `{ total, limit, offset, has_more }` pattern | Matches civil-servants and probation endpoints exactly |

**Key insight:** Everything needed already exists in the codebase. The task is replication with domain-specific business logic, not invention. The one genuinely new pattern is JWT user_id extraction for `approved_by`.

## Common Pitfalls

### Pitfall 1: MySQL GENERATED Column in INSERT/UPDATE
**What goes wrong:** Including `diff_count` in an INSERT or UPDATE statement on `diverse_experience` causes MySQL error 3105: "The value specified for generated column 'diff_count' in table 'diverse_experience' is not allowed."
**Why it happens:** `diff_count` was altered to `GENERATED ALWAYS AS (is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature) STORED` in migration 08.
**How to avoid:** Never include `diff_count` in INSERT column list or UPDATE SET clause. Only insert/update the 4 boolean flags. MySQL computes `diff_count` automatically.
**Warning signs:** MySQL error 3105 during testing.

### Pitfall 2: Off-By-One in Date Counting
**What goes wrong:** `DATEDIFF('2024-01-05', '2024-01-01')` returns 4, but HR counts this as 5 days (inclusive of both start and end).
**Why it happens:** DATEDIFF returns the difference in days (end - start), which is exclusive of the start date.
**How to avoid:** Always add 1: `$totalDays = $endDate->diff($startDate)->days + 1`. In MySQL: `DATEDIFF(end_date, start_date) + 1`.
**Warning signs:** Totals that are one less than expected when verified against HR Excel.

### Pitfall 3: Allowing Writes to Server-Computed Fields
**What goes wrong:** Client sends `effective_days` or `diff_count` in POST body, and the handler inserts the client value instead of computing server-side.
**Why it happens:** Using the entire `$data` array without filtering computed fields.
**How to avoid:** Explicitly list insert/update columns. Never use `$data` directly in SQL. Compute `effective_days`, `total_days`, `net_*` fields server-side.
**Warning signs:** Values that don't match the computation formula.

### Pitfall 4: approved_total_days on Non-Approved Records
**What goes wrong:** A PENDING or REJECTED equivalence record has `approved_total_days` set, and downstream QualificationEngine sums it.
**Why it happens:** Not clearing/nulling `approved_total_days` when status is not APPROVED.
**How to avoid:** Only set `approved_start_date`, `approved_end_date`, `approved_total_days` when `approval_status = 'APPROVED'`. On REJECTED, explicitly NULL these fields (D-13).
**Warning signs:** Qualification date calculations including unapproved days.

### Pitfall 5: Missing personnel_id Filter on List Endpoints
**What goes wrong:** GET list returns ALL records across ALL personnel instead of filtering by personnel_id.
**Why it happens:** Not implementing the `?personnel_id=X` query parameter.
**How to avoid:** All three endpoints should accept `?personnel_id=X` as an optional filter (D-02). When provided, add WHERE clause.
**Warning signs:** API returning hundreds of records unrelated to the current personnel.

### Pitfall 6: qualified_date Not Being Set When diff_count >= 3
**What goes wrong:** `qualified_date` stays NULL even though the record has 3+ differences.
**Why it happens:** `diff_count` is computed by MySQL GENERATED, but `qualified_date` is a regular column that must be set in PHP.
**How to avoid:** Compute diff_count in PHP from the 4 booleans (same formula as MySQL GENERATED), then if >= 3, set `qualified_date = to_start_date` (D-09). If < 3, set `qualified_date = NULL`.
**Warning signs:** Records with diff_count=3 but qualified_date=NULL.

### Pitfall 7: Column Name Mismatch in Ratio Lookup
**What goes wrong:** Query uses wrong column name for the lookup, returning no results and defaulting ratio to 100%.
**Why it happens:** `supportive_experience` table has `job_series_name` but `supportive_job_series` table has `supportive_series_name`. These are different column names for the same concept.
**How to avoid:** Use `supportive_series_name` in the WHERE clause when querying `supportive_job_series` table: `WHERE primary_series_name = ? AND supportive_series_name = ?`. The value comes from `$data['job_series_name']` (the field from the supportive_experience record).
**Warning signs:** ratio_percent always defaulting to 100 even when seed data has different ratios.

### Pitfall 8: Not Including auth.php Functions in Route Handlers
**What goes wrong:** Calling `getAuthHeader()` or `validateJWT()` in route handler fails with "undefined function".
**Why it happens:** Route files are `include`d from `api.php` which already includes `auth.php`. Since PHP `include` runs in the calling scope, `auth.php` functions ARE available in route handlers without a separate include.
**How to avoid:** Do NOT re-include `auth.php` in route files. The functions are already available from `api.php`'s include chain. Only `helpers.php` needs `include_once` (as seen in probation.php and candidates.php).
**Warning signs:** Function redeclaration errors if double-included.

## Code Examples

### Example 1: Complete DELETE Handler
```php
function deleteSupportive(PDO $pdo, int $id): void
{
    $stmt = $pdo->prepare("DELETE FROM supportive_experience WHERE supportive_id = ?");
    $stmt->execute([$id]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรายการนับเกื้อกูล']);
        return;
    }

    echo json_encode(['success' => true]);
}
```

### Example 2: Supportive Experience CREATE with Full Server Computation
```php
function createSupportive(PDO $pdo): void
{
    $data = json_decode(file_get_contents('php://input'), true);

    $required = ['personnel_id', 'job_series_name', 'start_date', 'end_date'];
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            http_response_code(400);
            echo json_encode(['error' => "กรุณาระบุ {$field}"]);
            return;
        }
    }

    // Server-side date computation (D-05)
    $startDate = new DateTime($data['start_date']);
    $endDate = new DateTime($data['end_date']);
    $totalDays = $endDate->diff($startDate)->days + 1; // inclusive

    // Lookup ratio from supportive_job_series (D-04)
    $ratioPercent = 100;
    if (isset($data['primary_series_name'])) {
        $ratioStmt = $pdo->prepare(
            "SELECT ratio_percent FROM supportive_job_series
             WHERE primary_series_name = ? AND supportive_series_name = ?
             AND is_active = 1 LIMIT 1"
        );
        $ratioStmt->execute([$data['primary_series_name'], $data['job_series_name']]);
        $ratioRow = $ratioStmt->fetch(PDO::FETCH_ASSOC);
        if ($ratioRow) {
            $ratioPercent = intval($ratioRow['ratio_percent']);
        }
    }

    // D-06: effective_days
    $effectiveDays = $totalDays * $ratioPercent / 100;

    // D-07: net_* computations
    $netYears = intval(floor($effectiveDays / 365));
    $netMonths = intval(floor(($effectiveDays % 365) / 30));
    $netDayRemainder = intval($effectiveDays % 365 % 30);
    $netEndDate = clone $startDate;
    $netEndDate->modify("+" . intval($effectiveDays) . " days");

    $sql = "INSERT INTO supportive_experience
            (personnel_id, job_series_name, start_date, end_date, total_days,
             ratio_percent, effective_days, net_end_date, net_years, net_months,
             net_day_remainder, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        intval($data['personnel_id']),
        $data['job_series_name'],
        $data['start_date'],
        $data['end_date'],
        $totalDays,
        $ratioPercent,
        $effectiveDays,
        $netEndDate->format('Y-m-d'),
        $netYears,
        $netMonths,
        $netDayRemainder,
        $data['description'] ?? null
    ]);

    $id = $pdo->lastInsertId();
    http_response_code(201);
    echo json_encode(['success' => true, 'supportive_id' => intval($id)]);
}
```

### Example 3: Diverse Experience CREATE (GENERATED Column Handling)
```php
function createDiverse(PDO $pdo): void
{
    $data = json_decode(file_get_contents('php://input'), true);

    $required = ['personnel_id'];
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            http_response_code(400);
            echo json_encode(['error' => "กรุณาระบุ {$field}"]);
            return;
        }
    }

    // Compute from/to total_days server-side (D-10)
    $fromTotalDays = null;
    if (!empty($data['from_start_date']) && !empty($data['from_end_date'])) {
        $fromTotalDays = (new DateTime($data['from_end_date']))->diff(new DateTime($data['from_start_date']))->days + 1;
    }
    $toTotalDays = null;
    if (!empty($data['to_start_date']) && !empty($data['to_end_date'])) {
        $toTotalDays = (new DateTime($data['to_end_date']))->diff(new DateTime($data['to_start_date']))->days + 1;
    }

    // Compute qualified_date in PHP (D-09)
    // NOTE: diff_count is GENERATED -- do NOT include in INSERT
    $boolFlags = [
        intval($data['is_diff_job_series'] ?? 0),
        intval($data['is_diff_org'] ?? 0),
        intval($data['is_diff_location'] ?? 0),
        intval($data['is_diff_work_nature'] ?? 0),
    ];
    $diffCount = array_sum($boolFlags);
    $qualifiedDate = ($diffCount >= 3 && !empty($data['to_start_date'])) ? $data['to_start_date'] : null;

    $sql = "INSERT INTO diverse_experience
            (personnel_id, from_job_series, from_work_group, from_division,
             from_org_id, from_province, from_start_date, from_end_date, from_total_days,
             to_job_series, to_work_group, to_division,
             to_org_id, to_province, to_start_date, to_end_date, to_total_days,
             is_diff_job_series, is_diff_org, is_diff_location, is_diff_work_nature,
             qualified_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        intval($data['personnel_id']),
        $data['from_job_series'] ?? null,
        $data['from_work_group'] ?? null,
        $data['from_division'] ?? null,
        isset($data['from_org_id']) ? intval($data['from_org_id']) : null,
        $data['from_province'] ?? null,
        $data['from_start_date'] ?? null,
        $data['from_end_date'] ?? null,
        $fromTotalDays,
        $data['to_job_series'] ?? null,
        $data['to_work_group'] ?? null,
        $data['to_division'] ?? null,
        isset($data['to_org_id']) ? intval($data['to_org_id']) : null,
        $data['to_province'] ?? null,
        $data['to_start_date'] ?? null,
        $data['to_end_date'] ?? null,
        $toTotalDays,
        $boolFlags[0], $boolFlags[1], $boolFlags[2], $boolFlags[3],
        $qualifiedDate
    ]);

    $id = $pdo->lastInsertId();
    http_response_code(201);
    echo json_encode(['success' => true, 'experience_id' => intval($id)]);
}
```

### Example 4: API Gateway Registration
```php
// In api.php switch statement, add after 'probation' case:

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

### Example 5: Position Equivalence Approval with JWT user_id
```php
// When approval_status = 'APPROVED' (D-12)
if ($newStatus === 'APPROVED') {
    if (empty($data['approved_start_date']) || empty($data['approved_end_date'])) {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุดที่อนุมัติ']);
        return;
    }
    $approvedStart = new DateTime($data['approved_start_date']);
    $approvedEnd = new DateTime($data['approved_end_date']);
    $approvedTotalDays = $approvedEnd->diff($approvedStart)->days + 1;

    // Extract user_id from JWT (NEW PATTERN)
    $token = getAuthHeader();
    $payload = validateJWT($token);
    $userId = $payload['user_id'] ?? null;

    $sql = "UPDATE position_equivalence SET
            approval_status = 'APPROVED',
            approved_start_date = ?, approved_end_date = ?,
            approved_total_days = ?, approved_by = ?
            WHERE equivalence_id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        $data['approved_start_date'], $data['approved_end_date'],
        $approvedTotalDays, $userId, $id
    ]);
}

// When approval_status = 'REJECTED' (D-13)
if ($newStatus === 'REJECTED') {
    $sql = "UPDATE position_equivalence SET
            approval_status = 'REJECTED',
            approved_start_date = NULL, approved_end_date = NULL,
            approved_total_days = NULL
            WHERE equivalence_id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual date math | PHP DateTime::diff() | PHP 5.3+ | Reliable day counting |
| Inline SQL in api.php | Route files in routes/ | v1.0 Phase 2 | Clean separation |
| No pagination | Limit/offset with total count | v1.0 Phase 2 | Consistent API contract |

**No changes needed** -- the existing approach is appropriate for this codebase.

## Open Questions

1. **net_end_date precise semantics**
   - What we know: `net_end_date = start_date + effective_days` (D-07). The column exists in supportive_experience schema.
   - What's unclear: Should `+effective_days` use calendar days or working days? Current assumption is calendar days.
   - Recommendation: Use calendar days. Flag for HR validation post-v1.1 (per deferred items).

2. **effective_days fractional handling**
   - What we know: `effective_days = total_days * ratio_percent / 100`. The column type is `DECIMAL(10,2)`.
   - What's unclear: When ratio is not 100 (e.g., 50%), effective_days will be fractional (e.g., 91.5 days). How do net_years/net_months/net_day_remainder handle fractions?
   - Recommendation: Use `intval(floor($effectiveDays))` for net_* calculations. Store `effective_days` as DECIMAL. Flag for HR validation.

3. **DELETE cascading effects**
   - What we know: No FK constraints from qualification_calculation back to these tables
   - What's unclear: Whether deleting records should trigger recalculation
   - Recommendation: For v1.1, DELETE is standalone. QualificationEngine (Phase 7) reads live data on each computation call.

4. **request_total_days on position_equivalence**
   - What we know: The schema has `request_total_days INT` column.
   - What's unclear: Whether this should be computed from `request_start_date`/`request_end_date` the same way as supportive total_days.
   - Recommendation: Yes, compute `request_total_days = DATEDIFF(request_end_date, request_start_date) + 1` server-side on POST.

## Sources

### Primary (HIGH confidence)
- `backend/routes/probation.php` -- CRUD handler pattern with validation, pagination, sub-functions (verified: 254 lines, full CRUD minus DELETE)
- `backend/routes/candidates.php` -- Read-only handler pattern (verified: uses QualificationEngine)
- `backend/api.php` -- Gateway switch-case routing (verified: 243 lines, 9 existing cases)
- `backend/auth.php` -- JWT functions (verified: `validateJWT()` returns `$payload['data']` = `['user_id' => $user_id]`)
- `backend/helpers.php` -- `formatThaiDate()` and `getLevelName()` utility functions
- `database/04-career-path.sql` -- Complete table schemas for all 3 target tables plus supportive_job_series
- `database/08-career-path-v11.sql` -- Migration adding `ratio_percent` column and GENERATED `diff_count`

### Secondary (MEDIUM confidence)
- PHP DateTime documentation (PHP 8.3 built-in) -- DateTime::diff() for day calculations
- MySQL 8.0 GENERATED columns documentation -- INSERT/UPDATE restrictions on GENERATED STORED columns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies; exact match with existing codebase
- Architecture: HIGH - Three existing route handlers provide precise template; all patterns verified against actual code
- Pitfalls: HIGH - GENERATED column behavior verified in migration SQL; date off-by-one flagged in STATE.md; column name mismatch verified across schema files
- Business logic: MEDIUM - qualified_date and net_* computations documented in CONTEXT.md decisions but need HR validation
- JWT extraction: HIGH - Verified auth.php return format (`$payload['data']` contains `['user_id' => N]`); verified no existing route handler does this

**Changes from initial research:**
- Added Pattern 8: JWT user_id extraction (new finding -- no existing route does this)
- Added Pitfall 7: Column name mismatch between tables for ratio lookup
- Added Pitfall 8: auth.php include chain (no re-include needed in routes)
- Added Open Question 4: request_total_days computation
- Expanded Example 2 to include full net_* computation (D-07)
- Added Example 5: Equivalence approval with JWT extraction
- Added user constraints section from CONTEXT.md
- Added phase requirements mapping

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- no external dependency changes expected)
