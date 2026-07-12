<?php
// ============================================================================
// routes/diverse.php
// Diverse Experience Route Handler
// จัดการเส้นทาง API สำหรับการนับระยะเวลาแตกต่าง (Diverse Experience)
//
// Endpoints:
//   GET    /diverse                         — รายการนับแตกต่างทั้งหมด (พร้อม pagination)
//   GET    /diverse?personnel_id=X          — กรองตาม personnel_id
//   GET    /diverse/{id}                    — รายละเอียดรายการนับแตกต่าง
//   POST   /diverse                         — สร้างรายการนับแตกต่างใหม่
//   PUT    /diverse/{id}                    — อัปเดตรายการนับแตกต่าง
//   DELETE /diverse/{id}                    — ลบรายการนับแตกต่าง
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../audit.php';

/**
 * จัดการ request สำหรับ diverse experience endpoints
 *
 * @param PDO $pdo Database connection
 * @param string $method HTTP method
 * @param array $path URL path segments
 */
function handleDiverse(PDO $pdo, string $method, array $path): void
{
    $actionMap = ['GET' => 'read', 'POST' => 'create', 'PUT' => 'update', 'DELETE' => 'delete'];
    if (isset($actionMap[$method])) {
        requirePermission($actionMap[$method], 'diverse');
    }
    $user = getAuthenticatedUser();

    switch ($method) {
        case 'GET':
            $id = $path[1] ?? null;
            if ($id !== null) {
                // GET /diverse/{id} — รายละเอียดรายบุคคล
                getDiverseDetail($pdo, intval($id));
            } else {
                // GET /diverse — รายชื่อทั้งหมด
                getDiverseList($pdo);
            }
            break;

        case 'POST':
            // POST /diverse — สร้างรายการใหม่
            createDiverse($pdo, $user);
            break;

        case 'PUT':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID รายการนับแตกต่าง']);
                return;
            }
            // PUT /diverse/{id} — อัปเดตข้อมูล
            updateDiverse($pdo, intval($id), $user);
            break;

        case 'DELETE':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID รายการนับแตกต่าง']);
                return;
            }
            // DELETE /diverse/{id} — ลบรายการ
            deleteDiverse($pdo, intval($id), $user);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
}

/**
 * GET /diverse — รายการนับแตกต่างทั้งหมด พร้อม pagination
 * สามารถกรองตาม personnel_id ได้
 */
function getDiverseList(PDO $pdo): void
{
    $personnelId = $_GET['personnel_id'] ?? null;
    $limit = intval($_GET['limit'] ?? 20);
    $offset = intval($_GET['offset'] ?? 0);

    $baseQuery = "SELECT de.*, CONCAT(p.first_name, ' ', p.last_name) AS full_name
                  FROM diverse_experience de
                  LEFT JOIN personnel p ON de.personnel_id = p.personnel_id";

    $countQuery = "SELECT COUNT(*) AS total
                   FROM diverse_experience de
                   LEFT JOIN personnel p ON de.personnel_id = p.personnel_id";

    $where = '';
    $params = [];

    if ($personnelId !== null && $personnelId !== '') {
        $where = " WHERE de.personnel_id = ?";
        $params = [intval($personnelId)];
    }

    // Data query with ordering and pagination
    $sql = $baseQuery . $where . " ORDER BY de.created_at DESC LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Count query for pagination
    $countStmt = $pdo->prepare($countQuery . $where);
    $countStmt->execute($params);
    $total = intval($countStmt->fetch(PDO::FETCH_ASSOC)['total']);

    // เพิ่มวันที่ภาษาไทย
    foreach ($rows as &$row) {
        $row['from_start_date_thai'] = formatThaiDate($row['from_start_date']);
        $row['from_end_date_thai'] = formatThaiDate($row['from_end_date']);
        $row['to_start_date_thai'] = formatThaiDate($row['to_start_date']);
        $row['to_end_date_thai'] = formatThaiDate($row['to_end_date']);
        $row['qualified_date_thai'] = formatThaiDate($row['qualified_date']);
    }
    unset($row);

    // Summary จาก full dataset
    $summaryStmt = $pdo->query("
        SELECT COUNT(DISTINCT personnel_id) AS distinct_personnel,
               SUM(CASE WHEN diff_count >= 3 THEN 1 ELSE 0 END) AS qualified_count
        FROM diverse_experience
    ");
    $summaryRow = $summaryStmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'data' => $rows,
        'summary' => [
            'total' => $total,
            'distinct_personnel' => (int) ($summaryRow['distinct_personnel'] ?? 0),
            'qualified_count' => (int) ($summaryRow['qualified_count'] ?? 0),
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
 * GET /diverse/{id} — รายละเอียดรายการนับแตกต่าง
 */
function getDiverseDetail(PDO $pdo, int $id): void
{
    $sql = "SELECT de.*, CONCAT(p.first_name, ' ', p.last_name) AS full_name
            FROM diverse_experience de
            LEFT JOIN personnel p ON de.personnel_id = p.personnel_id
            WHERE de.experience_id = ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
    $record = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรายการนับแตกต่าง']);
        return;
    }

    // เพิ่มวันที่ภาษาไทย
    $record['from_start_date_thai'] = formatThaiDate($record['from_start_date']);
    $record['from_end_date_thai'] = formatThaiDate($record['from_end_date']);
    $record['to_start_date_thai'] = formatThaiDate($record['to_start_date']);
    $record['to_end_date_thai'] = formatThaiDate($record['to_end_date']);
    $record['qualified_date_thai'] = formatThaiDate($record['qualified_date']);

    echo json_encode(['success' => true, 'data' => $record]);
}

/**
 * POST /diverse — สร้างรายการนับแตกต่างใหม่
 * diff_count เป็น GENERATED column จึงไม่รวมใน INSERT
 * qualified_date คำนวณจาก 4 boolean flags (>= 3 = ผ่านเกณฑ์)
 */
function createDiverse(PDO $pdo, array $user, ?array $input = null): void
{
    $data = $input ?? json_decode(file_get_contents('php://input'), true);

    // ตรวจสอบข้อมูลที่จำเป็น
    $required = ['personnel_id'];
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            http_response_code(400);
            echo json_encode(['error' => "กรุณาระบุ {$field}"]);
            return;
        }
    }

    // คำนวณ from_total_days (จำนวนวันรวม ฝั่งต้นทาง)
    $fromTotalDays = null;
    if (!empty($data['from_start_date']) && !empty($data['from_end_date'])) {
        $fromTotalDays = (new DateTime($data['from_end_date']))->diff(new DateTime($data['from_start_date']))->days + 1;
    }

    // คำนวณ to_total_days (จำนวนวันรวม ฝั่งปลายทาง)
    $toTotalDays = null;
    if (!empty($data['to_start_date']) && !empty($data['to_end_date'])) {
        $toTotalDays = (new DateTime($data['to_end_date']))->diff(new DateTime($data['to_start_date']))->days + 1;
    }

    // คำนวณ diff_count ใน PHP เพื่อกำหนด qualified_date
    // (diff_count เป็น GENERATED column ใน MySQL จึงไม่ INSERT)
    $diffCount = intval($data['is_diff_job_series'] ?? 0)
               + intval($data['is_diff_org'] ?? 0)
               + intval($data['is_diff_location'] ?? 0)
               + intval($data['is_diff_work_nature'] ?? 0);

    // qualified_date = to_start_date เมื่อ diff_count >= 3
    $qualifiedDate = ($diffCount >= 3 && !empty($data['to_start_date']))
        ? $data['to_start_date']
        : null;

    // INSERT — ไม่รวม diff_count (GENERATED ALWAYS AS ... STORED)
    $sql = "INSERT INTO diverse_experience (
                personnel_id, from_job_series, from_work_group, from_division,
                from_org_id, from_province, from_start_date, from_end_date, from_total_days,
                to_job_series, to_work_group, to_division,
                to_org_id, to_province, to_start_date, to_end_date, to_total_days,
                is_diff_job_series, is_diff_org, is_diff_location, is_diff_work_nature,
                qualified_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

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
        intval($data['is_diff_job_series'] ?? 0),
        intval($data['is_diff_org'] ?? 0),
        intval($data['is_diff_location'] ?? 0),
        intval($data['is_diff_work_nature'] ?? 0),
        $qualifiedDate
    ]);

    $experienceId = (int) $pdo->lastInsertId();
    $afterStmt = $pdo->prepare('SELECT * FROM diverse_experience WHERE experience_id = ?');
    $afterStmt->execute([$experienceId]);
    $after = $afterStmt->fetch(PDO::FETCH_ASSOC);

    logAudit(
        $pdo,
        (int) $user['user_id'],
        'CREATE',
        'diverse_experience',
        $experienceId,
        null,
        $after ?: null
    );

    http_response_code(201);
    echo json_encode(['success' => true, 'experience_id' => $experienceId]);
}

/**
 * PUT /diverse/{id} — อัปเดตรายการนับแตกต่าง
 * diff_count ไม่อยู่ใน allowed fields (GENERATED column)
 * หลังอัปเดต recompute from_total_days, to_total_days, qualified_date
 */
function updateDiverse(PDO $pdo, int $id, array $user, ?array $input = null): void
{
    // ตรวจสอบว่า record มีอยู่จริง
    $checkStmt = $pdo->prepare("SELECT * FROM diverse_experience WHERE experience_id = ?");
    $checkStmt->execute([$id]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรายการนับแตกต่าง']);
        return;
    }

    $data = $input ?? json_decode(file_get_contents('php://input'), true);

    // Allowed fields — ไม่รวม diff_count (GENERATED column)
    $allowed = [
        'from_job_series', 'from_work_group', 'from_division', 'from_org_id', 'from_province',
        'from_start_date', 'from_end_date',
        'to_job_series', 'to_work_group', 'to_division', 'to_org_id', 'to_province',
        'to_start_date', 'to_end_date',
        'is_diff_job_series', 'is_diff_org', 'is_diff_location', 'is_diff_work_nature'
    ];

    $sets = [];
    $params = [];

    foreach ($allowed as $field) {
        if (array_key_exists($field, $data)) {
            $sets[] = "{$field} = ?";
            $params[] = $data[$field];
        }
    }

    if (empty($sets)) {
        http_response_code(400);
        echo json_encode(['error' => 'ไม่มีข้อมูลที่จะอัปเดต']);
        return;
    }

    // Recompute from_total_days — ใช้ค่าใหม่ถ้ามี หรือค่าจาก DB
    $fromStartDate = $data['from_start_date'] ?? $existing['from_start_date'];
    $fromEndDate = $data['from_end_date'] ?? $existing['from_end_date'];
    if (!empty($fromStartDate) && !empty($fromEndDate)) {
        $fromTotalDays = (new DateTime($fromEndDate))->diff(new DateTime($fromStartDate))->days + 1;
    } else {
        $fromTotalDays = null;
    }
    $sets[] = "from_total_days = ?";
    $params[] = $fromTotalDays;

    // Recompute to_total_days
    $toStartDate = $data['to_start_date'] ?? $existing['to_start_date'];
    $toEndDate = $data['to_end_date'] ?? $existing['to_end_date'];
    if (!empty($toStartDate) && !empty($toEndDate)) {
        $toTotalDays = (new DateTime($toEndDate))->diff(new DateTime($toStartDate))->days + 1;
    } else {
        $toTotalDays = null;
    }
    $sets[] = "to_total_days = ?";
    $params[] = $toTotalDays;

    // Recompute qualified_date จาก 4 boolean flags
    $isDiffJobSeries = intval($data['is_diff_job_series'] ?? $existing['is_diff_job_series'] ?? 0);
    $isDiffOrg = intval($data['is_diff_org'] ?? $existing['is_diff_org'] ?? 0);
    $isDiffLocation = intval($data['is_diff_location'] ?? $existing['is_diff_location'] ?? 0);
    $isDiffWorkNature = intval($data['is_diff_work_nature'] ?? $existing['is_diff_work_nature'] ?? 0);
    $diffCount = $isDiffJobSeries + $isDiffOrg + $isDiffLocation + $isDiffWorkNature;

    $effectiveToStartDate = $data['to_start_date'] ?? $existing['to_start_date'];
    $qualifiedDate = ($diffCount >= 3 && !empty($effectiveToStartDate))
        ? $effectiveToStartDate
        : null;
    $sets[] = "qualified_date = ?";
    $params[] = $qualifiedDate;

    $params[] = $id;
    $sql = "UPDATE diverse_experience SET " . implode(', ', $sets) . " WHERE experience_id = ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $afterStmt = $pdo->prepare('SELECT * FROM diverse_experience WHERE experience_id = ?');
    $afterStmt->execute([$id]);
    $after = $afterStmt->fetch(PDO::FETCH_ASSOC);
    logAudit(
        $pdo,
        (int) $user['user_id'],
        'UPDATE',
        'diverse_experience',
        $id,
        $existing,
        $after ?: null
    );

    echo json_encode(['success' => true]);
}

/**
 * DELETE /diverse/{id} — ลบรายการนับแตกต่าง
 */
function deleteDiverse(PDO $pdo, int $id, array $user): void
{
    $beforeStmt = $pdo->prepare('SELECT * FROM diverse_experience WHERE experience_id = ?');
    $beforeStmt->execute([$id]);
    $before = $beforeStmt->fetch(PDO::FETCH_ASSOC);
    if (!$before) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรายการนับแตกต่าง']);
        return;
    }

    $stmt = $pdo->prepare("DELETE FROM diverse_experience WHERE experience_id = ?");
    $stmt->execute([$id]);

    logAudit(
        $pdo,
        (int) $user['user_id'],
        'DELETE',
        'diverse_experience',
        $id,
        $before,
        null
    );

    echo json_encode(['success' => true]);
}
