<?php
// ============================================================================
// routes/users.php
// User Management Route Handler — จัดการบัญชีผู้ใช้ (admin เท่านั้น)
//
// Endpoints:
//   GET  /users          — รายชื่อผู้ใช้ (pagination + search)
//   POST /users          — สร้างผู้ใช้ใหม่
//   PUT  /users/{id}     — แก้ไขข้อมูล / reset password / ปิดบัญชี (is_active=0)
//
// ไม่มี DELETE — ปิดบัญชีด้วย is_active=0 เพื่อรักษา FK approved_by และ audit trail
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../audit.php';

const PASSWORD_MIN_LENGTH = 8;
const VALID_ROLES = ['admin', 'operator'];

// คอลัมน์ที่ส่งออกได้ — ห้ามมี password_hash เด็ดขาด
const USER_PUBLIC_COLUMNS = 'user_id, username, full_name, email, role, is_active, must_change_password, last_login_at, created_at';

/**
 * จัดการ request สำหรับ user management endpoints
 * GET = read (admin+operator ดูได้), POST/PUT = create/update (admin เท่านั้น ตาม permission matrix)
 *
 * @param PDO $pdo Database connection
 * @param string $method HTTP method
 * @param array $path URL path segments
 */
function handleUsers(PDO $pdo, string $method, array $path): void
{
    $actionMap = ['GET' => 'read', 'POST' => 'create', 'PUT' => 'update'];
    requirePermission($actionMap[$method] ?? 'read', 'users');
    $auth = getAuthenticatedUser();

    switch ($method) {
        case 'GET':
            getUserList($pdo);
            break;

        case 'POST':
            createUser($pdo, $auth);
            break;

        case 'PUT':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID ของผู้ใช้']);
                return;
            }
            updateUser($pdo, intval($id), $auth);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
}

/**
 * GET /users — รายชื่อผู้ใช้ พร้อม pagination และค้นหาจาก username/full_name
 */
function getUserList(PDO $pdo): void
{
    $search = $_GET['search'] ?? '';
    // clamp กัน limit มหาศาล / offset ติดลบ
    $limit = max(1, min(intval($_GET['limit'] ?? 20), 200));
    $offset = max(0, intval($_GET['offset'] ?? 0));

    $where = '';
    $params = [];

    if (!empty($search)) {
        $where = " WHERE (username LIKE ? OR full_name LIKE ?)";
        $searchTerm = "%{$search}%";
        $params = [$searchTerm, $searchTerm];
    }

    $sql = "SELECT " . USER_PUBLIC_COLUMNS . " FROM users"
        . $where . " ORDER BY user_id LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countStmt = $pdo->prepare("SELECT COUNT(*) AS total FROM users" . $where);
    $countStmt->execute($params);
    $total = intval($countStmt->fetch(PDO::FETCH_ASSOC)['total']);

    echo json_encode([
        'success' => true,
        'data' => $rows,
        'pagination' => [
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => ($offset + $limit) < $total
        ]
    ]);
}

/**
 * POST /users — สร้างผู้ใช้ใหม่ (must_change_password = 1 เสมอ)
 */
function createUser(PDO $pdo, ?array $auth): void
{
    $data = json_decode(file_get_contents('php://input'), true);

    $required = ['username', 'password', 'full_name', 'role'];
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            http_response_code(400);
            echo json_encode(['error' => "กรุณาระบุข้อมูล: {$field}"]);
            return;
        }
    }

    if (strlen($data['password']) < PASSWORD_MIN_LENGTH) {
        http_response_code(400);
        echo json_encode(['error' => 'รหัสผ่านต้องมีความยาวอย่างน้อย ' . PASSWORD_MIN_LENGTH . ' ตัวอักษร']);
        return;
    }

    if (!in_array($data['role'], VALID_ROLES, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'role ต้องเป็น admin หรือ operator เท่านั้น']);
        return;
    }

    try {
        $stmt = $pdo->prepare(
            "INSERT INTO users (username, password_hash, full_name, email, role, is_active, must_change_password)
             VALUES (?, ?, ?, ?, ?, 1, 1)"
        );
        $stmt->execute([
            trim($data['username']),
            password_hash($data['password'], PASSWORD_DEFAULT),
            $data['full_name'],
            $data['email'] ?? null,
            $data['role'],
        ]);
    } catch (PDOException $e) {
        // SQLSTATE 23000 = duplicate key (username ซ้ำ)
        if ($e->getCode() === '23000') {
            http_response_code(409);
            echo json_encode(['error' => 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว']);
            return;
        }
        throw $e;
    }

    $newUserId = intval($pdo->lastInsertId());

    // Audit log: บันทึกการสร้างผู้ใช้ — ไม่ใส่ password/password_hash ลง after_value
    logAudit(
        $pdo,
        $auth['user_id'],
        'CREATE',
        'users',
        $newUserId,
        null,
        [
            'username' => trim($data['username']),
            'full_name' => $data['full_name'],
            'email' => $data['email'] ?? null,
            'role' => $data['role'],
        ]
    );

    http_response_code(201);
    echo json_encode(['success' => true, 'user_id' => $newUserId]);
}

/**
 * PUT /users/{id} — แก้ไขข้อมูลผู้ใช้บางส่วน
 *
 * - field ที่แก้ได้: full_name, email, role, is_active
 * - ส่ง password มา = reset password (บังคับเปลี่ยนครั้งถัดไป)
 * - username แก้ไม่ได้ (immutable — ผูกกับ audit trail)
 * - กัน admin ลดสิทธิ์/ปิดบัญชีตัวเอง (กัน lock-out)
 */
function updateUser(PDO $pdo, int $id, array $auth): void
{
    $data = json_decode(file_get_contents('php://input'), true);

    $stmt = $pdo->prepare("SELECT " . USER_PUBLIC_COLUMNS . " FROM users WHERE user_id = ?");
    $stmt->execute([$id]);
    $beforeRow = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$beforeRow) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบผู้ใช้']);
        return;
    }

    // Self-guard: ห้ามแก้ role ตัวเองเป็น non-admin หรือปิดบัญชีตัวเอง
    if ($id === intval($auth['user_id'] ?? 0)) {
        $demotesSelf = isset($data['role']) && $data['role'] !== 'admin';
        $deactivatesSelf = isset($data['is_active']) && !((int) (bool) $data['is_active']);
        if ($demotesSelf || $deactivatesSelf) {
            http_response_code(400);
            echo json_encode(['error' => 'ไม่สามารถแก้ไขสิทธิ์หรือปิดบัญชีของตนเองได้']);
            return;
        }
    }

    if (isset($data['role']) && !in_array($data['role'], VALID_ROLES, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'role ต้องเป็น admin หรือ operator เท่านั้น']);
        return;
    }

    $sets = [];
    $params = [];

    foreach (['full_name', 'email', 'role'] as $field) {
        if (isset($data[$field])) {
            $sets[] = "{$field} = ?";
            $params[] = $data[$field];
        }
    }

    if (isset($data['is_active'])) {
        $sets[] = "is_active = ?";
        $params[] = (int) (bool) $data['is_active'];
    }

    // Reset password — hash ใหม่ + บังคับเปลี่ยนครั้งถัดไป
    if (isset($data['password']) && $data['password'] !== '') {
        if (strlen($data['password']) < PASSWORD_MIN_LENGTH) {
            http_response_code(400);
            echo json_encode(['error' => 'รหัสผ่านต้องมีความยาวอย่างน้อย ' . PASSWORD_MIN_LENGTH . ' ตัวอักษร']);
            return;
        }
        $sets[] = "password_hash = ?";
        $params[] = password_hash($data['password'], PASSWORD_DEFAULT);
        $sets[] = "must_change_password = 1";
    }

    if (empty($sets)) {
        http_response_code(400);
        echo json_encode(['error' => 'ไม่มีข้อมูลที่สามารถอัปเดตได้']);
        return;
    }

    $params[] = $id;
    $sql = "UPDATE users SET " . implode(', ', $sets) . " WHERE user_id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $afterStmt = $pdo->prepare("SELECT " . USER_PUBLIC_COLUMNS . " FROM users WHERE user_id = ?");
    $afterStmt->execute([$id]);
    $afterRow = $afterStmt->fetch(PDO::FETCH_ASSOC);

    // Audit log: บันทึกการแก้ไขผู้ใช้ (before/after ไม่มี password_hash อยู่แล้วเพราะไม่อยู่ใน USER_PUBLIC_COLUMNS)
    logAudit($pdo, $auth['user_id'], 'UPDATE', 'users', $id, $beforeRow, $afterRow);

    echo json_encode(['success' => true]);
}
