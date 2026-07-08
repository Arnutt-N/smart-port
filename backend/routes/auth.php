<?php
// ============================================================================
// routes/auth.php
// Authentication Route Handler — เข้าสู่ระบบจากตาราง users จริง
//
// Endpoints:
//   POST /auth/login — ตรวจ username/password กับ DB + rate limit
//
// Rate limiting (ตาราง login_attempts):
//   ผิดติดต่อกัน 5 ครั้งภายใน 15 นาที (นับต่อ username) -> 429
// ============================================================================

include_once __DIR__ . '/../helpers.php';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;

/**
 * จัดการ request สำหรับ auth endpoints
 *
 * @param PDO $pdo Database connection
 * @param string $method HTTP method
 * @param array $path URL path segments
 */
function handleAuth(PDO $pdo, string $method, array $path): void
{
    if (($path[1] ?? '') === 'login' && $method === 'POST') {
        loginUser($pdo);
        return;
    }

    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
}

/**
 * POST /auth/login — ตรวจสอบ credentials กับตาราง users
 *
 * ข้อความ error 401 เหมือนกันทุกกรณี (user ไม่มี / รหัสผิด / ถูกปิดใช้งาน)
 * เพื่อไม่เปิดเผยว่า username ใดมีอยู่ในระบบ
 */
function loginUser(PDO $pdo): void
{
    $data = json_decode(file_get_contents('php://input'), true);

    // รองรับทั้ง username/password และ email/password (frontend เดิมส่งได้ทั้งสอง key)
    $username = trim((string) ($data['username'] ?? $data['email'] ?? ''));
    $password = (string) ($data['password'] ?? '');

    if ($username === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณาระบุชื่อผู้ใช้และรหัสผ่าน']);
        return;
    }

    // ลบ log เก่าเกิน 1 วัน — กันตาราง login_attempts โตไม่จำกัด
    $pdo->exec("DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL 1 DAY");

    // Rate limit: นับครั้งที่ผิดใน 15 นาทีล่าสุดของ username นี้
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) AS fails FROM login_attempts
         WHERE username = ? AND is_success = 0
           AND attempted_at > NOW() - INTERVAL " . LOCKOUT_WINDOW_MINUTES . " MINUTE"
    );
    $stmt->execute([$username]);
    $fails = (int) $stmt->fetch(PDO::FETCH_ASSOC)['fails'];

    if ($fails >= MAX_LOGIN_ATTEMPTS) {
        http_response_code(429);
        echo json_encode(['error' => 'พยายามเข้าสู่ระบบผิดเกินกำหนด กรุณารอ ' . LOCKOUT_WINDOW_MINUTES . ' นาที']);
        return;
    }

    $stmt = $pdo->prepare(
        "SELECT user_id, username, password_hash, full_name, role, is_active, must_change_password
         FROM users WHERE username = ?"
    );
    $stmt->execute([$username]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    // password_verify รันเสมอแม้ไม่พบ user — กัน timing attack แยกแยะ username
    $dummyHash = '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';
    $hash = $user['password_hash'] ?? $dummyHash;
    $isValid = password_verify($password, $hash)
        && $user !== false
        && $user['password_hash'] !== null
        && (int) $user['is_active'] === 1;

    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    $logStmt = $pdo->prepare(
        "INSERT INTO login_attempts (username, ip_address, is_success) VALUES (?, ?, ?)"
    );

    if (!$isValid) {
        $logStmt->execute([$username, $ip, 0]);
        http_response_code(401);
        echo json_encode(['error' => 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง']);
        return;
    }

    $logStmt->execute([$username, $ip, 1]);
    $pdo->prepare("UPDATE users SET last_login_at = NOW() WHERE user_id = ?")
        ->execute([$user['user_id']]);

    $jwtResult = generateJWT((int) $user['user_id'], $user['role']);

    echo json_encode([
        'token' => $jwtResult['token'],
        'csrf_token' => $jwtResult['csrf_token'],
        'user' => [
            'id' => (int) $user['user_id'],
            'username' => $user['username'],
            'name' => $user['full_name'],
            'role' => $user['role'],
            'must_change_password' => (bool) $user['must_change_password'],
        ],
    ]);
}
