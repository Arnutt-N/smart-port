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
include_once __DIR__ . '/../TimeEntryCrud.php';

/** @var list<string> ฟิลด์วันที่ของ diverse ที่ต้องผ่าน strict parse เมื่อส่งมา */
const DIVERSE_DATE_FIELDS = ['from_start_date', 'from_end_date', 'to_start_date', 'to_end_date'];

/**
 * จัดการ request สำหรับ diverse experience endpoints
 *
 * @param PDO $pdo Database connection
 * @param string $method HTTP method
 * @param array $path URL path segments
 */
function handleDiverse(PDO $pdo, string $method, array $path): void
{
    $action = timeEntryAction($method);
    if ($action === null) {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    $user = resolveDiverseUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $denied = timeEntryDenied($action, 'diverse', $user, $pdo);
    if ($denied !== null) {
        timeEntryEmit(['http' => $denied['status'], 'body' => $denied['body']]);
        return;
    }
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
 * N23/N56: test hook — pattern เดียวกับ resolveImportUser (array_key_exists
 * เพื่อให้ฉีด null = unauthenticated ได้)
 */
function resolveDiverseUser(): ?array
{
    if (array_key_exists('__auth_user', $GLOBALS)) {
        $u = $GLOBALS['__auth_user'];
        return is_array($u) ? $u : null;
    }
    return getAuthenticatedUser();
}

/**
 * Route cfg สำหรับ TimeEntryCrud cores (list/detail ใช้ชุดเดียวกัน)
 */
function diverseTimeEntryCfg(): array
{
    return [
        'table' => 'diverse_experience',
        'alias' => 'de',
        'idCol' => 'de.experience_id',
        'joins' => ' LEFT JOIN personnel p ON de.personnel_id = p.personnel_id
                  LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id',
        'selectExtra' => sqlPersonnelFullName() . ' AS full_name',
        'searchSql' => [
            'p.first_name LIKE ?',
            'p.last_name LIKE ?',
            '(' . sqlPersonnelFullName() . ') LIKE ?',
            'de.from_job_series LIKE ?',
            'de.to_job_series LIKE ?',
            'de.from_division LIKE ?',
            'de.to_division LIKE ?',
        ],
        'orderBy' => 'de.created_at DESC',
        'summarySql' => '
            SELECT COUNT(DISTINCT personnel_id) AS distinct_personnel,
                   SUM(CASE WHEN diff_count >= 3 THEN 1 ELSE 0 END) AS qualified_count
            FROM diverse_experience
        ',
        'summaryMap' => function (array $summaryRow, int $total): array {
            return [
                'total' => $total,
                'distinct_personnel' => (int) ($summaryRow['distinct_personnel'] ?? 0),
                'qualified_count' => (int) ($summaryRow['qualified_count'] ?? 0),
            ];
        },
        'dateFields' => ['from_start_date', 'from_end_date', 'to_start_date', 'to_end_date', 'qualified_date'],
    ];
}

/**
 * GET /diverse — รายการนับแตกต่างทั้งหมด พร้อม pagination
 * สามารถกรองตาม personnel_id และค้นหาด้วย search (ชื่อ-สกุล หรือ สายงาน/กอง ต้นทาง-ปลายทาง)
 */
function getDiverseList(PDO $pdo): void
{
    timeEntryEmit(timeEntryList($pdo, diverseTimeEntryCfg()));
}

/**
 * GET /diverse/{id} — รายละเอียดรายการนับแตกต่าง
 */
function getDiverseDetail(PDO $pdo, int $id): void
{
    timeEntryEmit(timeEntryDetail($pdo, diverseTimeEntryCfg(), $id, 'ไม่พบรายการนับแตกต่าง'));
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

    // U1: ตรวจวันรายฟิลด์ก่อน (กัน single-sided ผิด format หลุดไป bind ดิบ)
    $dateError = dateFieldError($data, DIVERSE_DATE_FIELDS);
    if ($dateError !== null) {
        http_response_code(400);
        echo json_encode(['error' => $dateError]);
        return;
    }

    // R7: '' = ไม่ส่งมา (กัน bind '' ดิบลง DATE) — normalize เป็น null ก่อนใช้ต่อ
    foreach (DIVERSE_DATE_FIELDS as $dateField) {
        if (array_key_exists($dateField, $data) && $data[$dateField] === '') {
            $data[$dateField] = null;
        }
    }

    $fromTotalDays = null;
    if (!empty($data['from_start_date']) && !empty($data['from_end_date'])) {
        $fromStart = strictDate((string) $data['from_start_date']);
        $fromEnd = strictDate((string) $data['from_end_date']);
        if ($fromStart === null || $fromEnd === null) {
            http_response_code(400);
            echo json_encode(['error' => 'รูปแบบวันที่ไม่ถูกต้อง']);
            return;
        }
        if ($fromEnd < $fromStart) {
            http_response_code(400);
            echo json_encode(['error' => 'วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น']);
            return;
        }
        $fromTotalDays = $fromEnd->diff($fromStart)->days + 1;
    }

    $toTotalDays = null;
    if (!empty($data['to_start_date']) && !empty($data['to_end_date'])) {
        $toStart = strictDate((string) $data['to_start_date']);
        $toEnd = strictDate((string) $data['to_end_date']);
        if ($toStart === null || $toEnd === null) {
            http_response_code(400);
            echo json_encode(['error' => 'รูปแบบวันที่ไม่ถูกต้อง']);
            return;
        }
        if ($toEnd < $toStart) {
            http_response_code(400);
            echo json_encode(['error' => 'วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น']);
            return;
        }
        $toTotalDays = $toEnd->diff($toStart)->days + 1;
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
    $sql = 'INSERT INTO diverse_experience (
                personnel_id, from_job_series, from_work_group, from_division,
                from_org_id, from_province, from_start_date, from_end_date, from_total_days,
                to_job_series, to_work_group, to_division,
                to_org_id, to_province, to_start_date, to_end_date, to_total_days,
                is_diff_job_series, is_diff_org, is_diff_location, is_diff_work_nature,
                qualified_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        $personnelId,
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

    timeEntryWriteAudit(
        $pdo,
        (int) $user['user_id'],
        'CREATE',
        'diverse_experience',
        $experienceId,
        null,
        $after ?: null
    );

    timeEntryEmit(['http' => 201, 'body' => ['success' => true, 'experience_id' => $experienceId]]);
}

/**
 * PUT /diverse/{id} — อัปเดตรายการนับแตกต่าง
 * diff_count ไม่อยู่ใน allowed fields (GENERATED column)
 * หลังอัปเดต recompute from_total_days, to_total_days, qualified_date
 */
function updateDiverse(PDO $pdo, int $id, array $user, ?array $input = null): void
{
    // ตรวจสอบว่า record มีอยู่จริง
    $checkStmt = $pdo->prepare('SELECT * FROM diverse_experience WHERE experience_id = ?');
    $checkStmt->execute([$id]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรายการนับแตกต่าง']);
        return;
    }

    $data = $input ?? json_decode(file_get_contents('php://input'), true);

    // U1: ตรวจวันรายฟิลด์ที่ส่งมาก่อน (เฉพาะค่าที่ส่งมา ไม่แตะค่าจาก DB)
    $dateError = dateFieldError($data, DIVERSE_DATE_FIELDS);
    if ($dateError !== null) {
        http_response_code(400);
        echo json_encode(['error' => $dateError]);
        return;
    }

    // R7: ล้างวันที่ด้วย '' = NULL (กัน bind '' ดิบลง DATE → 500 บน MySQL strict)
    // pattern เดียวกับ awards/decorations ที่แปลง '' เป็น null ใน update
    foreach (DIVERSE_DATE_FIELDS as $dateField) {
        if (array_key_exists($dateField, $data) && $data[$dateField] === '') {
            $data[$dateField] = null;
        }
    }

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
        $fromStart = strictDate((string) $fromStartDate);
        $fromEnd = strictDate((string) $fromEndDate);
        if ($fromStart === null || $fromEnd === null) {
            http_response_code(400);
            echo json_encode(['error' => 'รูปแบบวันที่ไม่ถูกต้อง']);
            return;
        }
        if ($fromEnd < $fromStart) {
            http_response_code(400);
            echo json_encode(['error' => 'วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น']);
            return;
        }
        $fromTotalDays = $fromEnd->diff($fromStart)->days + 1;
    } else {
        $fromTotalDays = null;
    }
    $sets[] = 'from_total_days = ?';
    $params[] = $fromTotalDays;

    // Recompute to_total_days
    $toStartDate = $data['to_start_date'] ?? $existing['to_start_date'];
    $toEndDate = $data['to_end_date'] ?? $existing['to_end_date'];
    if (!empty($toStartDate) && !empty($toEndDate)) {
        $toStart = strictDate((string) $toStartDate);
        $toEnd = strictDate((string) $toEndDate);
        if ($toStart === null || $toEnd === null) {
            http_response_code(400);
            echo json_encode(['error' => 'รูปแบบวันที่ไม่ถูกต้อง']);
            return;
        }
        if ($toEnd < $toStart) {
            http_response_code(400);
            echo json_encode(['error' => 'วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น']);
            return;
        }
        $toTotalDays = $toEnd->diff($toStart)->days + 1;
    } else {
        $toTotalDays = null;
    }
    $sets[] = 'to_total_days = ?';
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
    $sets[] = 'qualified_date = ?';
    $params[] = $qualifiedDate;

    $params[] = $id;
    $sql = 'UPDATE diverse_experience SET ' . implode(', ', $sets) . ' WHERE experience_id = ?';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $afterStmt = $pdo->prepare('SELECT * FROM diverse_experience WHERE experience_id = ?');
    $afterStmt->execute([$id]);
    $after = $afterStmt->fetch(PDO::FETCH_ASSOC);
    timeEntryWriteAudit(
        $pdo,
        (int) $user['user_id'],
        'UPDATE',
        'diverse_experience',
        $id,
        $existing,
        $after ?: null
    );

    timeEntryEmit(['http' => 200, 'body' => ['success' => true]]);
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

    $stmt = $pdo->prepare('DELETE FROM diverse_experience WHERE experience_id = ?');
    $stmt->execute([$id]);

    timeEntryWriteAudit(
        $pdo,
        (int) $user['user_id'],
        'DELETE',
        'diverse_experience',
        $id,
        $before,
        null
    );

    timeEntryEmit(['http' => 200, 'body' => ['success' => true]]);
}
