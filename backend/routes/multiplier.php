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
                createMultiplier($pdo, $user);
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
