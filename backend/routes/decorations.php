<?php
// ============================================================================
// routes/decorations.php
// Royal Decorations Route Handler — เครื่องราชอิสริยาภรณ์ (ตาราง royal_decorations)
//
// Endpoints:
//   GET    /royal-decorations           — รายการ (search + pagination)
//   GET    /royal-decorations/{id}      — รายละเอียดรายการเดียว
//   POST   /royal-decorations           — เพิ่ม (admin เท่านั้น)
//   PUT    /royal-decorations/{id}      — แก้ไข (admin เท่านั้น)
//   DELETE /royal-decorations/{id}      — ลบ (admin เท่านั้น)
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../audit.php';

function handleDecorations(PDO $pdo, string $method, array $path): void
{
    $actionMap = ['GET' => 'read', 'POST' => 'create', 'PUT' => 'update', 'DELETE' => 'delete'];
    requirePermission($actionMap[$method] ?? 'read', 'royal_decorations');
    $auth = getAuthenticatedUser();

    switch ($method) {
        case 'GET':
            $id = $path[1] ?? null;
            if ($id !== null) {
                getDecorationDetail($pdo, intval($id));
            } else {
                getDecorationList($pdo);
            }
            break;

        case 'POST':
            createDecoration($pdo, $auth);
            break;

        case 'PUT':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID ของเครื่องราชอิสริยาภรณ์']);
                return;
            }
            updateDecoration($pdo, intval($id), $auth);
            break;

        case 'DELETE':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID ของเครื่องราชอิสริยาภรณ์']);
                return;
            }
            deleteDecoration($pdo, intval($id), $auth);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
}

const DECORATION_SELECT = "d.decoration_id, d.servant_id, d.decoration_name, d.decoration_class,
                           d.received_year, d.gazette_ref, d.description, d.created_at,
                           CONCAT(COALESCE(p.prefix_name_th, ''), cs.first_name, ' ', cs.last_name) AS servant_name";

function decorationBaseQuery(): string
{
    return "FROM royal_decorations d
            LEFT JOIN civil_servants cs ON d.servant_id = cs.servant_id
            LEFT JOIN prefixes p ON cs.prefix_id = p.prefix_id";
}

function getDecorationList(PDO $pdo): void
{
    $search = trim($_GET['search'] ?? '');
    $limit = max(1, min(intval($_GET['limit'] ?? 20), 200));
    $offset = max(0, intval($_GET['offset'] ?? 0));

    $where = '';
    $params = [];
    if ($search !== '') {
        $where = " WHERE (d.decoration_name LIKE ? OR cs.first_name LIKE ? OR cs.last_name LIKE ?)";
        $term = "%{$search}%";
        $params = [$term, $term, $term];
    }

    $sql = "SELECT " . DECORATION_SELECT . ' ' . decorationBaseQuery() . $where
        . " ORDER BY d.received_year DESC, d.decoration_id DESC LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countStmt = $pdo->prepare("SELECT COUNT(*) AS total " . decorationBaseQuery() . $where);
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

function getDecorationDetail(PDO $pdo, int $id): void
{
    $sql = "SELECT " . DECORATION_SELECT . ' ' . decorationBaseQuery() . " WHERE d.decoration_id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบเครื่องราชอิสริยาภรณ์']);
        return;
    }
    echo json_encode(['success' => true, 'data' => $row]);
}

function validateDecorationPayload(array $data, bool $requireCore): array
{
    if ($requireCore) {
        foreach (['servant_id', 'decoration_name'] as $field) {
            if (!isset($data[$field]) || $data[$field] === '') {
                return [null, "กรุณาระบุข้อมูล: {$field}"];
            }
        }
    }

    if (isset($data['received_year']) && $data['received_year'] !== '' && $data['received_year'] !== null) {
        $year = intval($data['received_year']);
        // ปี พ.ศ. — ช่วงที่สมเหตุสมผล
        if ($year < 2400 || $year > 2700) {
            return [null, 'ปีที่ได้รับ (พ.ศ.) ไม่ถูกต้อง'];
        }
    }

    return [$data, null];
}

function createDecoration(PDO $pdo, ?array $auth): void
{
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    [$valid, $error] = validateDecorationPayload($data, true);
    if ($error !== null) {
        http_response_code(400);
        echo json_encode(['error' => $error]);
        return;
    }

    $stmt = $pdo->prepare(
        "INSERT INTO royal_decorations (servant_id, decoration_name, decoration_class, received_year, gazette_ref, description)
         VALUES (?, ?, ?, ?, ?, ?)"
    );
    $stmt->execute([
        intval($valid['servant_id']),
        trim($valid['decoration_name']),
        ($valid['decoration_class'] ?? '') !== '' ? $valid['decoration_class'] : null,
        ($valid['received_year'] ?? '') !== '' ? intval($valid['received_year']) : null,
        ($valid['gazette_ref'] ?? '') !== '' ? $valid['gazette_ref'] : null,
        $valid['description'] ?? null,
    ]);

    $newId = intval($pdo->lastInsertId());
    logAudit($pdo, intval($auth['user_id']), 'CREATE', 'royal_decorations', $newId, null, [
        'servant_id' => intval($valid['servant_id']),
        'decoration_name' => trim($valid['decoration_name']),
    ]);

    http_response_code(201);
    echo json_encode(['success' => true, 'decoration_id' => $newId]);
}

function updateDecoration(PDO $pdo, int $id, ?array $auth): void
{
    $data = json_decode(file_get_contents('php://input'), true) ?: [];

    $stmt = $pdo->prepare("SELECT * FROM royal_decorations WHERE decoration_id = ?");
    $stmt->execute([$id]);
    $before = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$before) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบเครื่องราชอิสริยาภรณ์']);
        return;
    }

    [$valid, $error] = validateDecorationPayload($data, false);
    if ($error !== null) {
        http_response_code(400);
        echo json_encode(['error' => $error]);
        return;
    }

    $fields = [];
    $params = [];
    $editable = ['servant_id', 'decoration_name', 'decoration_class', 'received_year', 'gazette_ref', 'description'];
    foreach ($editable as $col) {
        if (array_key_exists($col, $valid)) {
            $fields[] = "{$col} = ?";
            $value = $valid[$col];
            if (in_array($col, ['decoration_class', 'received_year', 'gazette_ref'], true) && $value === '') {
                $value = null;
            }
            if ($col === 'servant_id') {
                $value = intval($value);
            }
            if ($col === 'received_year' && $value !== null) {
                $value = intval($value);
            }
            $params[] = $value;
        }
    }

    if ($fields === []) {
        echo json_encode(['success' => true, 'decoration_id' => $id, 'unchanged' => true]);
        return;
    }

    $params[] = $id;
    $pdo->prepare("UPDATE royal_decorations SET " . implode(', ', $fields) . " WHERE decoration_id = ?")->execute($params);

    logAudit($pdo, intval($auth['user_id']), 'UPDATE', 'royal_decorations', $id, $before, $valid);
    echo json_encode(['success' => true, 'decoration_id' => $id]);
}

function deleteDecoration(PDO $pdo, int $id, ?array $auth): void
{
    $stmt = $pdo->prepare("SELECT * FROM royal_decorations WHERE decoration_id = ?");
    $stmt->execute([$id]);
    $before = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$before) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบเครื่องราชอิสริยาภรณ์']);
        return;
    }

    $pdo->prepare("DELETE FROM royal_decorations WHERE decoration_id = ?")->execute([$id]);
    logAudit($pdo, intval($auth['user_id']), 'DELETE', 'royal_decorations', $id, $before, null);
    echo json_encode(['success' => true, 'decoration_id' => $id]);
}
