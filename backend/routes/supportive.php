<?php
// ============================================================================
// routes/supportive.php
// Supportive Experience Route Handler
// จัดการเส้นทาง API สำหรับการนับเวลาเกื้อกูล
//
// Endpoints:
//   GET    /supportive                    — รายการนับเกื้อกูลทั้งหมด (พร้อม pagination)
//   GET    /supportive?personnel_id=X     — รายการนับเกื้อกูลของบุคลากรรายบุคคล
//   GET    /supportive/{id}               — รายละเอียดรายการนับเกื้อกูล
//   POST   /supportive                    — สร้างรายการนับเกื้อกูลใหม่
//   PUT    /supportive/{id}               — อัปเดตรายการนับเกื้อกูล
//   DELETE /supportive/{id}               — ลบรายการนับเกื้อกูล
// ============================================================================

include_once __DIR__ . '/../helpers.php';

/**
 * จัดการ request สำหรับ supportive experience endpoints
 *
 * @param PDO $pdo Database connection
 * @param string $method HTTP method
 * @param array $path URL path segments
 */
function handleSupportive(PDO $pdo, string $method, array $path): void
{
    switch ($method) {
        case 'GET':
            $id = $path[1] ?? null;
            if ($id !== null) {
                // GET /supportive/{id} — รายละเอียดรายการ
                getSupportiveDetail($pdo, intval($id));
            } else {
                // GET /supportive — รายการทั้งหมด
                getSupportiveList($pdo);
            }
            break;

        case 'POST':
            // POST /supportive — สร้างรายการใหม่
            createSupportive($pdo);
            break;

        case 'PUT':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID รายการนับเกื้อกูล']);
                return;
            }
            // PUT /supportive/{id} — อัปเดตรายการ
            updateSupportive($pdo, intval($id));
            break;

        case 'DELETE':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID รายการนับเกื้อกูล']);
                return;
            }
            // DELETE /supportive/{id} — ลบรายการ
            deleteSupportive($pdo, intval($id));
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
}

/**
 * GET /supportive — รายการนับเกื้อกูลทั้งหมด (พร้อม pagination)
 * รองรับ filter ด้วย personnel_id
 */
function getSupportiveList(PDO $pdo): void
{
    $personnelId = $_GET['personnel_id'] ?? null;
    $limit = intval($_GET['limit'] ?? 20);
    $offset = intval($_GET['offset'] ?? 0);

    $baseQuery = "SELECT se.*, CONCAT(p.first_name, ' ', p.last_name) AS full_name
                  FROM supportive_experience se
                  LEFT JOIN personnel p ON se.personnel_id = p.personnel_id";

    $countQuery = "SELECT COUNT(*) AS total
                   FROM supportive_experience se
                   LEFT JOIN personnel p ON se.personnel_id = p.personnel_id";

    $where = '';
    $params = [];

    if ($personnelId !== null && $personnelId !== '') {
        $where = " WHERE se.personnel_id = ?";
        $params = [intval($personnelId)];
    }

    // Data query with ordering and pagination
    $sql = $baseQuery . $where . " ORDER BY se.start_date DESC LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Count query for pagination
    $countStmt = $pdo->prepare($countQuery . $where);
    $countStmt->execute($params);
    $total = intval($countStmt->fetch(PDO::FETCH_ASSOC)['total']);

    // เพิ่มวันที่ภาษาไทย
    foreach ($rows as &$row) {
        $row['start_date_thai'] = formatThaiDate($row['start_date']);
        $row['end_date_thai'] = formatThaiDate($row['end_date']);
    }
    unset($row);

    // Summary จาก full dataset (ไม่ใช่ current page)
    $summaryStmt = $pdo->query("
        SELECT COUNT(DISTINCT personnel_id) AS distinct_personnel,
               SUM(effective_days) AS total_effective_days
        FROM supportive_experience
    ");
    $summaryRow = $summaryStmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'data' => $rows,
        'summary' => [
            'total' => $total,
            'distinct_personnel' => (int) ($summaryRow['distinct_personnel'] ?? 0),
            'total_effective_days' => (float) ($summaryRow['total_effective_days'] ?? 0),
        ],
        'pagination' => [
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => ($offset + $limit) < $total
        ]
    ]);
}

/**
 * GET /supportive/{id} — รายละเอียดรายการนับเกื้อกูล
 */
function getSupportiveDetail(PDO $pdo, int $id): void
{
    $sql = "SELECT se.*, CONCAT(p.first_name, ' ', p.last_name) AS full_name
            FROM supportive_experience se
            LEFT JOIN personnel p ON se.personnel_id = p.personnel_id
            WHERE se.supportive_id = ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
    $record = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรายการนับเกื้อกูล']);
        return;
    }

    // เพิ่มวันที่ภาษาไทย
    $record['start_date_thai'] = formatThaiDate($record['start_date']);
    $record['end_date_thai'] = formatThaiDate($record['end_date']);
    $record['net_end_date_thai'] = formatThaiDate($record['net_end_date']);

    echo json_encode(['success' => true, 'data' => $record]);
}

/**
 * คำนวณ total_days, effective_days, net_* จาก start_date, end_date, ratio
 * ใช้ร่วมกันระหว่าง create และ update
 *
 * @param PDO $pdo Database connection
 * @param string $startDateStr Start date (Y-m-d)
 * @param string $endDateStr End date (Y-m-d)
 * @param string $jobSeriesName สายงานที่เกื้อกูล (map to supportive_series_name)
 * @param string|null $primarySeriesName สายงานหลัก (map to primary_series_name)
 * @return array Computed fields
 */
function computeSupportiveFields(PDO $pdo, string $startDateStr, string $endDateStr, string $jobSeriesName, ?string $primarySeriesName = null): array
{
    $startDate = new DateTime($startDateStr);
    $endDate = new DateTime($endDateStr);

    // D-05: total_days = DATEDIFF + 1 (inclusive)
    $totalDays = $endDate->diff($startDate)->days + 1;

    // Ratio lookup: query supportive_job_series
    // CRITICAL: match job_series_name (from input) to supportive_series_name column
    $ratioPercent = 100; // default if no match (D-04)

    if ($primarySeriesName !== null && $primarySeriesName !== '') {
        $ratioSql = "SELECT ratio_percent FROM supportive_job_series
                     WHERE primary_series_name = ? AND supportive_series_name = ? AND is_active = 1
                     LIMIT 1";
        $ratioStmt = $pdo->prepare($ratioSql);
        $ratioStmt->execute([$primarySeriesName, $jobSeriesName]);
        $ratioRow = $ratioStmt->fetch(PDO::FETCH_ASSOC);
        if ($ratioRow) {
            $ratioPercent = intval($ratioRow['ratio_percent']);
        }
    }

    // D-06: effective_days = total_days * ratio / 100
    $effectiveDays = $totalDays * $ratioPercent / 100;

    // Floor for net_* calculations since effective_days is DECIMAL(10,2)
    $flooredEffective = intval(floor($effectiveDays));

    // D-07: net breakdown
    $netYears = intval(floor($flooredEffective / 365));
    $netMonths = intval(floor(($flooredEffective % 365) / 30));
    $netDayRemainder = intval($flooredEffective % 365 % 30);

    // net_end_date = start_date + floored effective days
    $netEndDate = clone $startDate;
    $netEndDate->modify("+{$flooredEffective} days");
    $netEndDateStr = $netEndDate->format('Y-m-d');

    return [
        'total_days' => $totalDays,
        'ratio_percent' => $ratioPercent,
        'effective_days' => $effectiveDays,
        'net_end_date' => $netEndDateStr,
        'net_years' => $netYears,
        'net_months' => $netMonths,
        'net_day_remainder' => $netDayRemainder
    ];
}

/**
 * POST /supportive — สร้างรายการนับเกื้อกูลใหม่
 * Server-side computation: total_days, effective_days, net_* fields
 */
function createSupportive(PDO $pdo): void
{
    $data = json_decode(file_get_contents('php://input'), true);

    // ตรวจสอบข้อมูลที่จำเป็น
    $required = ['personnel_id', 'job_series_name', 'start_date', 'end_date'];
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            http_response_code(400);
            echo json_encode(['error' => "กรุณาระบุ {$field}"]);
            return;
        }
    }

    // Server-side computation (D-05, D-06, D-07, SE-04)
    $computed = computeSupportiveFields(
        $pdo,
        $data['start_date'],
        $data['end_date'],
        $data['job_series_name'],
        $data['primary_series_name'] ?? null
    );

    $sql = "INSERT INTO supportive_experience
            (personnel_id, job_series_name, start_date, end_date,
             total_days, ratio_percent, effective_days,
             net_end_date, net_years, net_months, net_day_remainder, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        intval($data['personnel_id']),
        $data['job_series_name'],
        $data['start_date'],
        $data['end_date'],
        $computed['total_days'],
        $computed['ratio_percent'],
        $computed['effective_days'],
        $computed['net_end_date'],
        $computed['net_years'],
        $computed['net_months'],
        $computed['net_day_remainder'],
        $data['description'] ?? null
    ]);

    $supportiveId = $pdo->lastInsertId();

    http_response_code(201);
    echo json_encode(['success' => true, 'supportive_id' => intval($supportiveId)]);
}

/**
 * PUT /supportive/{id} — อัปเดตรายการนับเกื้อกูล
 * ถ้า start_date/end_date/job_series_name เปลี่ยน จะคำนวณ computed fields ใหม่
 */
function updateSupportive(PDO $pdo, int $id): void
{
    // ตรวจสอบว่ารายการมีอยู่จริง
    $checkStmt = $pdo->prepare("SELECT * FROM supportive_experience WHERE supportive_id = ?");
    $checkStmt->execute([$id]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรายการนับเกื้อกูล']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);

    // Allowed fields (client cannot set computed fields directly)
    $allowed = ['job_series_name', 'start_date', 'end_date', 'primary_series_name', 'description'];

    $sets = [];
    $params = [];

    // Collect allowed field changes
    foreach ($allowed as $field) {
        if ($field === 'primary_series_name') {
            // primary_series_name is used for ratio lookup only, not stored directly
            continue;
        }
        if (isset($data[$field])) {
            $sets[] = "{$field} = ?";
            $params[] = $data[$field];
        }
    }

    // Check if dates or job_series_name changed — recompute if so
    $needsRecompute = isset($data['start_date']) || isset($data['end_date'])
                      || isset($data['job_series_name']) || isset($data['primary_series_name']);

    if ($needsRecompute) {
        $startDate = $data['start_date'] ?? $existing['start_date'];
        $endDate = $data['end_date'] ?? $existing['end_date'];
        $jobSeriesName = $data['job_series_name'] ?? $existing['job_series_name'];
        $primarySeriesName = $data['primary_series_name'] ?? null;

        $computed = computeSupportiveFields($pdo, $startDate, $endDate, $jobSeriesName, $primarySeriesName);

        $sets[] = "total_days = ?";
        $params[] = $computed['total_days'];
        $sets[] = "ratio_percent = ?";
        $params[] = $computed['ratio_percent'];
        $sets[] = "effective_days = ?";
        $params[] = $computed['effective_days'];
        $sets[] = "net_end_date = ?";
        $params[] = $computed['net_end_date'];
        $sets[] = "net_years = ?";
        $params[] = $computed['net_years'];
        $sets[] = "net_months = ?";
        $params[] = $computed['net_months'];
        $sets[] = "net_day_remainder = ?";
        $params[] = $computed['net_day_remainder'];
    }

    if (empty($sets)) {
        http_response_code(400);
        echo json_encode(['error' => 'ไม่มีข้อมูลที่ต้องอัปเดต']);
        return;
    }

    $params[] = $id;
    $sql = "UPDATE supportive_experience SET " . implode(', ', $sets) . " WHERE supportive_id = ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    echo json_encode(['success' => true]);
}

/**
 * DELETE /supportive/{id} — ลบรายการนับเกื้อกูล
 */
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
