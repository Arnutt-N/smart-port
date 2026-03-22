# Phase 5: Backend CRUD APIs - Research

**Researched:** 2026-03-22
**Domain:** PHP REST API CRUD endpoints with server-side business logic
**Confidence:** HIGH

## Summary

Phase 5 builds three sets of CRUD API endpoints following the exact architecture pattern already established in `routes/candidates.php` and `routes/probation.php`. The primary technical challenges are: (1) server-side date arithmetic for `total_days` and `effective_days`, (2) handling MySQL GENERATED columns in INSERT/UPDATE, and (3) enforcing approval status transitions for position equivalence.

No new libraries or dependencies are needed. The existing pure-PHP, no-framework approach with PDO prepared statements is the established stack. All three route handlers follow the `handleX(PDO $pdo, string $method, array $path)` signature, dispatch on `$method` via switch, and delegate to sub-functions.

**Primary recommendation:** Create three route files (`routes/supportive.php`, `routes/diverse.php`, `routes/equivalence.php`) following the `probation.php` CRUD pattern verbatim, with server-side computation in the create/update handlers.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SE-02 | API CRUD endpoints for supportive_experience (GET list, POST create, PUT update, DELETE) | Route handler pattern from probation.php; pagination from civil-servants endpoint |
| SE-04 | Compute effective_days = total_days x ratio from supportive_job_series mapping | PHP computation in create/update handler; lookup ratio from supportive_job_series table |
| DE-01 | API CRUD endpoints for diverse_experience (GET list, POST create, PUT update, DELETE) | Route handler pattern; GENERATED column exclusion pattern |
| DE-03 | Auto-compute diff_count + qualified_date when >= 3 diff | diff_count is MySQL GENERATED (auto); qualified_date set in PHP when diff_count >= 3 |
| PE-01 | API CRUD endpoints for position_equivalence (GET list, POST request, PUT approve/reject) | Route handler pattern; status transition enforcement |
| PE-03 | Compute approved_total_days from approved records only | DATEDIFF computation in PHP on approval; aggregate query for personnel summary |
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
  helpers.php          # Shared utilities - add new helpers
  config.php           # DB connection (unchanged)
  auth.php             # JWT auth (unchanged)
```

### Pattern 1: Route Handler Function Signature
**What:** Every route file exports a single `handleX(PDO $pdo, string $method, array $path)` function
**When to use:** Always - this is the established pattern
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
                echo json_encode(['error' => 'ID is required']);
                return;
            }
            updateSupportive($pdo, intval($id));
            break;
        case 'DELETE':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'ID is required']);
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

### Pattern 3: List Endpoint with Pagination
**What:** GET list follows the civil-servants pagination format
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

    $sql = "SELECT ... FROM supportive_experience se {$where} ORDER BY se.start_date DESC LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Count
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

### Pattern 4: Required Field Validation
**What:** Loop through required fields and return 400 if missing
**When to use:** POST and PUT handlers
**Example (from probation.php):**
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

### Pattern 5: Allowed-Fields Update
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

### Pattern 6: Server-Side Date Computation
**What:** Compute total_days from start_date/end_date, then derive effective_days
**When to use:** Supportive experience create/update
**Example:**
```php
// Compute total_days = DATEDIFF(end_date, start_date) + 1
$startDate = new DateTime($data['start_date']);
$endDate = new DateTime($data['end_date']);
$totalDays = $endDate->diff($startDate)->days + 1;

// Lookup ratio from supportive_job_series
$ratioStmt = $pdo->prepare("SELECT ratio_percent FROM supportive_job_series WHERE primary_series_name = ? AND supportive_series_name = ? AND is_active = 1 LIMIT 1");
$ratioStmt->execute([$primarySeries, $supportiveSeries]);
$ratioRow = $ratioStmt->fetch(PDO::FETCH_ASSOC);
$ratioPercent = $ratioRow ? intval($ratioRow['ratio_percent']) : 100;

// Compute effective_days
$effectiveDays = $totalDays * $ratioPercent / 100;
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

// When approving: compute approved_total_days from approved dates
if ($newStatus === 'APPROVED') {
    $approvedStart = new DateTime($data['approved_start_date']);
    $approvedEnd = new DateTime($data['approved_end_date']);
    $approvedTotalDays = $approvedEnd->diff($approvedStart)->days + 1;
    // Include approved_total_days in UPDATE
}
```

### Anti-Patterns to Avoid
- **Including diff_count in INSERT/UPDATE:** This is a MySQL GENERATED STORED column. Including it causes a MySQL error. Only include the 4 boolean flags; diff_count is auto-computed.
- **Client-submitted diff_count or effective_days:** These are server-computed values. Ignore any client-submitted values for these fields.
- **Missing +1 on DATEDIFF:** Thai HR date counting is inclusive. `total_days = DATEDIFF(end, start) + 1`. Forgetting the +1 causes off-by-one errors.
- **Allowing reverse status transitions:** APPROVED/REJECTED should NOT transition back to PENDING or to each other.
- **Hardcoding ratio_percent:** Always look up from supportive_job_series table; different mappings may have different ratios in the future.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date difference | Manual day counting | PHP DateTime::diff() | Handles leap years, month boundaries correctly |
| JSON parsing | Custom parsing | json_decode(file_get_contents('php://input'), true) | Already established pattern in api.php |
| Thai date formatting | Custom formatter | formatThaiDate() from helpers.php | Already exists and handles Buddhist Era conversion |
| SQL injection prevention | String concatenation | PDO prepared statements with ? placeholders | Already configured in config.php with ERRMODE_EXCEPTION |
| Pagination | Custom logic | Existing `{ total, limit, offset, has_more }` pattern | Matches civil-servants and probation endpoints exactly |

**Key insight:** Everything needed already exists in the codebase. The task is replication with domain-specific business logic, not invention.

## Common Pitfalls

### Pitfall 1: MySQL GENERATED Column in INSERT/UPDATE
**What goes wrong:** Including `diff_count` in an INSERT or UPDATE statement on `diverse_experience` causes MySQL error 3105: "The value specified for generated column 'diff_count' in table 'diverse_experience' is not allowed."
**Why it happens:** `diff_count` was altered to `GENERATED ALWAYS AS (is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature) STORED` in migration 08.
**How to avoid:** Never include `diff_count` in INSERT column list or UPDATE SET clause. Only insert/update the 4 boolean flags (`is_diff_job_series`, `is_diff_org`, `is_diff_location`, `is_diff_work_nature`). MySQL computes `diff_count` automatically.
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
**How to avoid:** Only set `approved_start_date`, `approved_end_date`, `approved_total_days` when `approval_status = 'APPROVED'`. On REJECTED, explicitly NULL these fields.
**Warning signs:** Qualification date calculations including unapproved days.

### Pitfall 5: Missing personnel_id Filter on List Endpoints
**What goes wrong:** GET list returns ALL records across ALL personnel instead of filtering by personnel_id.
**Why it happens:** Not requiring or checking the `personnel_id` query parameter.
**How to avoid:** All three endpoints should accept `?personnel_id=X` as a filter. For single-personnel views (the primary use case), this is required.
**Warning signs:** API returning hundreds of records unrelated to the current personnel.

### Pitfall 6: qualified_date Not Being Set When diff_count >= 3
**What goes wrong:** `qualified_date` stays NULL even though the record has 3+ differences.
**Why it happens:** `diff_count` is computed by MySQL GENERATED, but `qualified_date` is a regular column that must be set in PHP.
**How to avoid:** After INSERT/UPDATE, read back the `diff_count` value (or compute it in PHP from the 4 booleans), and if >= 3, set `qualified_date` to the `to_start_date` (or current date per business rule). If < 3, NULL the qualified_date.
**Warning signs:** Records with diff_count=3 but qualified_date=NULL.

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

### Example 2: Supportive Experience CREATE with Server Computation
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

    // Server-side date computation
    $startDate = new DateTime($data['start_date']);
    $endDate = new DateTime($data['end_date']);
    $totalDays = $endDate->diff($startDate)->days + 1; // inclusive

    // Lookup ratio from supportive_job_series
    // Personnel's primary series must be known - passed from client or looked up
    $ratioPercent = 100; // default
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

    $sql = "INSERT INTO supportive_experience
            (personnel_id, job_series_name, start_date, end_date, total_days,
             ratio_percent, effective_days, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        intval($data['personnel_id']),
        $data['job_series_name'],
        $data['start_date'],
        $data['end_date'],
        $totalDays,
        $ratioPercent,
        $effectiveDays,
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

    // NOTE: diff_count is GENERATED — do NOT include in INSERT
    $sql = "INSERT INTO diverse_experience
            (personnel_id, from_job_series, from_work_group, from_division,
             from_org_id, from_province, from_start_date, from_end_date, from_total_days,
             to_job_series, to_work_group, to_division,
             to_org_id, to_province, to_start_date, to_end_date, to_total_days,
             is_diff_job_series, is_diff_org, is_diff_location, is_diff_work_nature,
             qualified_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    // Compute from/to total_days server-side
    $fromTotalDays = null;
    if (!empty($data['from_start_date']) && !empty($data['from_end_date'])) {
        $fromTotalDays = (new DateTime($data['from_end_date']))->diff(new DateTime($data['from_start_date']))->days + 1;
    }
    $toTotalDays = null;
    if (!empty($data['to_start_date']) && !empty($data['to_end_date'])) {
        $toTotalDays = (new DateTime($data['to_end_date']))->diff(new DateTime($data['to_start_date']))->days + 1;
    }

    // Compute qualified_date: if diff_count >= 3, use to_start_date
    $boolFlags = [
        intval($data['is_diff_job_series'] ?? 0),
        intval($data['is_diff_org'] ?? 0),
        intval($data['is_diff_location'] ?? 0),
        intval($data['is_diff_work_nature'] ?? 0),
    ];
    $diffCount = array_sum($boolFlags);
    $qualifiedDate = ($diffCount >= 3 && !empty($data['to_start_date'])) ? $data['to_start_date'] : null;

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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual date math | PHP DateTime::diff() | PHP 5.3+ | Reliable day counting |
| Inline SQL in api.php | Route files in routes/ | v1.0 Phase 2 | Clean separation |
| No pagination | Limit/offset with total count | v1.0 Phase 2 | Consistent API contract |

**No changes needed** -- the existing approach is appropriate for this codebase.

## Open Questions

1. **qualified_date business rule**
   - What we know: Must be set when diff_count >= 3
   - What's unclear: Should it be `to_start_date` (date the "different" assignment began) or the date the record is entered?
   - Recommendation: Use `to_start_date` as the qualified_date -- this represents when the person actually started the qualifying assignment. The plan should document this assumption.

2. **net_end_date, net_years, net_months, net_day_remainder on supportive_experience**
   - What we know: These columns exist in the schema
   - What's unclear: The exact computation. These likely represent the effective duration broken into years/months/days components.
   - Recommendation: Compute in PHP from effective_days. `net_years = floor(effective_days / 365)`, `net_months = floor((effective_days % 365) / 30)`, `net_day_remainder = effective_days % 365 % 30`. net_end_date = start_date + effective_days. Flag for HR validation.

3. **DELETE cascading effects**
   - What we know: No FK constraints from qualification_calculation back to these tables
   - What's unclear: Whether deleting records should trigger recalculation
   - Recommendation: For v1.1, DELETE is standalone. QualificationEngine (Phase 7) reads live data on each computation call.

## Sources

### Primary (HIGH confidence)
- `backend/routes/probation.php` -- CRUD handler pattern with validation, pagination, sub-functions
- `backend/routes/candidates.php` -- Read-only handler pattern
- `backend/api.php` -- Gateway switch-case routing, response format
- `backend/helpers.php` -- Shared utility functions (formatThaiDate)
- `database/04-career-path.sql` -- Complete table schemas for all 3 target tables
- `database/08-career-path-v11.sql` -- Migration adding ratio_percent and GENERATED diff_count

### Secondary (MEDIUM confidence)
- PHP DateTime documentation (PHP 8.3 built-in) -- DateTime::diff() for day calculations
- MySQL 8.0 GENERATED columns documentation -- INSERT/UPDATE restrictions on GENERATED STORED columns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies; exact match with existing codebase
- Architecture: HIGH - Three existing route handlers provide precise template
- Pitfalls: HIGH - GENERATED column behavior is well-documented MySQL feature; date off-by-one is flagged in STATE.md
- Business logic: MEDIUM - qualified_date and net_* computations need HR validation

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- no external dependency changes expected)
