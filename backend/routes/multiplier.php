<?php
// ============================================================================
// routes/multiplier.php
// การนับเวลาราชการเป็นทวีคูณ
//
// Endpoints for first vertical slice:
//   GET /multiplier/areas — master data lookup options
//   GET /multiplier       — list multiplier records
//   POST /multiplier      — create multiplier record
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../audit.php';
include_once __DIR__ . '/../MultiplierEngine.php';

function handleMultiplier(PDO $pdo, string $method, array $path): void
{
    // GET = read, POST = create, PUT = update, DELETE = delete
    $actionMap = ['GET' => 'read', 'POST' => 'create', 'PUT' => 'update', 'DELETE' => 'delete'];
    $action = $actionMap[$method] ?? 'read';
    requirePermission($action, 'multiplier');

    // ดึง user จาก JWT (สำหรับ audit log)
    $user = getAuthenticatedUser();

    try {
        switch ($method) {
            case 'GET':
                $resource = $path[1] ?? '';
                if ($resource === 'areas') {
                    getMultiplierAreas($pdo);
                    return;
                }
                if ($resource === '') {
                    getMultiplierList($pdo);
                    return;
                }
                // GET /multiplier/{id} — get single multiplier record
                if (ctype_digit($resource)) {
                    getMultiplierById($pdo, (int) $resource);
                    return;
                }
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
                return;

            case 'POST':
                if (($path[1] ?? '') === 'areas') {
                    createMultiplierArea($pdo, $user);
                    return;
                }
                createMultiplier($pdo, $user);
                return;

            case 'PUT':
                // PUT /multiplier/areas/{id}/status
                if (
                    ($path[1] ?? '') === 'areas'
                    && ctype_digit($path[2] ?? '')
                    && ($path[3] ?? '') === 'status'
                ) {
                    setMultiplierAreaStatus($pdo, (int) $path[2]);
                    return;
                }
                // PUT /multiplier/{id} — update multiplier record
                if (($path[1] ?? '') !== '' && ($path[1] ?? '') !== 'areas' && ctype_digit($path[1])) {
                    updateMultiplier($pdo, (int) $path[1], $user);
                    return;
                }
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
                return;

            case 'DELETE':
                // DELETE /multiplier/{id} — delete multiplier record
                if (($path[1] ?? '') !== '' && ctype_digit($path[1])) {
                    deleteMultiplier($pdo, (int) $path[1], $user);
                    return;
                }
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
                return;

            default:
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                return;
        }
    } catch (PDOException $e) {
        // กัน PDOException หลุดออกไปเป็น HTML 500 / leak รายละเอียด SQL
        error_log('[multiplier] DB error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'เกิดข้อผิดพลาดในการเข้าถึงฐานข้อมูล']);
    }
}

function getMultiplierAreas(PDO $pdo): void
{
    $province = trim($_GET['province'] ?? '');
    $district = trim($_GET['district'] ?? '');
    $activeOnly = ($_GET['active_only'] ?? '1') !== '0';

    $where = [];
    $params = [];

    if ($activeOnly) {
        $where[] = 'is_active = 1';
    }

    if ($province !== '') {
        $where[] = 'province = ?';
        $params[] = $province;
    }

    if ($district !== '') {
        $where[] = '(district = ? OR district IS NULL)';
        $params[] = $district;
    }

    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

    $sql = "
        SELECT
            area_multiplier_id,
            province,
            district,
            basis_type,
            multiplier_ratio,
            effective_start_date,
            effective_end_date,
            legal_reference,
            source_reference,
            is_active,
            created_at,
            updated_at
        FROM special_area_multiplier
        {$whereSql}
        ORDER BY
            province ASC,
            CASE WHEN district IS NULL THEN 0 ELSE 1 END ASC,
            district ASC,
            effective_start_date DESC,
            area_multiplier_id DESC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$row) {
        decorateAreaRow($row);
    }
    unset($row);

    echo json_encode([
        'success' => true,
        'data' => $rows,
        'summary' => [
            'total' => count($rows),
            'source_pending' => count(array_filter($rows, fn ($row) => $row['source_pending'])),
        ],
    ]);
}

function getMultiplierById(PDO $pdo, int $multiplierId): void
{
    $stmt = $pdo->prepare("
        SELECT
            me.*,
            CONCAT(p.first_name, ' ', p.last_name) AS full_name,
            sam.legal_reference,
            sam.source_reference
        FROM multiplier_experience me
        LEFT JOIN personnel p ON me.personnel_id = p.personnel_id
        LEFT JOIN special_area_multiplier sam ON me.area_multiplier_id = sam.area_multiplier_id
        WHERE me.multiplier_id = ?
    ");
    $stmt->execute([$multiplierId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรายการที่ระบุ']);
        return;
    }

    decorateMultiplierRow($row);

    echo json_encode([
        'success' => true,
        'data' => $row,
    ]);
}

function getMultiplierList(PDO $pdo): void
{
    $personnelId = $_GET['personnel_id'] ?? null;
    // clamp กัน limit=-1 (SQL error) และ limit ใหญ่เกิน (resource exhaustion)
    $limit = max(1, min(100, intval($_GET['limit'] ?? 20)));
    $offset = max(0, intval($_GET['offset'] ?? 0));

    $where = [];
    $params = [];

    if ($personnelId !== null && $personnelId !== '') {
        $where[] = 'me.personnel_id = ?';
        $params[] = intval($personnelId);
    }

    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

    $baseQuery = "
        FROM multiplier_experience me
        LEFT JOIN personnel p ON me.personnel_id = p.personnel_id
        LEFT JOIN special_area_multiplier sam ON me.area_multiplier_id = sam.area_multiplier_id
        {$whereSql}
    ";

    $sql = "
        SELECT
            me.*,
            CONCAT(p.first_name, ' ', p.last_name) AS full_name,
            sam.legal_reference,
            sam.source_reference
        {$baseQuery}
        ORDER BY me.start_date DESC, me.multiplier_id DESC
        LIMIT {$limit} OFFSET {$offset}
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countStmt = $pdo->prepare("SELECT COUNT(*) AS total {$baseQuery}");
    $countStmt->execute($params);
    $total = intval($countStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    foreach ($rows as &$row) {
        decorateMultiplierRow($row);
    }
    unset($row);

    $summaryStmt = $pdo->query("
        SELECT
            COUNT(DISTINCT personnel_id) AS distinct_personnel,
            COALESCE(SUM(effective_days), 0) AS total_effective_days,
            COALESCE(SUM(bonus_days), 0) AS total_bonus_days
        FROM multiplier_experience
    ");
    $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    echo json_encode([
        'success' => true,
        'data' => $rows,
        'summary' => [
            'total' => $total,
            'distinct_personnel' => (int) ($summary['distinct_personnel'] ?? 0),
            'total_effective_days' => (float) ($summary['total_effective_days'] ?? 0),
            'total_bonus_days' => (float) ($summary['total_bonus_days'] ?? 0),
        ],
        'pagination' => [
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => ($offset + $limit) < $total,
        ],
    ]);
}

function createMultiplier(PDO $pdo, array $user): void
{
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'รูปแบบข้อมูลไม่ถูกต้อง']);
        return;
    }

    $required = ['personnel_id', 'area_multiplier_id', 'start_date', 'end_date'];
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            http_response_code(400);
            echo json_encode(['error' => "กรุณาระบุ {$field}"]);
            return;
        }
    }

    // ตรวจว่า personnel_id มีอยู่จริงก่อน เพื่อคืน 404 ที่อ่านง่าย แทนที่จะปล่อยให้ FK ระเบิดเป็น 500
    $personnelId = intval($data['personnel_id']);
    $personCheck = $pdo->prepare('SELECT 1 FROM personnel WHERE personnel_id = ? LIMIT 1');
    $personCheck->execute([$personnelId]);
    if (!$personCheck->fetchColumn()) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบบุคลากรตามรหัสที่ระบุ']);
        return;
    }

    try {
        $computed = computeMultiplierFields(
            $pdo,
            intval($data['area_multiplier_id']),
            $data['start_date'],
            $data['end_date']
        );
    } catch (InvalidArgumentException $e) {
        http_response_code(400);
        echo json_encode(['error' => $e->getMessage()]);
        return;
    }

    // กันการนับซ้ำ: ปฏิเสธถ้า "ช่วงที่นับได้จริง" (eligible period) ทับกับรายการเดิมของบุคคลนี้
    // เพราะ bonus_days aggregate จากช่วงเหล่านี้ การทับ = double-count วันเลื่อนระดับ
    $overlapStmt = $pdo->prepare("
        SELECT COUNT(*) FROM multiplier_experience
        WHERE personnel_id = ?
          AND eligible_start_date <= ?
          AND eligible_end_date >= ?
    ");
    $overlapStmt->execute([
        $personnelId,
        $computed['eligible_end_date'],
        $computed['eligible_start_date'],
    ]);
    if ((int) $overlapStmt->fetchColumn() > 0) {
        http_response_code(409);
        echo json_encode(['error' => 'ช่วงวันที่นับทวีคูณทับซ้อนกับรายการเดิมของบุคลากรนี้']);
        return;
    }

    $sql = "INSERT INTO multiplier_experience
            (personnel_id, area_multiplier_id, province, district, basis_type,
             start_date, end_date, eligible_start_date, eligible_end_date,
             service_days, eligible_days, multiplier_ratio, effective_days,
             bonus_days, net_end_date, net_years, net_months, net_day_remainder,
             proof_reference, description, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        $personnelId,
        $computed['area_multiplier_id'],
        $computed['province'],
        $computed['district'],
        $computed['basis_type'],
        $data['start_date'],
        $data['end_date'],
        $computed['eligible_start_date'],
        $computed['eligible_end_date'],
        $computed['service_days'],
        $computed['eligible_days'],
        $computed['multiplier_ratio'],
        $computed['effective_days'],
        $computed['bonus_days'],
        $computed['net_end_date'],
        $computed['net_years'],
        $computed['net_months'],
        $computed['net_day_remainder'],
        $data['proof_reference'] ?? null,
        $data['description'] ?? null,
        $user['user_id'] ?? null,
    ]);

    $multiplierId = intval($pdo->lastInsertId());

    // Audit log: บันทึกการสร้างรายการทวีคูณ
    logAudit(
        $pdo,
        $user['user_id'],
        'CREATE',
        'multiplier_experience',
        $multiplierId,
        null,
        [
            'personnel_id' => $personnelId,
            'area_multiplier_id' => $computed['area_multiplier_id'],
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'],
            'bonus_days' => $computed['bonus_days'],
        ]
    );

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'multiplier_id' => $multiplierId,
        'computed' => $computed,
    ]);
}

function fetchAreaRow(PDO $pdo, int $areaId): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM special_area_multiplier WHERE area_multiplier_id = ?');
    $stmt->execute([$areaId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }
    decorateAreaRow($row);
    return $row;
}

function createMultiplierArea(PDO $pdo, array $user): void
{
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'รูปแบบข้อมูลไม่ถูกต้อง']);
        return;
    }

    $validated = validateAreaInput($data);
    if ($validated['error'] !== null) {
        http_response_code(400);
        echo json_encode(['error' => $validated['error']]);
        return;
    }
    $v = $validated['values'];

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO special_area_multiplier
                (province, district, basis_type, multiplier_ratio,
                 effective_start_date, effective_end_date,
                 legal_reference, source_reference, is_active, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
        );
        $stmt->execute([
            $v['province'],
            $v['district'],
            $v['basis_type'],
            $v['multiplier_ratio'],
            $v['effective_start_date'],
            $v['effective_end_date'],
            $v['legal_reference'],
            $v['source_reference'],
            $user['user_id'] ?? null,
        ]);
    } catch (PDOException $e) {
        // unique index uq_area_multiplier_exact_period = source of truth เรื่องซ้ำ (กัน race — ไม่ pre-check)
        if ($e->getCode() === '23000') {
            http_response_code(409);
            echo json_encode(['error' => 'มีพื้นที่/ฐานประกาศ/วันเริ่มมีผลชุดนี้อยู่แล้ว']);
            return;
        }
        throw $e; // ให้ catch กลางใน handleMultiplier ตอบ 500 generic
    }

    $areaId = (int) $pdo->lastInsertId();

    // Audit log: บันทึกการสร้างพื้นที่พิเศษ
    logAudit(
        $pdo,
        $user['user_id'],
        'CREATE',
        'special_area_multiplier',
        $areaId,
        null,
        [
            'province' => $v['province'],
            'district' => $v['district'],
            'basis_type' => $v['basis_type'],
            'multiplier_ratio' => $v['multiplier_ratio'],
            'effective_start_date' => $v['effective_start_date'],
        ]
    );

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'area_multiplier_id' => $areaId,
        'data' => fetchAreaRow($pdo, $areaId),
    ]);
}

function setMultiplierAreaStatus(PDO $pdo, int $areaId): void
{
    $user = getAuthenticatedUser();
    $data = json_decode(file_get_contents('php://input'), true);
    $isActive = is_array($data) ? ($data['is_active'] ?? null) : null;
    // รับเฉพาะ 0/1 (int หรือ string) — ค่าอื่นตอบ 400
    if (!in_array($isActive, [0, 1, '0', '1'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณาระบุ is_active เป็น 0 หรือ 1']);
        return;
    }

    // ดึงค่าก่อนแก้ไขเพื่อ audit log
    $beforeRow = fetchAreaRow($pdo, $areaId);
    if ($beforeRow === null) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบพื้นที่ตามรหัสที่ระบุ']);
        return;
    }

    // UPDATE ก่อนแล้วค่อยอ่านกลับ — idempotent โดยธรรมชาติ (ตั้งค่าเดิมซ้ำ = 200 ปกติ)
    $pdo->prepare('UPDATE special_area_multiplier SET is_active = ? WHERE area_multiplier_id = ?')
        ->execute([(int) $isActive, $areaId]);

    $row = fetchAreaRow($pdo, $areaId);

    // Audit log: บันทึกการเปลี่ยนสถานะพื้นที่พิเศษ
    logAudit(
        $pdo,
        $user['user_id'],
        'UPDATE',
        'special_area_multiplier',
        $areaId,
        ['is_active' => $beforeRow['is_active']],
        ['is_active' => $row['is_active']]
    );

    echo json_encode(['success' => true, 'data' => $row]);
}

function updateMultiplier(PDO $pdo, int $multiplierId, array $user, ?array $input = null): void
{
    $data = $input ?? json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'รูปแบบข้อมูลไม่ถูกต้อง']);
        return;
    }

    // ตรวจว่า record มีอยู่จริง
    $existingStmt = $pdo->prepare('SELECT * FROM multiplier_experience WHERE multiplier_id = ?');
    $existingStmt->execute([$multiplierId]);
    $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรายการที่ระบุ']);
        return;
    }

    // ใช้ค่าเดิมถ้าไม่ได้ส่งมา
    $personnelId = intval($data['personnel_id'] ?? $existing['personnel_id']);
    $areaMultiplierId = intval($data['area_multiplier_id'] ?? $existing['area_multiplier_id']);
    $startDate = $data['start_date'] ?? $existing['start_date'];
    $endDate = $data['end_date'] ?? $existing['end_date'];

    // ตรวจว่า personnel_id มีอยู่จริง
    if ($personnelId !== intval($existing['personnel_id'])) {
        $personCheck = $pdo->prepare('SELECT 1 FROM personnel WHERE personnel_id = ? LIMIT 1');
        $personCheck->execute([$personnelId]);
        if (!$personCheck->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'ไม่พบบุคลากรตามรหัสที่ระบุ']);
            return;
        }
    }

    // คำนวณ fields ใหม่
    try {
        $computed = computeMultiplierFields($pdo, $areaMultiplierId, $startDate, $endDate);
    } catch (InvalidArgumentException $e) {
        http_response_code(400);
        echo json_encode(['error' => $e->getMessage()]);
        return;
    }

    // ตรวจ overlap (ยกเว้นตัวเอง)
    $overlapStmt = $pdo->prepare("
        SELECT COUNT(*) FROM multiplier_experience
        WHERE personnel_id = ?
          AND multiplier_id != ?
          AND eligible_start_date <= ?
          AND eligible_end_date >= ?
    ");
    $overlapStmt->execute([
        $personnelId,
        $multiplierId,
        $computed['eligible_end_date'],
        $computed['eligible_start_date'],
    ]);
    if ((int) $overlapStmt->fetchColumn() > 0) {
        http_response_code(409);
        echo json_encode(['error' => 'ช่วงวันที่นับทวีคูณทับซ้อนกับรายการเดิมของบุคลากรนี้']);
        return;
    }

    // Update
    $sql = "UPDATE multiplier_experience SET
                personnel_id = ?,
                area_multiplier_id = ?,
                province = ?,
                district = ?,
                basis_type = ?,
                start_date = ?,
                end_date = ?,
                eligible_start_date = ?,
                eligible_end_date = ?,
                service_days = ?,
                eligible_days = ?,
                multiplier_ratio = ?,
                effective_days = ?,
                bonus_days = ?,
                net_end_date = ?,
                net_years = ?,
                net_months = ?,
                net_day_remainder = ?,
                proof_reference = ?,
                description = ?,
                updated_at = NOW()
            WHERE multiplier_id = ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        $personnelId,
        $computed['area_multiplier_id'],
        $computed['province'],
        $computed['district'],
        $computed['basis_type'],
        $startDate,
        $endDate,
        $computed['eligible_start_date'],
        $computed['eligible_end_date'],
        $computed['service_days'],
        $computed['eligible_days'],
        $computed['multiplier_ratio'],
        $computed['effective_days'],
        $computed['bonus_days'],
        $computed['net_end_date'],
        $computed['net_years'],
        $computed['net_months'],
        $computed['net_day_remainder'],
        $data['proof_reference'] ?? $existing['proof_reference'],
        $data['description'] ?? $existing['description'],
        $multiplierId,
    ]);

    $afterStmt = $pdo->prepare('SELECT * FROM multiplier_experience WHERE multiplier_id = ?');
    $afterStmt->execute([$multiplierId]);
    $after = $afterStmt->fetch(PDO::FETCH_ASSOC);
    logAudit(
        $pdo,
        (int) $user['user_id'],
        'UPDATE',
        'multiplier_experience',
        $multiplierId,
        $existing,
        $after ?: null
    );

    // ดึงข้อมูลที่อัปเดตแล้วพร้อม decoration
    $updatedStmt = $pdo->prepare("
        SELECT
            me.*,
            CONCAT(p.first_name, ' ', p.last_name) AS full_name,
            sam.legal_reference,
            sam.source_reference
        FROM multiplier_experience me
        LEFT JOIN personnel p ON me.personnel_id = p.personnel_id
        LEFT JOIN special_area_multiplier sam ON me.area_multiplier_id = sam.area_multiplier_id
        WHERE me.multiplier_id = ?
    ");
    $updatedStmt->execute([$multiplierId]);
    $updated = $updatedStmt->fetch(PDO::FETCH_ASSOC);

    decorateMultiplierRow($updated);

    echo json_encode([
        'success' => true,
        'multiplier_id' => $multiplierId,
        'data' => $updated,
        'computed' => $computed,
    ]);
}

function deleteMultiplier(PDO $pdo, int $multiplierId, array $user): void
{
    // ดึงค่าก่อนลบเพื่อ audit log (snapshot ชุดเดียวกับที่ create เก็บเป็น after_value)
    $existingStmt = $pdo->prepare('SELECT * FROM multiplier_experience WHERE multiplier_id = ?');
    $existingStmt->execute([$multiplierId]);
    $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรายการที่ระบุ']);
        return;
    }

    // ลบ record
    $stmt = $pdo->prepare('DELETE FROM multiplier_experience WHERE multiplier_id = ?');
    $stmt->execute([$multiplierId]);

    // Audit log: บันทึกการลบรายการทวีคูณ
    logAudit(
        $pdo,
        $user['user_id'],
        'DELETE',
        'multiplier_experience',
        $multiplierId,
        [
            'personnel_id' => (int) $existing['personnel_id'],
            'area_multiplier_id' => (int) $existing['area_multiplier_id'],
            'start_date' => $existing['start_date'],
            'end_date' => $existing['end_date'],
            'bonus_days' => (float) $existing['bonus_days'],
        ],
        null
    );

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'ลบรายการเรียบร้อยแล้ว',
    ]);
}
