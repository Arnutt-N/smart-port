<?php
// ============================================================================
// routes/personnel.php
// Personnel typeahead + master CRUD (ข้อมูลบุคลากร)
//
// Endpoints:
//   GET  /personnel?search=&limit=              — typeahead (ไม่มี offset)
//   GET  /personnel?offset=&limit=&search=      — รายการมาสเตอร์ + pagination
//   GET  /personnel/lookups                     — คำนำหน้าสำหรับฟอร์ม
//   GET  /personnel/{id}                        — รายละเอียดคนหนึ่ง
//   POST /personnel                             — สร้าง (admin+)
//   PUT  /personnel/{id}                        — แก้ไข / ปิด·เปิดใช้งาน (admin+)
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../audit.php';

/**
 * SQL สำหรับ typeahead บุคลากร — LIMIT เป็นตัวเลขที่ clamp แล้ว (ห้าม bind เป็น ?)
 * เพราะ PDO ATTR_EMULATE_PREPARES=false ทำให้ LIMIT ? พังบน MySQL/TiDB
 *
 * @return string SELECT … LIMIT N (ยังไม่รวม bind ของ search term)
 */
function personnelTypeaheadSql(int $limit = 10): string
{
    $limit = max(1, min(50, $limit));
    $fullName = sqlPersonnelFullName('p', 'px');

    return "
        SELECT p.personnel_id, p.citizen_id,
               {$fullName} AS full_name,
               p.first_name, p.last_name,
               pos.position_name AS current_position,
               o.org_name AS department
        FROM personnel p
        LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
        LEFT JOIN `position` pos ON p.current_position_id = pos.position_id
        LEFT JOIN organization o ON p.current_org_id = o.org_id
        WHERE p.is_active = 1
          AND (
                p.first_name LIKE ?
             OR p.last_name LIKE ?
             OR p.citizen_id LIKE ?
             OR p.employee_id LIKE ?
             OR {$fullName} LIKE ?
          )
        ORDER BY p.first_name, p.last_name
        LIMIT {$limit}
    ";
}

/**
 * ค้นหาบุคลากรสำหรับ typeahead
 *
 * @return list<array<string, mixed>>
 */
function searchPersonnelTypeahead(PDO $pdo, string $search, int $limit = 10): array
{
    $q = trim($search);
    // ให้สอดคล้องกับ FE typeahead (อย่างน้อย 2 ตัวอักษร)
    if (mb_strlen($q) < 2) {
        return [];
    }

    $term = "%{$q}%";
    $stmt = $pdo->prepare(personnelTypeaheadSql($limit));
    $stmt->execute([$term, $term, $term, $term, $term]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * SELECT columns สำหรับมาสเตอร์รายการ/รายคน
 */
function personnelMasterSelectSql(): string
{
    $fullName = sqlPersonnelFullName('p', 'px');
    return "
        SELECT p.personnel_id, p.citizen_id, p.employee_id,
               p.prefix_id, p.first_name, p.last_name,
               {$fullName} AS full_name,
               p.is_active,
               pos.position_name AS current_position,
               o.org_name AS department,
               px.prefix_name_th
        FROM personnel p
        LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
        LEFT JOIN `position` pos ON p.current_position_id = pos.position_id
        LEFT JOIN organization o ON p.current_org_id = o.org_id
    ";
}

/**
 * รายการมาสเตอร์บุคลากร (pagination)
 *
 * @return array{data: list<array<string,mixed>>, pagination: array<string,mixed>}
 */
function listPersonnelMaster(
    PDO $pdo,
    string $search = '',
    int $limit = 20,
    int $offset = 0,
    bool $includeInactive = false
): array {
    $limit = max(1, min(200, $limit));
    $offset = max(0, $offset);
    $fullName = sqlPersonnelFullName('p', 'px');

    $where = [];
    $params = [];

    if (!$includeInactive) {
        $where[] = 'p.is_active = 1';
    }

    $q = trim($search);
    if ($q !== '') {
        $where[] = '(
            p.first_name LIKE ?
            OR p.last_name LIKE ?
            OR p.citizen_id LIKE ?
            OR p.employee_id LIKE ?
            OR ' . $fullName . ' LIKE ?
        )';
        $term = "%{$q}%";
        $params = [$term, $term, $term, $term, $term];
    }

    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

    $countSql = "
        SELECT COUNT(*)
        FROM personnel p
        LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
        {$whereSql}
    ";
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    $listSql = personnelMasterSelectSql()
        . " {$whereSql} ORDER BY p.first_name, p.last_name, p.personnel_id"
        . " LIMIT {$limit} OFFSET {$offset}";
    $listStmt = $pdo->prepare($listSql);
    $listStmt->execute($params);
    $rows = $listStmt->fetchAll(PDO::FETCH_ASSOC);

    return [
        'data' => $rows,
        'pagination' => [
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => ($offset + $limit) < $total,
        ],
    ];
}

/**
 * @return array<string, mixed>|null
 */
function getPersonnelById(PDO $pdo, int $id): ?array
{
    if ($id <= 0) {
        return null;
    }
    $stmt = $pdo->prepare(personnelMasterSelectSql() . ' WHERE p.personnel_id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/**
 * @return list<array{prefix_id: int|string, prefix_name_th: string, prefix_code: string}>
 */
function getPersonnelLookups(PDO $pdo): array
{
    $stmt = $pdo->query(
        'SELECT prefix_id, prefix_code, prefix_name_th
         FROM prefixes
         WHERE is_active = 1
         ORDER BY prefix_name_th, prefix_id'
    );
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function isValidCitizenId(string $citizenId): bool
{
    return (bool) preg_match('/^\d{13}$/', $citizenId);
}

function personnelPrefixExists(PDO $pdo, int $prefixId): bool
{
    if ($prefixId <= 0) {
        return false;
    }
    $stmt = $pdo->prepare('SELECT 1 FROM prefixes WHERE prefix_id = ? AND is_active = 1 LIMIT 1');
    $stmt->execute([$prefixId]);
    return (bool) $stmt->fetchColumn();
}

/**
 * สร้างบุคลากร — คืน personnel_id หรือเขียน error response แล้วคืน null
 *
 * @param array<string, mixed>|null $input
 */
function createPersonnelRecord(PDO $pdo, array $auth, ?array $input = null): ?int
{
    $data = $input ?? json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'รูปแบบข้อมูลไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE);
        return null;
    }

    $firstName = trim((string) ($data['first_name'] ?? ''));
    $lastName = trim((string) ($data['last_name'] ?? ''));
    $citizenId = trim((string) ($data['citizen_id'] ?? ''));
    $employeeIdRaw = trim((string) ($data['employee_id'] ?? ''));
    $employeeId = $employeeIdRaw === '' ? null : $employeeIdRaw;
    $prefixId = isset($data['prefix_id']) && $data['prefix_id'] !== '' && $data['prefix_id'] !== null
        ? (int) $data['prefix_id']
        : null;

    if ($firstName === '' || $lastName === '') {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณาระบุชื่อและนามสกุล'], JSON_UNESCAPED_UNICODE);
        return null;
    }
    if (!isValidCitizenId($citizenId)) {
        http_response_code(400);
        echo json_encode(['error' => 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก'], JSON_UNESCAPED_UNICODE);
        return null;
    }
    if ($prefixId !== null && $prefixId <= 0) {
        $prefixId = null;
    }
    if ($prefixId !== null && !personnelPrefixExists($pdo, $prefixId)) {
        http_response_code(400);
        echo json_encode(['error' => 'คำนำหน้าไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE);
        return null;
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO personnel (citizen_id, first_name, last_name, prefix_id, employee_id, is_active)
             VALUES (?, ?, ?, ?, ?, 1)'
        );
        $stmt->execute([$citizenId, $firstName, $lastName, $prefixId, $employeeId]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            http_response_code(409);
            $msg = str_contains($e->getMessage(), 'employee_id')
                ? 'รหัสพนักงานนี้ถูกใช้งานแล้ว'
                : 'เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว';
            echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
            return null;
        }
        throw $e;
    }

    $newId = (int) $pdo->lastInsertId();
    logAudit(
        $pdo,
        (int) ($auth['user_id'] ?? 0),
        'CREATE',
        'personnel',
        $newId,
        null,
        [
            // ไม่ใส่ citizen_id ใน audit (PII) — เก็บเฉพาะรหัส record + ชื่อ
            'first_name' => $firstName,
            'last_name' => $lastName,
            'prefix_id' => $prefixId,
            'employee_id' => $employeeId,
        ]
    );

    return $newId;
}

/**
 * แก้ไขบุคลากร — คืน true เมื่อสำเร็จ; เขียน error แล้วคืน false เมื่อล้มเหลว
 *
 * @param array<string, mixed>|null $input
 */
function updatePersonnelRecord(PDO $pdo, int $id, array $auth, ?array $input = null): bool
{
    $data = $input ?? json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'รูปแบบข้อมูลไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE);
        return false;
    }

    if (array_key_exists('citizen_id', $data)) {
        http_response_code(400);
        echo json_encode(
            ['error' => 'ไม่สามารถแก้ไขเลขบัตรประชาชนได้ — หากผิดให้ปิดใช้งานแล้วสร้างใหม่'],
            JSON_UNESCAPED_UNICODE
        );
        return false;
    }

    $before = getPersonnelById($pdo, $id);
    if ($before === null) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบบุคลากร'], JSON_UNESCAPED_UNICODE);
        return false;
    }

    $sets = [];
    $params = [];

    if (array_key_exists('first_name', $data)) {
        $firstName = trim((string) $data['first_name']);
        if ($firstName === '') {
            http_response_code(400);
            echo json_encode(['error' => 'ชื่อต้องไม่ว่าง'], JSON_UNESCAPED_UNICODE);
            return false;
        }
        $sets[] = 'first_name = ?';
        $params[] = $firstName;
    }
    if (array_key_exists('last_name', $data)) {
        $lastName = trim((string) $data['last_name']);
        if ($lastName === '') {
            http_response_code(400);
            echo json_encode(['error' => 'นามสกุลต้องไม่ว่าง'], JSON_UNESCAPED_UNICODE);
            return false;
        }
        $sets[] = 'last_name = ?';
        $params[] = $lastName;
    }
    if (array_key_exists('prefix_id', $data)) {
        $prefixId = $data['prefix_id'];
        if ($prefixId === '' || $prefixId === null) {
            $sets[] = 'prefix_id = NULL';
        } else {
            $prefixId = (int) $prefixId;
            if (!personnelPrefixExists($pdo, $prefixId)) {
                http_response_code(400);
                echo json_encode(['error' => 'คำนำหน้าไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE);
                return false;
            }
            $sets[] = 'prefix_id = ?';
            $params[] = $prefixId;
        }
    }
    if (array_key_exists('employee_id', $data)) {
        $employeeIdRaw = trim((string) ($data['employee_id'] ?? ''));
        if ($employeeIdRaw === '') {
            $sets[] = 'employee_id = NULL';
        } else {
            $sets[] = 'employee_id = ?';
            $params[] = $employeeIdRaw;
        }
    }
    if (array_key_exists('is_active', $data)) {
        $sets[] = 'is_active = ?';
        $params[] = (int) (bool) $data['is_active'];
    }

    if ($sets === []) {
        http_response_code(400);
        echo json_encode(['error' => 'ไม่มีข้อมูลที่จะอัปเดต'], JSON_UNESCAPED_UNICODE);
        return false;
    }

    $params[] = $id;
    try {
        $sql = 'UPDATE personnel SET ' . implode(', ', $sets) . ' WHERE personnel_id = ?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            http_response_code(409);
            echo json_encode(['error' => 'รหัสพนักงานนี้ถูกใช้งานแล้ว'], JSON_UNESCAPED_UNICODE);
            return false;
        }
        throw $e;
    }

    $after = getPersonnelById($pdo, $id);
    logAudit(
        $pdo,
        (int) ($auth['user_id'] ?? 0),
        'UPDATE',
        'personnel',
        $id,
        [
            'first_name' => $before['first_name'],
            'last_name' => $before['last_name'],
            'prefix_id' => $before['prefix_id'],
            'employee_id' => $before['employee_id'],
            'is_active' => $before['is_active'],
        ],
        [
            'first_name' => $after['first_name'] ?? null,
            'last_name' => $after['last_name'] ?? null,
            'prefix_id' => $after['prefix_id'] ?? null,
            'employee_id' => $after['employee_id'] ?? null,
            'is_active' => $after['is_active'] ?? null,
        ]
    );

    return true;
}

/**
 * @param PDO $pdo
 * @param string $method
 * @param array<int, string> $path
 */
function handlePersonnel(PDO $pdo, string $method, array $path): void
{
    $actionMap = ['GET' => 'read', 'POST' => 'create', 'PUT' => 'update'];
    if (!isset($actionMap[$method])) {
        respondMethodNotAllowed();
        return;
    }
    requirePermission($actionMap[$method], 'personnel');

    $sub = $path[1] ?? null;

    if ($method === 'GET') {
        if ($sub === 'lookups') {
            echo json_encode([
                'success' => true,
                'data' => ['prefixes' => getPersonnelLookups($pdo)],
            ], JSON_UNESCAPED_UNICODE);
            return;
        }

        if ($sub !== null && $sub !== '') {
            $id = (int) $sub;
            $row = getPersonnelById($pdo, $id);
            if ($row === null) {
                http_response_code(404);
                echo json_encode(['error' => 'ไม่พบบุคลากร'], JSON_UNESCAPED_UNICODE);
                return;
            }
            echo json_encode(['success' => true, 'data' => $row], JSON_UNESCAPED_UNICODE);
            return;
        }

        // Master list when offset is present; otherwise typeahead (backward compatible)
        if (array_key_exists('offset', $_GET)) {
            $includeInactive = isset($_GET['include_inactive']) && (string) $_GET['include_inactive'] !== '0';
            if ($includeInactive) {
                $role = getAuthenticatedUser()['role'] ?? '';
                if ($role !== 'admin' && $role !== 'superadmin') {
                    // แผน: โชว์คนปิดใช้งานเฉพาะแอดมิน — กัน operator/viewer ดึงรายการปิดใช้งานผ่าน query
                    $includeInactive = false;
                }
            }
            $result = listPersonnelMaster(
                $pdo,
                (string) ($_GET['search'] ?? ''),
                intval($_GET['limit'] ?? 20),
                intval($_GET['offset'] ?? 0),
                $includeInactive
            );
            echo json_encode([
                'success' => true,
                'data' => $result['data'],
                'pagination' => $result['pagination'],
            ], JSON_UNESCAPED_UNICODE);
            return;
        }

        $search = (string) ($_GET['search'] ?? '');
        $limit = intval($_GET['limit'] ?? 10);
        $rows = searchPersonnelTypeahead($pdo, $search, $limit);
        echo json_encode(['success' => true, 'data' => $rows], JSON_UNESCAPED_UNICODE);
        return;
    }

    if ($method === 'POST') {
        if ($sub !== null && $sub !== '') {
            http_response_code(404);
            echo json_encode(['error' => 'Not found'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $auth = getAuthenticatedUser();
        $newId = createPersonnelRecord($pdo, $auth ?? []);
        if ($newId === null) {
            return;
        }
        http_response_code(201);
        echo json_encode(['success' => true, 'personnel_id' => $newId], JSON_UNESCAPED_UNICODE);
        return;
    }

    // PUT
    if ($sub === null || $sub === '') {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณาระบุรหัสบุคลากร'], JSON_UNESCAPED_UNICODE);
        return;
    }
    $auth = getAuthenticatedUser();
    $ok = updatePersonnelRecord($pdo, (int) $sub, $auth ?? []);
    if (!$ok) {
        return;
    }
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
}
