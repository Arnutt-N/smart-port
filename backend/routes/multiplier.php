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

function handleMultiplier(PDO $pdo, string $method, array $path): void
{
    // ทั้งฟีเจอร์ทวีคูณเป็นงาน HR/admin เท่านั้น — ไม่มี self-service ใน MVP
    // (JWT payload มีแค่ user_id/role ไม่มี personnel_id ผูกตัวตน จึงยัง scope ตาม record ไม่ได้)
    $user = requireAdmin();

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
                if (
                    ($path[1] ?? '') === 'areas'
                    && ctype_digit($path[2] ?? '')
                    && ($path[3] ?? '') === 'status'
                ) {
                    setMultiplierAreaStatus($pdo, (int) $path[2]);
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

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'multiplier_id' => intval($pdo->lastInsertId()),
        'computed' => $computed,
    ]);
}

function computeMultiplierFields(PDO $pdo, int $areaMultiplierId, string $startDateStr, string $endDateStr): array
{
    // ใช้ format ที่มี '|' ต่อท้าย เพื่อ reset เวลาเป็น 00:00:00 (ไม่งั้น createFromFormat
    // จะเติมเวลาปัจจุบัน ทำให้ diff กับวันที่จาก DB (00:00:00) คลาดเคลื่อน ±1 วัน)
    $startDate = DateTime::createFromFormat('Y-m-d|', $startDateStr);
    $endDate = DateTime::createFromFormat('Y-m-d|', $endDateStr);

    if (!$startDate || !$endDate) {
        throw new InvalidArgumentException('รูปแบบวันที่ไม่ถูกต้อง');
    }
    if ($endDate < $startDate) {
        throw new InvalidArgumentException('วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น');
    }

    $areaStmt = $pdo->prepare("
        SELECT *
        FROM special_area_multiplier
        WHERE area_multiplier_id = ? AND is_active = 1
        LIMIT 1
    ");
    $areaStmt->execute([$areaMultiplierId]);
    $area = $areaStmt->fetch(PDO::FETCH_ASSOC);
    if (!$area) {
        throw new InvalidArgumentException('ไม่พบพื้นที่ทวีคูณที่ใช้งานได้');
    }

    $effectiveStart = (new DateTime($area['effective_start_date']))->setTime(0, 0, 0);
    $effectiveEnd = $area['effective_end_date']
        ? (new DateTime($area['effective_end_date']))->setTime(0, 0, 0)
        : clone $endDate;

    $eligibleStart = maxDate($startDate, $effectiveStart);
    $eligibleEnd = minDate($endDate, $effectiveEnd);
    if ($eligibleEnd < $eligibleStart) {
        throw new InvalidArgumentException('ช่วงวันที่ปฏิบัติงานไม่ทับซ้อนกับช่วงที่นับทวีคูณได้');
    }

    $serviceDays = inclusiveDays($startDate, $endDate);
    $eligibleDays = inclusiveDays($eligibleStart, $eligibleEnd);
    $ratio = (float) $area['multiplier_ratio'];
    $effectiveDays = $eligibleDays * $ratio / 100;
    $bonusDays = $eligibleDays * ($ratio - 100) / 100;
    $flooredEffective = (int) floor($effectiveDays);

    $netYears = (int) floor($flooredEffective / 360);
    $netMonths = (int) floor(($flooredEffective % 360) / 30);
    $netDayRemainder = (int) (($flooredEffective % 360) % 30);

    $netEndDate = clone $eligibleStart;
    $netEndDate->modify('+' . max($flooredEffective - 1, 0) . ' days');

    return [
        'area_multiplier_id' => (int) $area['area_multiplier_id'],
        'province' => $area['province'],
        'district' => $area['district'],
        'basis_type' => $area['basis_type'],
        'eligible_start_date' => $eligibleStart->format('Y-m-d'),
        'eligible_end_date' => $eligibleEnd->format('Y-m-d'),
        'service_days' => $serviceDays,
        'eligible_days' => $eligibleDays,
        'multiplier_ratio' => $ratio,
        'effective_days' => $effectiveDays,
        'bonus_days' => $bonusDays,
        'net_end_date' => $netEndDate->format('Y-m-d'),
        'net_years' => $netYears,
        'net_months' => $netMonths,
        'net_day_remainder' => $netDayRemainder,
    ];
}

function decorateAreaRow(array &$row): void
{
    $row['area_multiplier_id'] = (int) $row['area_multiplier_id'];
    $row['multiplier_ratio'] = (float) $row['multiplier_ratio'];
    $row['is_active'] = (int) $row['is_active'];
    $row['effective_start_date_thai'] = formatThaiDate($row['effective_start_date']);
    $row['effective_end_date_thai'] = $row['effective_end_date'] ? formatThaiDate($row['effective_end_date']) : null;
    $row['area_label'] = $row['district']
        ? "{$row['province']} / {$row['district']}"
        : "{$row['province']} / ทั้งจังหวัด";
    $row['source_pending'] = str_contains((string) $row['legal_reference'], 'SOURCE_PENDING');
}

/**
 * ดึงพื้นที่ 1 แถว (รวมที่ปิดใช้งาน) พร้อม decorate — คืน null ถ้าไม่พบ
 */
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
    http_response_code(201);
    echo json_encode([
        'success' => true,
        'area_multiplier_id' => $areaId,
        'data' => fetchAreaRow($pdo, $areaId),
    ]);
}

function setMultiplierAreaStatus(PDO $pdo, int $areaId): void
{
    $data = json_decode(file_get_contents('php://input'), true);
    $isActive = is_array($data) ? ($data['is_active'] ?? null) : null;
    // รับเฉพาะ 0/1 (int หรือ string) — ค่าอื่นตอบ 400
    if (!in_array($isActive, [0, 1, '0', '1'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณาระบุ is_active เป็น 0 หรือ 1']);
        return;
    }

    // UPDATE ก่อนแล้วค่อยอ่านกลับ — idempotent โดยธรรมชาติ (ตั้งค่าเดิมซ้ำ = 200 ปกติ)
    $pdo->prepare('UPDATE special_area_multiplier SET is_active = ? WHERE area_multiplier_id = ?')
        ->execute([(int) $isActive, $areaId]);

    $row = fetchAreaRow($pdo, $areaId);
    if ($row === null) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบพื้นที่ตามรหัสที่ระบุ']);
        return;
    }

    echo json_encode(['success' => true, 'data' => $row]);
}

function decorateMultiplierRow(array &$row): void
{
    $intFields = [
        'multiplier_id',
        'personnel_id',
        'area_multiplier_id',
        'service_days',
        'eligible_days',
        'net_years',
        'net_months',
        'net_day_remainder',
    ];
    foreach ($intFields as $field) {
        if (isset($row[$field])) {
            $row[$field] = (int) $row[$field];
        }
    }

    foreach (['multiplier_ratio', 'effective_days', 'bonus_days'] as $field) {
        if (isset($row[$field])) {
            $row[$field] = (float) $row[$field];
        }
    }

    $row['area_label'] = $row['district']
        ? "{$row['province']} / {$row['district']}"
        : "{$row['province']} / ทั้งจังหวัด";
    $row['start_date_thai'] = formatThaiDate($row['start_date']);
    $row['end_date_thai'] = formatThaiDate($row['end_date']);
    $row['eligible_start_date_thai'] = formatThaiDate($row['eligible_start_date']);
    $row['eligible_end_date_thai'] = formatThaiDate($row['eligible_end_date']);
    $row['net_end_date_thai'] = formatThaiDate($row['net_end_date']);
}

function inclusiveDays(DateTime $startDate, DateTime $endDate): int
{
    return $endDate->diff($startDate)->days + 1;
}

function maxDate(DateTime $a, DateTime $b): DateTime
{
    return $a > $b ? clone $a : clone $b;
}

function minDate(DateTime $a, DateTime $b): DateTime
{
    return $a < $b ? clone $a : clone $b;
}

/**
 * ตรวจ + normalize input สำหรับเพิ่มพื้นที่ทวีคูณ (pure function — unit-testable)
 * ratio ต้องอยู่ใน [100, 999.99] (เพดาน DECIMAL(5,2)); วันที่ต้องเป็น Y-m-d จริง
 * (เช็ค warning ของ createFromFormat กัน overflow เช่น '2004-13-45')
 *
 * @return array{error: ?string, values: ?array}
 */
function validateAreaInput(array $data): array
{
    $province = trim((string) ($data['province'] ?? ''));
    if ($province === '') {
        return ['error' => 'กรุณาระบุ province', 'values' => null];
    }

    $basisType = trim((string) ($data['basis_type'] ?? ''));
    if ($basisType === '') {
        return ['error' => 'กรุณาระบุ basis_type', 'values' => null];
    }

    $ratioRaw = $data['multiplier_ratio'] ?? null;
    if (!is_numeric($ratioRaw)) {
        return ['error' => 'กรุณาระบุ multiplier_ratio เป็นตัวเลข', 'values' => null];
    }
    $ratio = (float) $ratioRaw;
    if ($ratio < 100.0 || $ratio > 999.99) {
        return ['error' => 'multiplier_ratio ต้องอยู่ระหว่าง 100 ถึง 999.99', 'values' => null];
    }

    $start = parseStrictDate((string) ($data['effective_start_date'] ?? ''));
    if ($start === null) {
        return ['error' => 'effective_start_date ต้องเป็นรูปแบบ YYYY-MM-DD', 'values' => null];
    }

    $end = null;
    $endRaw = trim((string) ($data['effective_end_date'] ?? ''));
    if ($endRaw !== '') {
        $end = parseStrictDate($endRaw);
        if ($end === null) {
            return ['error' => 'effective_end_date ต้องเป็นรูปแบบ YYYY-MM-DD', 'values' => null];
        }
        if ($end < $start) {
            return ['error' => 'effective_end_date ต้องไม่น้อยกว่า effective_start_date', 'values' => null];
        }
    }

    $legal = trim((string) ($data['legal_reference'] ?? ''));
    if (mb_strlen($legal) > 300) {
        return ['error' => 'legal_reference ยาวเกิน 300 ตัวอักษร', 'values' => null];
    }

    $source = trim((string) ($data['source_reference'] ?? ''));
    if (mb_strlen($source) > 500) {
        return ['error' => 'source_reference ยาวเกิน 500 ตัวอักษร', 'values' => null];
    }

    $district = trim((string) ($data['district'] ?? ''));

    return ['error' => null, 'values' => [
        'province' => $province,
        'district' => $district === '' ? null : $district,
        'basis_type' => $basisType,
        'multiplier_ratio' => $ratio,
        'effective_start_date' => $start->format('Y-m-d'),
        'effective_end_date' => $end?->format('Y-m-d'),
        'legal_reference' => $legal === '' ? null : $legal,
        'source_reference' => $source === '' ? null : $source,
    ]];
}

/**
 * parse Y-m-d แบบเข้มงวด — คืน null ถ้า format ผิดหรือมี overflow (เดือน 13, วัน 45)
 * ('Y-m-d|' reset เวลาเป็น 00:00:00 ตาม pattern เดิมใน computeMultiplierFields)
 */
function parseStrictDate(string $value): ?DateTime
{
    $date = DateTime::createFromFormat('Y-m-d|', $value);
    $errors = DateTime::getLastErrors();
    if (
        $date === false
        || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
    ) {
        return null;
    }
    return $date;
}
