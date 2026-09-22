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
include_once __DIR__ . '/../audit.php';
include_once __DIR__ . '/../TimeEntryCrud.php';

/** @var list<string> ฟิลด์วันที่ของ equivalence ที่ต้องผ่าน strict parse เมื่อส่งมา */
const EQUIVALENCE_DATE_FIELDS = ['request_start_date', 'request_end_date'];

/**
 * จัดการ request สำหรับ position equivalence endpoints
 *
 * @param PDO $pdo Database connection
 * @param string $method HTTP method
 * @param array $path URL path segments
 */
function handleEquivalence(PDO $pdo, string $method, array $path): void
{
    // equivalence ไม่มี DELETE (actionMap เดิมมีแค่ GET/POST/PUT) — DELETE ตก 405 แบบเดิม
    $action = ($method === 'DELETE') ? null : timeEntryAction($method);
    if ($action === null) {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    $user = resolveEquivalenceUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $denied = timeEntryDenied($action, 'equivalence', $user, $pdo);
    if ($denied !== null) {
        timeEntryEmit(['http' => $denied['status'], 'body' => $denied['body']]);
        return;
    }

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
            createEquivalence($pdo, $user);
            break;

        case 'PUT':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID ของรายการเทียบตำแหน่ง']);
                return;
            }
            // PUT /equivalence/{id} — อัปเดต / อนุมัติ / ปฏิเสธ
            updateEquivalence($pdo, intval($id), $user);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
}

/**
 * N23/N56: test hook — pattern เดียวกับ resolveImportUser (array_key_exists
 * เพื่อให้ฉีด null = unauthenticated ได้)
 */
function resolveEquivalenceUser(): ?array
{
    if (array_key_exists('__auth_user', $GLOBALS)) {
        $u = $GLOBALS['__auth_user'];
        return is_array($u) ? $u : null;
    }
    return getAuthenticatedUser();
}

/**
 * Route cfg สำหรับ TimeEntryCrud cores (list/detail ใช้ชุดเดียวกัน)
 * หมายเหตุ: count query ต้นฉบับไม่ join users (แต่ LEFT JOIN ไม่เปลี่ยนจำนวนแถว
 * เพราะ user_id เป็น PK — ผลลัพธ์เท่ากันทุกประการ)
 */
function equivalenceTimeEntryCfg(): array
{
    return [
        'table' => 'position_equivalence',
        'alias' => 'pe',
        'idCol' => 'pe.equivalence_id',
        'joins' => ' LEFT JOIN personnel p ON pe.personnel_id = p.personnel_id
                  LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
                  LEFT JOIN users u ON pe.approved_by = u.user_id',
        'selectExtra' => sqlPersonnelFullName() . " AS full_name,\n                         u.username AS approved_by_name",
        'searchSql' => [
            'p.first_name LIKE ?',
            'p.last_name LIKE ?',
            '(' . sqlPersonnelFullName() . ') LIKE ?',
            'pe.actual_position LIKE ?',
            'pe.equivalent_type LIKE ?',
            'pe.approval_order_ref LIKE ?',
        ],
        'orderBy' => 'pe.created_at DESC',
        'summarySql' => "
            SELECT COUNT(DISTINCT CASE WHEN approval_status = 'APPROVED' THEN personnel_id END) AS distinct_personnel,
                   SUM(CASE WHEN approval_status = 'APPROVED' THEN approved_total_days ELSE 0 END) AS total_approved_days,
                   SUM(CASE WHEN approval_status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count,
                   SUM(CASE WHEN approval_status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
                   SUM(CASE WHEN approval_status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count
            FROM position_equivalence
        ",
        'summaryMap' => function (array $summaryRow, int $total): array {
            return [
                'total' => $total,
                'distinct_personnel' => (int) ($summaryRow['distinct_personnel'] ?? 0),
                'total_approved_days' => (float) ($summaryRow['total_approved_days'] ?? 0),
                'pending_count' => (int) ($summaryRow['pending_count'] ?? 0),
                'approved_count' => (int) ($summaryRow['approved_count'] ?? 0),
                'rejected_count' => (int) ($summaryRow['rejected_count'] ?? 0),
            ];
        },
        'dateFields' => ['request_start_date', 'request_end_date', 'approved_start_date', 'approved_end_date'],
    ];
}

/**
 * GET /equivalence — รายการเทียบตำแหน่ง พร้อม pagination
 * filter ตาม personnel_id และค้นหาด้วย search (ชื่อ-สกุล, ตำแหน่งจริง, ประเภทที่เทียบ, เลขที่คำสั่ง)
 */
function getEquivalenceList(PDO $pdo): void
{
    timeEntryEmit(timeEntryList($pdo, equivalenceTimeEntryCfg()));
}

/**
 * GET /equivalence/{id} — รายละเอียดรายการเทียบตำแหน่ง
 */
function getEquivalenceDetail(PDO $pdo, int $id): void
{
    timeEntryEmit(timeEntryDetail($pdo, equivalenceTimeEntryCfg(), $id, 'ไม่พบรายการเทียบตำแหน่ง'));
}

/**
 * POST /equivalence — สร้างคำขอเทียบตำแหน่งใหม่
 * approval_status จะเป็น PENDING เสมอ ไม่ว่า client จะส่งค่าอะไรมา
 * request_total_days คำนวณฝั่ง server จาก DATEDIFF+1
 */
function createEquivalence(PDO $pdo, array $user, ?array $input = null): void
{
    $data = $input ?? json_decode(file_get_contents('php://input'), true);

    // ตรวจสอบข้อมูลที่จำเป็น
    $required = ['personnel_id', 'actual_position', 'equivalent_type'];
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            http_response_code(400);
            echo json_encode(['error' => "กรุณาระบุข้อมูล: {$field}"]);
            return;
        }
    }

    // N39: pre-check personnel ก่อน INSERT (pattern เดียวกับ probation/multiplier)
    // U5: personnel_id ต้องเป็น int-like ก่อน (กัน array/bool ถูก intval กลบเงียบ)
    $personnelId = strictPersonnelId($data['personnel_id']);
    if ($personnelId === null) {
        http_response_code(400);
        echo json_encode(['error' => 'รูปแบบข้อมูลไม่ถูกต้อง']);
        return;
    }
    if (!personnelExists($pdo, $personnelId)) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบบุคลากร']);
        return;
    }

    // U6: ตรวจวันรายฟิลด์ก่อน (กัน single-sided ผิด format หลุดไป bind ดิบ)
    $dateError = dateFieldError($data, EQUIVALENCE_DATE_FIELDS);
    if ($dateError !== null) {
        http_response_code(400);
        echo json_encode(['error' => $dateError]);
        return;
    }

    // R7: '' = ไม่ส่งมา (กัน bind '' ดิบลง DATE) — normalize เป็น null ก่อนใช้ต่อ
    foreach (EQUIVALENCE_DATE_FIELDS as $dateField) {
        if (array_key_exists($dateField, $data) && $data[$dateField] === '') {
            $data[$dateField] = null;
        }
    }

    // คำนวณ request_total_days จากวันที่เริ่มต้นและสิ้นสุด (DATEDIFF+1)
    // U3: parse เข้ม (กัน format หลวม + non-string ที่เคยทำ TypeError 500)
    $requestTotalDays = null;
    if (!empty($data['request_start_date']) && !empty($data['request_end_date'])) {
        $startDate = is_string($data['request_start_date'])
            ? strictDate($data['request_start_date']) : null;
        $endDate = is_string($data['request_end_date'])
            ? strictDate($data['request_end_date']) : null;
        if ($startDate === null || $endDate === null) {
            http_response_code(400);
            echo json_encode(['error' => 'รูปแบบวันที่ไม่ถูกต้อง']);
            return;
        }
        $requestTotalDays = $endDate->diff($startDate)->days + 1;
    }

    $sql = "INSERT INTO position_equivalence
                (personnel_id, actual_position, equivalent_type, request_start_date, request_end_date, request_total_days, approval_order_ref, approval_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        $personnelId,
        $data['actual_position'],
        $data['equivalent_type'],
        $data['request_start_date'] ?? null,
        $data['request_end_date'] ?? null,
        $requestTotalDays,
        $data['approval_order_ref'] ?? null
    ]);

    $equivalenceId = (int) $pdo->lastInsertId();
    $afterStmt = $pdo->prepare('SELECT * FROM position_equivalence WHERE equivalence_id = ?');
    $afterStmt->execute([$equivalenceId]);
    $after = $afterStmt->fetch(PDO::FETCH_ASSOC);
    timeEntryWriteAudit(
        $pdo,
        (int) $user['user_id'],
        'CREATE',
        'position_equivalence',
        $equivalenceId,
        null,
        $after ?: null
    );

    timeEntryEmit(['http' => 201, 'body' => ['success' => true, 'equivalence_id' => $equivalenceId]]);
}

/**
 * Inclusive day count for an approved date range.
 * Throws InvalidArgumentException when end < start (message matches MultiplierEngine.php:20).
 */
function approvedRangeTotalDays(string $start, string $end): int
{
    $approvedStart = strictDate($start);
    $approvedEnd = strictDate($end);
    if ($approvedStart === null || $approvedEnd === null) {
        throw new InvalidArgumentException('รูปแบบวันที่ไม่ถูกต้อง');
    }
    if ($approvedEnd < $approvedStart) {
        throw new InvalidArgumentException('วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น');
    }
    return $approvedEnd->diff($approvedStart)->days + 1;
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
function updateEquivalence(PDO $pdo, int $id, array $user, ?array $input = null): void
{
    $data = $input ?? json_decode(file_get_contents('php://input'), true);

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
        // อนุมัติ/ปฏิเสธ — สงวนสิทธิ์ admin เท่านั้น (resource แยกจาก 'equivalence' ปกติที่ operator แก้ field ได้)
        $approvalDenied = timeEntryDenied('update', 'equivalence_approval', $user, $pdo);
        if ($approvalDenied !== null) {
            timeEntryEmit(['http' => $approvalDenied['status'], 'body' => $approvalDenied['body']]);
            return;
        }
        // ใช้ $user ที่ dispatcher ส่งมา (prod = ค่าเดียวกับ getAuthenticatedUser;
        // direct-call test ฉีด user ได้โดยไม่พึ่ง JWT/exit)
        $approver = $user;

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

            // คำนวณ approved_total_days (DATEDIFF+1) — จับ subclass ก่อน Exception
            try {
                $approvedTotalDays = approvedRangeTotalDays($data['approved_start_date'], $data['approved_end_date']);
            } catch (InvalidArgumentException $e) {
                http_response_code(400);
                echo json_encode(['error' => $e->getMessage()]);
                return;
            } catch (Exception $e) {
                http_response_code(400);
                echo json_encode(['error' => 'รูปแบบวันที่ไม่ถูกต้อง']);
                return;
            }

            // ผู้อนุมัติจาก JWT (ผ่าน requirePermission('update', 'equivalence_approval') แล้ว) สำหรับ approved_by
            $userId = $approver['user_id'] ?? null;

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

            timeEntryWriteAudit(
                $pdo,
                $userId,
                'UPDATE',
                'position_equivalence',
                $id,
                ['approval_status' => $currentStatus],
                [
                    'approval_status' => 'APPROVED',
                    'approved_start_date' => $data['approved_start_date'],
                    'approved_end_date' => $data['approved_end_date'],
                    'approved_total_days' => $approvedTotalDays,
                ]
            );
        } elseif ($newStatus === 'REJECTED') {
            $userId = $approver['user_id'] ?? null;

            // N38: เคลียร์ approved_by ด้วย — ไม่งั้นชื่อผู้อนุมัติค้างบนรายการที่ถูกปฏิเสธ
            $sql = "UPDATE position_equivalence
                    SET approval_status = 'REJECTED',
                        approved_start_date = NULL,
                        approved_end_date = NULL,
                        approved_total_days = NULL,
                        approved_by = NULL
                    WHERE equivalence_id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$id]);

            timeEntryWriteAudit(
                $pdo,
                $userId,
                'UPDATE',
                'position_equivalence',
                $id,
                ['approval_status' => $currentStatus],
                ['approval_status' => 'REJECTED']
            );
        }

        timeEntryEmit(['http' => 200, 'body' => ['success' => true]]);
        return;
    }

    // Regular field update (ไม่มีการเปลี่ยนสถานะ)
    // U6: ตรวจวันรายฟิลด์ที่ส่งมาก่อน (เฉพาะค่าที่ส่งมา ไม่แตะค่าจาก DB)
    $dateError = dateFieldError($data, EQUIVALENCE_DATE_FIELDS);
    if ($dateError !== null) {
        http_response_code(400);
        echo json_encode(['error' => $dateError]);
        return;
    }
    // R7: '' = ไม่ส่งมา (กัน bind '' ดิบลง DATE) — normalize เป็น null
    // (loop ข้างล่างใช้ isset จึงข้าม field นี้ = คงค่าเดิมไว้)
    foreach (EQUIVALENCE_DATE_FIELDS as $dateField) {
        if (array_key_exists($dateField, $data) && $data[$dateField] === '') {
            $data[$dateField] = null;
        }
    }
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
        // U3: parse เข้ม (กัน format หลวม + non-string ที่เคยทำ TypeError 500)
        $start = is_string($startDate) ? strictDate($startDate) : null;
        $end = is_string($endDate) ? strictDate($endDate) : null;
        if ($start === null || $end === null) {
            http_response_code(400);
            echo json_encode(['error' => 'รูปแบบวันที่ไม่ถูกต้อง']);
            return;
        }
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

    $afterStmt = $pdo->prepare('SELECT * FROM position_equivalence WHERE equivalence_id = ?');
    $afterStmt->execute([$id]);
    $after = $afterStmt->fetch(PDO::FETCH_ASSOC);
    timeEntryWriteAudit(
        $pdo,
        (int) $user['user_id'],
        'UPDATE',
        'position_equivalence',
        $id,
        $current,
        $after ?: null
    );

    timeEntryEmit(['http' => 200, 'body' => ['success' => true]]);
}
