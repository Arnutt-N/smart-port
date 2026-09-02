<?php
// ============================================================================
// routes/probation.php
// Probation Tracking Route Handler
// จัดการเส้นทาง API สำหรับติดตามทดลองปฏิบัติราชการ
//
// Endpoints:
//   GET    /probation                     — รายชื่อผู้ทดลองปฏิบัติราชการ (จาก view)
//   GET    /probation/{enrollmentId}      — รายละเอียดการทดลองปฏิบัติราชการรายบุคคล
//   POST   /probation                     — สร้างการลงทะเบียนทดลองใหม่
//   PUT    /probation/{enrollmentId}      — อัปเดตข้อมูลการทดลอง
//   DELETE /probation/{enrollmentId}      — ถอดออกจากรายการติดตาม (CANCELLED)
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../authz.php';

/**
 * จัดการ request สำหรับ probation tracking endpoints
 *
 * @param PDO $pdo Database connection
 * @param string $method HTTP method
 * @param array $path URL path segments
 */
function handleProbation(PDO $pdo, string $method, array $path): void
{
    $actionMap = [
        'GET' => 'read',
        'POST' => 'create',
        'PUT' => 'update',
        'DELETE' => 'delete',
    ];
    if (!isset($actionMap[$method])) {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }
    requirePermission($actionMap[$method], 'probation');

    switch ($method) {
        case 'GET':
            $enrollmentId = $path[1] ?? null;
            if ($enrollmentId !== null) {
                // GET /probation/{enrollmentId} — รายละเอียดรายบุคคล
                getProbationDetail($pdo, intval($enrollmentId));
            } else {
                // GET /probation — รายชื่อทั้งหมด
                getProbationList($pdo);
            }
            break;

        case 'POST':
            // POST /probation — สร้างการลงทะเบียนใหม่
            createProbationEnrollment($pdo);
            break;

        case 'PUT':
            $enrollmentId = $path[1] ?? null;
            if ($enrollmentId === null) {
                http_response_code(400);
                echo json_encode(['error' => 'Enrollment ID is required']);
                return;
            }
            // PUT /probation/{enrollmentId} — อัปเดตข้อมูล
            updateProbationEnrollment($pdo, intval($enrollmentId));
            break;

        case 'DELETE':
            $enrollmentId = $path[1] ?? null;
            if ($enrollmentId === null) {
                http_response_code(400);
                echo json_encode(['error' => 'Enrollment ID is required']);
                return;
            }
            deleteProbationEnrollment($pdo, intval($enrollmentId));
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
}

/**
 * GET /probation — รายชื่อผู้ทดลองปฏิบัติราชการจาก vw_probation_dashboard
 * remaining_days คำนวณจาก DATEDIFF ใน view (ไม่เก็บในตาราง)
 */
function getProbationList(PDO $pdo): void
{
    $search = $_GET['search'] ?? '';
    // clamp กันค่าติดลบ (500 ที่ SQL ไม่รับ) และค่ายักษ์ (dump ตารางทั้งตาราง)
    $limit = max(1, min(200, intval($_GET['limit'] ?? 20)));
    $offset = max(0, intval($_GET['offset'] ?? 0));

    $where = '';
    $params = [];

    // ใช้ view สำหรับ task aggregates แต่คำนวณ full_name จาก personnel+prefixes เสมอ
    // (view บน TiDB อาจค้างรุ่นก่อน migration 28 — อย่าเชื่อ v.full_name)
    $fullNameExpr = sqlPersonnelFullName('p', 'px');
    try {
        $baseQuery = "SELECT v.enrollment_id, v.personnel_id,
                             {$fullNameExpr} AS full_name,
                             v.position_name,
                             v.department, v.probation_start AS start_date, v.probation_end AS end_date,
                             v.remaining_days, v.overall_status AS status,
                             v.total_tasks, v.completed_tasks,
                             pe.remarks
                      FROM vw_probation_dashboard v
                      JOIN personnel p ON v.personnel_id = p.personnel_id
                      LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
                      JOIN probation_enrollment pe ON v.enrollment_id = pe.enrollment_id";
        $countQuery = "SELECT COUNT(*) AS total
                       FROM vw_probation_dashboard v
                       JOIN personnel p ON v.personnel_id = p.personnel_id
                       LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id";

        if (!empty($search)) {
            $where = " WHERE ({$fullNameExpr} LIKE ? OR v.position_name LIKE ? OR v.department LIKE ?)";
            $searchTerm = "%{$search}%";
            $params = [$searchTerm, $searchTerm, $searchTerm];
        }

        $sql = $baseQuery . $where . " ORDER BY v.remaining_days ASC LIMIT {$limit} OFFSET {$offset}";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        // Fallback: query จาก base tables โดยตรง (ไม่มี task_progress / stakeholder subqueries)
        $baseQuery = "SELECT pe.enrollment_id, pe.personnel_id,
                             {$fullNameExpr} AS full_name,
                             pos.position_name, o.org_name AS department,
                             pe.start_date, pe.end_date,
                             DATEDIFF(pe.end_date, CURDATE()) AS remaining_days,
                             pe.overall_status AS status,
                             0 AS total_tasks, 0 AS completed_tasks,
                             pe.remarks
                      FROM probation_enrollment pe
                      JOIN personnel p ON pe.personnel_id = p.personnel_id
                      LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
                      LEFT JOIN organization o ON p.current_org_id = o.org_id
                      LEFT JOIN position pos ON p.current_position_id = pos.position_id
                      WHERE pe.overall_status = 'IN_PROGRESS'";
        // count ต้อง JOIN ชุดเดียวกับ list — ไม่งั้น search ที่อ้าง px/pos/o จะพังแล้วตก catch นับแค่หน้าปัจจุบัน
        $countQuery = "SELECT COUNT(*) AS total
                       FROM probation_enrollment pe
                       JOIN personnel p ON pe.personnel_id = p.personnel_id
                       LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
                       LEFT JOIN organization o ON p.current_org_id = o.org_id
                       LEFT JOIN position pos ON p.current_position_id = pos.position_id
                       WHERE pe.overall_status = 'IN_PROGRESS'";

        $where = '';
        $params = [];
        if (!empty($search)) {
            $where = " AND ({$fullNameExpr} LIKE ? OR pos.position_name LIKE ? OR o.org_name LIKE ?)";
            $searchTerm = "%{$search}%";
            $params = [$searchTerm, $searchTerm, $searchTerm];
        }

        $sql = $baseQuery . $where . " ORDER BY remaining_days ASC LIMIT {$limit} OFFSET {$offset}";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // Count query for pagination
    try {
        $countStmt = $pdo->prepare($countQuery . $where);
        $countStmt->execute($params);
        $total = intval($countStmt->fetch(PDO::FETCH_ASSOC)['total']);
    } catch (PDOException $e) {
        $total = count($rows);
    }

    // Summary: คำนวณจาก full dataset (ไม่ใช่ current page)
    $inProgress = 0;
    $nearDeadline = 0;
    $overdue = 0;
    try {
        $summaryStmt = $pdo->query("
            SELECT
                SUM(CASE WHEN DATEDIFF(end_date, CURDATE()) > 0 THEN 1 ELSE 0 END) AS in_progress,
                SUM(CASE WHEN DATEDIFF(end_date, CURDATE()) BETWEEN 1 AND 30 THEN 1 ELSE 0 END) AS near_deadline,
                SUM(CASE WHEN DATEDIFF(end_date, CURDATE()) <= 0 THEN 1 ELSE 0 END) AS overdue
            FROM probation_enrollment
            WHERE overall_status = 'IN_PROGRESS'
        ");
        $summaryRow = $summaryStmt->fetch(PDO::FETCH_ASSOC);
        $inProgress = (int) ($summaryRow['in_progress'] ?? 0);
        $nearDeadline = (int) ($summaryRow['near_deadline'] ?? 0);
        $overdue = (int) ($summaryRow['overdue'] ?? 0);
    } catch (PDOException $e) {
        // fallback: นับจาก current page rows
        foreach ($rows as $r) {
            $rem = intval($r['remaining_days'] ?? 0);
            if ($rem > 0) $inProgress++;
            if ($rem >= 1 && $rem <= 30) $nearDeadline++;
            if ($rem <= 0) $overdue++;
        }
    }

    // เพิ่มวันที่ภาษาไทย
    foreach ($rows as &$row) {
        $row['start_date_thai'] = formatThaiDate($row['start_date']);
        $row['end_date_thai'] = formatThaiDate($row['end_date']);
    }
    unset($row);

    echo json_encode([
        'success' => true,
        'data' => $rows,
        'summary' => [
            'total' => $total,
            'in_progress' => $inProgress,
            'near_deadline' => $nearDeadline,
            'overdue' => $overdue
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
 * GET /probation/{enrollmentId} — รายละเอียดการทดลองปฏิบัติราชการ
 * Query ตาราง probation_enrollment โดยตรง (ไม่ใช้ view เพราะ view กรองเฉพาะ IN_PROGRESS)
 * remaining_days คำนวณจาก DATEDIFF(pe.end_date, CURDATE())
 */
function getProbationDetail(PDO $pdo, int $enrollmentId): void
{
    $fullNameExpr = sqlPersonnelFullName('p', 'px');
    $sql = "SELECT pe.enrollment_id, pe.personnel_id,
                   {$fullNameExpr} AS full_name,
                   pos.position_name, o.org_name AS department,
                   pe.start_date, pe.end_date,
                   DATEDIFF(pe.end_date, CURDATE()) AS remaining_days,
                   pe.overall_status AS status,
                   pe.final_result, pe.final_result_date,
                   pe.extension_end_date, pe.extension_reason, pe.remarks,
                   pe.order_number, pe.order_date
            FROM probation_enrollment pe
            JOIN personnel p ON pe.personnel_id = p.personnel_id
            LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
            LEFT JOIN organization o ON p.current_org_id = o.org_id
            LEFT JOIN position pos ON p.current_position_id = pos.position_id
            WHERE pe.enrollment_id = ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$enrollmentId]);
    $record = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        http_response_code(404);
        echo json_encode(['error' => 'Enrollment not found']);
        return;
    }

    // เพิ่มวันที่ภาษาไทย
    $record['start_date_thai'] = formatThaiDate($record['start_date']);
    $record['end_date_thai'] = formatThaiDate($record['end_date']);
    $record['final_result_date_thai'] = formatThaiDate($record['final_result_date']);
    $record['extension_end_date_thai'] = formatThaiDate($record['extension_end_date']);
    $record['order_date_thai'] = formatThaiDate($record['order_date']);

    echo json_encode(['success' => true, 'data' => $record]);
}

/**
 * POST /probation — สร้างการลงทะเบียนทดลองปฏิบัติราชการใหม่
 * Default status = IN_PROGRESS, remaining_days ไม่ถูก INSERT (คำนวณจาก view/DATEDIFF)
 */
function createProbationEnrollment(PDO $pdo): void
{
    $data = json_decode(file_get_contents('php://input'), true);

    // ตรวจสอบข้อมูลที่จำเป็น
    $required = ['personnel_id', 'program_id', 'start_date', 'end_date'];
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            http_response_code(400);
            echo json_encode(['error' => "Missing required field: {$field}"]);
            return;
        }
    }

    // กัน FK ระเบิดเป็น 500 — pre-check ทรัพยากรอ้างอิงก่อน INSERT (pattern เดียวกับ multiplier)
    $personnelId = intval($data['personnel_id']);
    if (!personnelExists($pdo, $personnelId)) {
        http_response_code(404);
        echo json_encode(['error' => 'Personnel not found']);
        return;
    }
    $programCheck = $pdo->prepare('SELECT 1 FROM probation_program WHERE program_id = ? LIMIT 1');
    $programCheck->execute([intval($data['program_id'])]);
    if (!$programCheck->fetchColumn()) {
        http_response_code(404);
        echo json_encode(['error' => 'Program not found']);
        return;
    }

    // end_date ต้องไม่น้อยกว่า start_date (เทียบ string Y-m-d ได้ตรงเพราะรูปแบบ sort ได้)
    if ($data['end_date'] < $data['start_date']) {
        http_response_code(400);
        echo json_encode(['error' => 'end_date must be greater than or equal to start_date']);
        return;
    }

    $sql = "INSERT INTO probation_enrollment (personnel_id, program_id, start_date, end_date, overall_status)
            VALUES (?, ?, ?, ?, 'IN_PROGRESS')";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $personnelId,
            intval($data['program_id']),
            $data['start_date'],
            $data['end_date']
        ]);
    } catch (PDOException $e) {
        // duplicate (personnel_id, program_id) มี unique key — ต้องเป็น 409 ไม่ใช่ 500
        if ($e->getCode() === '23000') {
            http_response_code(409);
            echo json_encode(['error' => 'Enrollment already exists for this personnel and program']);
            return;
        }
        throw $e;
    }

    $enrollmentId = $pdo->lastInsertId();

    http_response_code(201);
    echo json_encode(['success' => true, 'enrollment_id' => intval($enrollmentId)]);
}

/**
 * PUT /probation/{enrollmentId} — อัปเดตข้อมูลการทดลองปฏิบัติราชการ
 * remaining_days ไม่อยู่ใน allowed fields (คำนวณจาก DATEDIFF เท่านั้น)
 */
function updateProbationEnrollment(PDO $pdo, int $enrollmentId): void
{
    $data = json_decode(file_get_contents('php://input'), true);

    $allowed = [
        'start_date',
        'end_date',
        'overall_status',
        'final_result',
        'final_result_date',
        'extension_end_date',
        'extension_reason',
        'remarks',
    ];
    $sets = [];
    $params = [];

    foreach ($allowed as $field) {
        if (array_key_exists($field, $data)) {
            $sets[] = "{$field} = ?";
            $params[] = $data[$field] === '' ? null : $data[$field];
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

    if ($stmt->rowCount() === 0) {
        // แถวอาจมีอยู่แต่ค่าไม่เปลี่ยน — แยก 404 จริง
        $check = $pdo->prepare('SELECT 1 FROM probation_enrollment WHERE enrollment_id = ?');
        $check->execute([$enrollmentId]);
        if (!$check->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Enrollment not found']);
            return;
        }
    }

    echo json_encode(['success' => true]);
}

/**
 * DELETE /probation/{enrollmentId}
 * ถอดออกจากรายการติดตามโดยตั้งสถานะ CANCELLED (ไม่ hard-delete เพราะมี FK งาน/stakeholder)
 */
function deleteProbationEnrollment(PDO $pdo, int $enrollmentId): void
{
    $stmt = $pdo->prepare(
        "UPDATE probation_enrollment
         SET overall_status = 'CANCELLED'
         WHERE enrollment_id = ?
           AND overall_status <> 'CANCELLED'"
    );
    $stmt->execute([$enrollmentId]);

    if ($stmt->rowCount() === 0) {
        $check = $pdo->prepare('SELECT overall_status FROM probation_enrollment WHERE enrollment_id = ?');
        $check->execute([$enrollmentId]);
        $status = $check->fetchColumn();
        if ($status === false) {
            http_response_code(404);
            echo json_encode(['error' => 'Enrollment not found']);
            return;
        }
        // already cancelled — treat as success (idempotent)
    }

    echo json_encode(['success' => true]);
}
