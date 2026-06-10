<?php
// ============================================================================
// routes/equivalence.php
// Position Equivalence Route Handler — การเทียบตำแหน่ง
// จัดการเส้นทาง API สำหรับการเทียบตำแหน่ง พร้อมขั้นตอนอนุมัติ
//
// Endpoints:
//   GET  /equivalence                — รายการเทียบตำแหน่ง (รองรับ filter ตาม personnel_id)
//   GET  /equivalence/{id}           — รายละเอียดรายการเทียบตำแหน่ง
//   POST /equivalence                — สร้างคำขอเทียบตำแหน่ง (สถานะ PENDING เสมอ)
//   PUT  /equivalence/{id}           — อัปเดต / อนุมัติ / ปฏิเสธ คำขอเทียบตำแหน่ง
//
// Approval Workflow:
//   PENDING -> APPROVED  (ต้องระบุ approved_start_date, approved_end_date; คำนวณ approved_total_days; บันทึก approved_by จาก JWT)
//   PENDING -> REJECTED  (NULL ค่า approved_start_date, approved_end_date, approved_total_days)
// ============================================================================

include_once __DIR__ . '/../helpers.php';

/**
 * จัดการ request สำหรับ position equivalence endpoints
 *
 * @param PDO $pdo Database connection
 * @param string $method HTTP method
 * @param array $path URL path segments
 */
function handleEquivalence(PDO $pdo, string $method, array $path): void
{
    switch ($method) {
        case 'GET':
            $id = $path[1] ?? null;
            if ($id !== null) {
                // GET /equivalence/{id} — รายละเอียดรายการ
                getEquivalenceDetail($pdo, intval($id));
            } else {
                // GET /equivalence — รายการทั้งหมด
                getEquivalenceList($pdo);
            }
            break;

        case 'POST':
            // POST /equivalence — สร้างคำขอเทียบตำแหน่งใหม่
            createEquivalence($pdo);
            break;

        case 'PUT':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID ของรายการเทียบตำแหน่ง']);
                return;
            }
            // PUT /equivalence/{id} — อัปเดต / อนุมัติ / ปฏิเสธ
            updateEquivalence($pdo, intval($id));
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
}

/**
 * GET /equivalence — รายการเทียบตำแหน่ง พร้อม pagination และ filter ตาม personnel_id
 */
function getEquivalenceList(PDO $pdo): void
{
    $personnelId = $_GET['personnel_id'] ?? null;
    $limit = intval($_GET['limit'] ?? 20);
    $offset = intval($_GET['offset'] ?? 0);

    $baseQuery = "SELECT pe.*,
                         CONCAT(p.first_name, ' ', p.last_name) AS full_name,
                         u.username AS approved_by_name
                  FROM position_equivalence pe
                  LEFT JOIN personnel p ON pe.personnel_id = p.personnel_id
                  LEFT JOIN users u ON pe.approved_by = u.user_id";

    $countQuery = "SELECT COUNT(*) AS total
                   FROM position_equivalence pe";

    $where = '';
    $params = [];

    if ($personnelId !== null && $personnelId !== '') {
        $where = " WHERE pe.personnel_id = ?";
        $params = [intval($personnelId)];
    }

    // Data query with ordering and pagination
    $sql = $baseQuery . $where . " ORDER BY pe.created_at DESC LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Count query for pagination
    $countStmt = $pdo->prepare($countQuery . $where);
    $countStmt->execute($params);
    $total = intval($countStmt->fetch(PDO::FETCH_ASSOC)['total']);

    // เพิ่มวันที่ภาษาไทย
    foreach ($rows as &$row) {
        $row['request_start_date_thai'] = formatThaiDate($row['request_start_date']);
        $row['request_end_date_thai'] = formatThaiDate($row['request_end_date']);
        $row['approved_start_date_thai'] = formatThaiDate($row['approved_start_date']);
        $row['approved_end_date_thai'] = formatThaiDate($row['approved_end_date']);
    }
    unset($row);

    // Summary จาก full dataset — แยกนับตามสถานะอนุมัติ
    // distinct_personnel นับเฉพาะคนที่มีรายการ APPROVED จริง (ไม่นับ PENDING/REJECTED)
    $summaryStmt = $pdo->query("
        SELECT COUNT(DISTINCT CASE WHEN approval_status = 'APPROVED' THEN personnel_id END) AS distinct_personnel,
               SUM(CASE WHEN approval_status = 'APPROVED' THEN approved_total_days ELSE 0 END) AS total_approved_days,
               SUM(CASE WHEN approval_status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count,
               SUM(CASE WHEN approval_status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
               SUM(CASE WHEN approval_status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count
        FROM position_equivalence
    ");
    $summaryRow = $summaryStmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'data' => $rows,
        'summary' => [
            'total' => $total,
            'distinct_personnel' => (int) ($summaryRow['distinct_personnel'] ?? 0),
            'total_approved_days' => (float) ($summaryRow['total_approved_days'] ?? 0),
            'pending_count' => (int) ($summaryRow['pending_count'] ?? 0),
            'approved_count' => (int) ($summaryRow['approved_count'] ?? 0),
            'rejected_count' => (int) ($summaryRow['rejected_count'] ?? 0),
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
 * GET /equivalence/{id} — รายละเอียดรายการเทียบตำแหน่ง
 */
function getEquivalenceDetail(PDO $pdo, int $id): void
{
    $sql = "SELECT pe.*,
                   CONCAT(p.first_name, ' ', p.last_name) AS full_name,
                   u.username AS approved_by_name
            FROM position_equivalence pe
            LEFT JOIN personnel p ON pe.personnel_id = p.personnel_id
            LEFT JOIN users u ON pe.approved_by = u.user_id
            WHERE pe.equivalence_id = ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
    $record = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรายการเทียบตำแหน่ง']);
        return;
    }

    // เพิ่มวันที่ภาษาไทย
    $record['request_start_date_thai'] = formatThaiDate($record['request_start_date']);
    $record['request_end_date_thai'] = formatThaiDate($record['request_end_date']);
    $record['approved_start_date_thai'] = formatThaiDate($record['approved_start_date']);
    $record['approved_end_date_thai'] = formatThaiDate($record['approved_end_date']);

    echo json_encode(['success' => true, 'data' => $record]);
}

/**
 * POST /equivalence — สร้างคำขอเทียบตำแหน่งใหม่
 * approval_status จะเป็น PENDING เสมอ ไม่ว่า client จะส่งค่าอะไรมา
 * request_total_days คำนวณฝั่ง server จาก DATEDIFF+1
 */
function createEquivalence(PDO $pdo): void
{
    $data = json_decode(file_get_contents('php://input'), true);

    // ตรวจสอบข้อมูลที่จำเป็น
    $required = ['personnel_id', 'actual_position', 'equivalent_type'];
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            http_response_code(400);
            echo json_encode(['error' => "กรุณาระบุข้อมูล: {$field}"]);
            return;
        }
    }

    // คำนวณ request_total_days จากวันที่เริ่มต้นและสิ้นสุด (DATEDIFF+1)
    $requestTotalDays = null;
    if (!empty($data['request_start_date']) && !empty($data['request_end_date'])) {
        $startDate = new DateTime($data['request_start_date']);
        $endDate = new DateTime($data['request_end_date']);
        $requestTotalDays = $endDate->diff($startDate)->days + 1;
    }

    $sql = "INSERT INTO position_equivalence
                (personnel_id, actual_position, equivalent_type, request_start_date, request_end_date, request_total_days, approval_order_ref, approval_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        intval($data['personnel_id']),
        $data['actual_position'],
        $data['equivalent_type'],
        $data['request_start_date'] ?? null,
        $data['request_end_date'] ?? null,
        $requestTotalDays,
        $data['approval_order_ref'] ?? null
    ]);

    http_response_code(201);
    echo json_encode(['success' => true, 'equivalence_id' => intval($pdo->lastInsertId())]);
}

/**
 * PUT /equivalence/{id} — อัปเดต / อนุมัติ / ปฏิเสธ คำขอเทียบตำแหน่ง
 *
 * Approval workflow:
 *   - PENDING -> APPROVED: ต้องระบุ approved_start_date, approved_end_date
 *     คำนวณ approved_total_days, บันทึก approved_by จาก JWT
 *   - PENDING -> REJECTED: NULL ค่า approved dates/days
 *   - ห้ามเปลี่ยนสถานะอื่นนอกจากที่กำหนด
 *
 * Regular update (ไม่มี approval_status):
 *   - อัปเดตเฉพาะ field ที่อนุญาต
 *   - คำนวณ request_total_days ใหม่หากเปลี่ยนวันที่
 */
function updateEquivalence(PDO $pdo, int $id): void
{
    $data = json_decode(file_get_contents('php://input'), true);

    // ดึงข้อมูลปัจจุบัน
    $stmt = $pdo->prepare("SELECT * FROM position_equivalence WHERE equivalence_id = ?");
    $stmt->execute([$id]);
    $current = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$current) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรายการเทียบตำแหน่ง']);
        return;
    }

    // ตรวจสอบการเปลี่ยนสถานะอนุมัติ
    $newStatus = $data['approval_status'] ?? null;

    if ($newStatus !== null) {
        // ตรวจสอบ transition ที่อนุญาต
        $validTransitions = ['PENDING' => ['APPROVED', 'REJECTED']];
        $currentStatus = $current['approval_status'];

        if (!isset($validTransitions[$currentStatus]) || !in_array($newStatus, $validTransitions[$currentStatus])) {
            http_response_code(400);
            echo json_encode(['error' => "ไม่สามารถเปลี่ยนสถานะจาก {$currentStatus} เป็น {$newStatus}"]);
            return;
        }

        if ($newStatus === 'APPROVED') {
            // ต้องระบุวันที่อนุมัติ
            if (empty($data['approved_start_date']) || empty($data['approved_end_date'])) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุดที่อนุมัติ']);
                return;
            }

            // คำนวณ approved_total_days (DATEDIFF+1)
            $approvedStart = new DateTime($data['approved_start_date']);
            $approvedEnd = new DateTime($data['approved_end_date']);
            $approvedTotalDays = $approvedEnd->diff($approvedStart)->days + 1;

            // ดึง user_id จาก JWT สำหรับ approved_by
            $token = getAuthHeader();
            $payload = validateJWT($token);
            $userId = $payload['user_id'] ?? null;

            $sql = "UPDATE position_equivalence
                    SET approval_status = 'APPROVED',
                        approved_start_date = ?,
                        approved_end_date = ?,
                        approved_total_days = ?,
                        approved_by = ?
                    WHERE equivalence_id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $data['approved_start_date'],
                $data['approved_end_date'],
                $approvedTotalDays,
                $userId,
                $id
            ]);
        } elseif ($newStatus === 'REJECTED') {
            $sql = "UPDATE position_equivalence
                    SET approval_status = 'REJECTED',
                        approved_start_date = NULL,
                        approved_end_date = NULL,
                        approved_total_days = NULL
                    WHERE equivalence_id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$id]);
        }

        echo json_encode(['success' => true]);
        return;
    }

    // Regular field update (ไม่มีการเปลี่ยนสถานะ)
    $allowed = ['actual_position', 'equivalent_type', 'request_start_date', 'request_end_date', 'approval_order_ref'];
    $sets = [];
    $params = [];

    foreach ($allowed as $field) {
        if (isset($data[$field])) {
            $sets[] = "{$field} = ?";
            $params[] = $data[$field];
        }
    }

    // คำนวณ request_total_days ใหม่หากเปลี่ยนวันที่
    $startDate = $data['request_start_date'] ?? $current['request_start_date'];
    $endDate = $data['request_end_date'] ?? $current['request_end_date'];
    if ((isset($data['request_start_date']) || isset($data['request_end_date'])) && !empty($startDate) && !empty($endDate)) {
        $start = new DateTime($startDate);
        $end = new DateTime($endDate);
        $requestTotalDays = $end->diff($start)->days + 1;
        $sets[] = "request_total_days = ?";
        $params[] = $requestTotalDays;
    }

    if (empty($sets)) {
        http_response_code(400);
        echo json_encode(['error' => 'ไม่มีข้อมูลที่สามารถอัปเดตได้']);
        return;
    }

    $params[] = $id;
    $sql = "UPDATE position_equivalence SET " . implode(', ', $sets) . " WHERE equivalence_id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    echo json_encode(['success' => true]);
}
