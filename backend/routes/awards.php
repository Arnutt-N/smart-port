<?php
// ============================================================================
// routes/awards.php
// Awards Route Handler — รางวัล/ความดีความชอบ (ตาราง awards)
//
// Endpoints:
//   GET    /awards                — รายการรางวัล (search + pagination)
//   GET    /awards/{id}           — รายละเอียดรางวัลรายการเดียว
//   POST   /awards                — เพิ่มรางวัล (admin เท่านั้น)
//   PUT    /awards/{id}           — แก้ไขรางวัล (admin เท่านั้น)
//   DELETE /awards/{id}           — ลบรางวัล (admin เท่านั้น)
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../audit.php';

const AWARD_VALID_TYPES = ['general', 'performance', 'service', 'honor', 'innovation'];
const AWARD_VALID_LEVELS = ['department', 'ministry', 'national', 'international'];

function handleAwards(PDO $pdo, string $method, array $path): void
{
    $actionMap = ['GET' => 'read', 'POST' => 'create', 'PUT' => 'update', 'DELETE' => 'delete'];
    requirePermission($actionMap[$method] ?? 'read', 'awards');
    $auth = getAuthenticatedUser();

    switch ($method) {
        case 'GET':
            $id = $path[1] ?? null;
            if ($id !== null) {
                getAwardDetail($pdo, intval($id));
            } else {
                getAwardList($pdo);
            }
            break;

        case 'POST':
            createAward($pdo, $auth);
            break;

        case 'PUT':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID ของรางวัล']);
                return;
            }
            updateAward($pdo, intval($id), $auth);
            break;

        case 'DELETE':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID ของรางวัล']);
                return;
            }
            deleteAward($pdo, intval($id), $auth);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
}

function awardSelectSql(): string
{
    return "a.award_id, a.personnel_id, a.award_name, a.award_type,
            a.award_level, a.awarded_date, a.description, a.created_at, "
            . sqlPersonnelFullName() . " AS personnel_name";
}

function awardBaseQuery(): string
{
    return "FROM awards a
            LEFT JOIN personnel p ON a.personnel_id = p.personnel_id
            LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id";
}

function getAwardList(PDO $pdo): void
{
    $search = trim($_GET['search'] ?? '');
    $limit = max(1, min(intval($_GET['limit'] ?? 20), 200));
    $offset = max(0, intval($_GET['offset'] ?? 0));

    $where = '';
    $params = [];
    if ($search !== '') {
        $where = " WHERE (a.award_name LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?)";
        $term = "%{$search}%";
        $params = [$term, $term, $term];
    }

    $sql = "SELECT " . awardSelectSql() . ' ' . awardBaseQuery() . $where
        . " ORDER BY a.awarded_date DESC, a.award_id DESC LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countStmt = $pdo->prepare("SELECT COUNT(*) AS total " . awardBaseQuery() . $where);
    $countStmt->execute($params);
    $total = intval($countStmt->fetch(PDO::FETCH_ASSOC)['total']);

    echo json_encode([
        'success' => true,
        'data' => $rows,
        'pagination' => [
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => ($offset + $limit) < $total,
        ],
    ]);
}

function getAwardDetail(PDO $pdo, int $id): void
{
    $sql = "SELECT " . awardSelectSql() . ' ' . awardBaseQuery() . " WHERE a.award_id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรางวัล']);
        return;
    }
    echo json_encode(['success' => true, 'data' => $row]);
}

/**
 * @return array{0: array<string,mixed>|null, 1: string|null} ค่าที่ validate แล้ว + error
 */
function validateAwardPayload(array $data, bool $requireCore): array
{
    if ($requireCore) {
        foreach (['personnel_id', 'award_name'] as $field) {
            if (!isset($data[$field]) || $data[$field] === '') {
                return [null, "กรุณาระบุข้อมูล: {$field}"];
            }
        }
    }

    if (isset($data['award_type']) && !in_array($data['award_type'], AWARD_VALID_TYPES, true)) {
        return [null, 'ประเภทรางวัลไม่ถูกต้อง'];
    }
    if (isset($data['award_level']) && $data['award_level'] !== '' && !in_array($data['award_level'], AWARD_VALID_LEVELS, true)) {
        return [null, 'ระดับรางวัลไม่ถูกต้อง'];
    }

    if (array_key_exists('awarded_date', $data) && $data['awarded_date'] !== '' && $data['awarded_date'] !== null) {
        if (!is_string($data['awarded_date']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $data['awarded_date'])) {
            return [null, 'รูปแบบวันที่ไม่ถูกต้อง'];
        }
        $parsed = DateTime::createFromFormat('Y-m-d|', $data['awarded_date']);
        $errors = DateTime::getLastErrors();
        if (
            $parsed === false
            || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
        ) {
            return [null, 'รูปแบบวันที่ไม่ถูกต้อง'];
        }
    }

    return [$data, null];
}

function createAward(PDO $pdo, ?array $auth): void
{
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    [$valid, $error] = validateAwardPayload($data, true);
    if ($error !== null) {
        http_response_code(400);
        echo json_encode(['error' => $error]);
        return;
    }

    $personnelId = intval($valid['personnel_id']);
    if (!personnelExists($pdo, $personnelId)) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบบุคลากรตามรหัสที่ระบุ']);
        return;
    }

    $stmt = $pdo->prepare(
        "INSERT INTO awards (personnel_id, award_name, award_type, award_level, awarded_date, description)
         VALUES (?, ?, ?, ?, ?, ?)"
    );
    $stmt->execute([
        $personnelId,
        trim($valid['award_name']),
        $valid['award_type'] ?? 'general',
        ($valid['award_level'] ?? '') !== '' ? $valid['award_level'] : null,
        ($valid['awarded_date'] ?? '') !== '' ? $valid['awarded_date'] : null,
        $valid['description'] ?? null,
    ]);

    $newId = intval($pdo->lastInsertId());
    logAudit($pdo, intval($auth['user_id']), 'CREATE', 'awards', $newId, null, [
        'personnel_id' => intval($valid['personnel_id']),
        'award_name' => trim($valid['award_name']),
        'award_type' => $valid['award_type'] ?? 'general',
    ]);

    http_response_code(201);
    echo json_encode(['success' => true, 'award_id' => $newId]);
}

function updateAward(PDO $pdo, int $id, ?array $auth): void
{
    $data = json_decode(file_get_contents('php://input'), true) ?: [];

    $stmt = $pdo->prepare("SELECT * FROM awards WHERE award_id = ?");
    $stmt->execute([$id]);
    $before = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$before) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรางวัล']);
        return;
    }

    [$valid, $error] = validateAwardPayload($data, false);
    if ($error !== null) {
        http_response_code(400);
        echo json_encode(['error' => $error]);
        return;
    }

    $fields = [];
    $params = [];
    $editable = ['personnel_id', 'award_name', 'award_type', 'award_level', 'awarded_date', 'description'];
    foreach ($editable as $col) {
        if (array_key_exists($col, $valid)) {
            $fields[] = "{$col} = ?";
            $value = $valid[$col];
            if (in_array($col, ['award_level', 'awarded_date'], true) && $value === '') {
                $value = null;
            }
            if ($col === 'personnel_id') {
                $value = intval($value);
                if (!personnelExists($pdo, $value)) {
                    http_response_code(404);
                    echo json_encode(['error' => 'ไม่พบบุคลากรตามรหัสที่ระบุ']);
                    return;
                }
            }
            $params[] = $value;
        }
    }

    if ($fields === []) {
        echo json_encode(['success' => true, 'award_id' => $id, 'unchanged' => true]);
        return;
    }

    $params[] = $id;
    $pdo->prepare("UPDATE awards SET " . implode(', ', $fields) . " WHERE award_id = ?")->execute($params);

    logAudit($pdo, intval($auth['user_id']), 'UPDATE', 'awards', $id, $before, $valid);
    echo json_encode(['success' => true, 'award_id' => $id]);
}

function deleteAward(PDO $pdo, int $id, ?array $auth): void
{
    $stmt = $pdo->prepare("SELECT * FROM awards WHERE award_id = ?");
    $stmt->execute([$id]);
    $before = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$before) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบรางวัล']);
        return;
    }

    $pdo->prepare("DELETE FROM awards WHERE award_id = ?")->execute([$id]);
    logAudit($pdo, intval($auth['user_id']), 'DELETE', 'awards', $id, $before, null);
    echo json_encode(['success' => true, 'award_id' => $id]);
}
