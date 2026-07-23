<?php
// ============================================================================
// routes/auth.php
// Authentication Route Handler — เข้าสู่ระบบจากตาราง users จริง
//
// Endpoints:
//   POST /auth/login           — ตรวจ username/password กับ DB + rate limit
//   POST /auth/change-password — เปลี่ยนรหัสผ่านที่ถูกบังคับหลังเข้าสู่ระบบ
//
// Rate limiting (ตาราง login_attempts):
//   ผิดติดต่อกัน 5 ครั้งภายใน 15 นาที (นับต่อ username) -> 429
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../audit.php';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;
const AUTH_PASSWORD_MIN_LENGTH = 8;

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

    if (($path[1] ?? '') === 'refresh' && $method === 'POST') {
        refreshSession($pdo);
        return;
    }

    if (($path[1] ?? '') === 'logout' && $method === 'POST') {
        logoutSession($pdo);
        return;
    }

    if (($path[1] ?? '') === 'change-password' && $method === 'POST') {
        $user = getAuthenticatedUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }
        changePassword($pdo, $user);
        return;
    }

    http_response_code(404);
    echo json_encode(['error' => 'ไม่พบ endpoint การยืนยันตัวตน']);
}

/**
 * POST /auth/change-password — ยืนยันรหัสเดิมและล้าง must_change_password
 *
 * @param array{user_id:int} $user
 * @param array<string,mixed>|null $input ใช้ inject ใน integration tests
 */
function changePassword(PDO $pdo, array $user, ?array $input = null): void
{
    $data = $input ?? json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'รูปแบบข้อมูลไม่ถูกต้อง']);
        return;
    }

    $currentPassword = (string) ($data['current_password'] ?? '');
    $newPassword = (string) ($data['new_password'] ?? '');

    if ($currentPassword === '' || $newPassword === '') {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณาระบุรหัสผ่านเดิมและรหัสผ่านใหม่']);
        return;
    }
    if (strlen($newPassword) < AUTH_PASSWORD_MIN_LENGTH) {
        http_response_code(400);
        echo json_encode(['error' => 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย ' . AUTH_PASSWORD_MIN_LENGTH . ' ตัวอักษร']);
        return;
    }

    $stmt = $pdo->prepare(
        'SELECT password_hash, must_change_password
         FROM users
         WHERE user_id = ? AND is_active = 1'
    );
    $stmt->execute([(int) $user['user_id']]);
    $account = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$account || !password_verify($currentPassword, (string) $account['password_hash'])) {
        http_response_code(400);
        echo json_encode(['error' => 'รหัสผ่านเดิมไม่ถูกต้อง']);
        return;
    }
    if (password_verify($newPassword, (string) $account['password_hash'])) {
        http_response_code(400);
        echo json_encode(['error' => 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม']);
        return;
    }

    $pdo->prepare(
        'UPDATE users
         SET password_hash = ?, must_change_password = 0
         WHERE user_id = ?'
    )->execute([
        password_hash($newPassword, PASSWORD_DEFAULT),
        (int) $user['user_id'],
    ]);

    logAudit(
        $pdo,
        (int) $user['user_id'],
        'UPDATE',
        'users',
        (int) $user['user_id'],
        ['must_change_password' => (bool) $account['must_change_password']],
        ['must_change_password' => false]
    );

    echo json_encode(['success' => true]);
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
    $refreshToken = issueRefreshToken($pdo, (int) $user['user_id']);

    echo json_encode(buildAuthResponse($jwtResult, $refreshToken, $user));
}

/**
 * ประกอบ response มาตรฐานหลัง login / refresh — ใช้ร่วมกันเพื่อให้ frontend รับ shape เดียวกัน
 *
 * @param array{token:string,csrf_token:string} $jwtResult
 * @param array<string,mixed> $user แถวจากตาราง users
 */
function buildAuthResponse(array $jwtResult, string $refreshToken, array $user): array
{
    return [
        'token' => $jwtResult['token'],
        'csrf_token' => $jwtResult['csrf_token'],
        'refresh_token' => $refreshToken,
        'user' => [
            'id' => (int) $user['user_id'],
            'username' => $user['username'],
            'name' => $user['full_name'],
            'role' => $user['role'],
            'must_change_password' => (bool) $user['must_change_password'],
        ],
    ];
}

/**
 * ออก refresh token ใหม่ 1 ใบ เก็บเฉพาะ hash ลง DB แล้วคืน plaintext ให้ client
 */
function issueRefreshToken(PDO $pdo, int $userId): string
{
    $rawToken = generateRefreshToken();
    $expiresAt = date('Y-m-d H:i:s', time() + REFRESH_TOKEN_TTL_SECONDS);

    $pdo->prepare(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
    )->execute([$userId, hashRefreshToken($rawToken), $expiresAt]);

    return $rawToken;
}

/**
 * POST /auth/refresh — แลก refresh token เป็น access JWT ใหม่ (มี rotation)
 *
 * ขั้นตอน:
 *   1. hash token ที่รับมา แล้วค้นแถวที่ตรง
 *   2. ถ้าไม่พบ / user ถูกปิดใช้งาน -> 401 (ข้อความ generic)
 *   3. ถ้าพบแต่ถูก revoke ไปแล้ว = reuse ต้องสงสัยถูกขโมย -> revoke ทุกใบของ user แล้ว 401
 *   4. ถ้าหมดอายุ -> revoke ใบนั้นแล้ว 401
 *   5. สำเร็จ: revoke ใบเดิม (rotation) + ออก JWT ใหม่ + refresh token ใหม่
 *
 * @param array<string,mixed>|null $input ใช้ inject ใน integration tests
 */
function refreshSession(PDO $pdo, ?array $input = null): void
{
    $data = $input ?? json_decode(file_get_contents('php://input'), true);
    $rawToken = is_array($data) ? (string) ($data['refresh_token'] ?? '') : '';

    if ($rawToken === '') {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณาระบุ refresh token']);
        return;
    }

    $tokenHash = hashRefreshToken($rawToken);
    $stmt = $pdo->prepare(
        'SELECT token_id, user_id, expires_at, revoked_at
         FROM refresh_tokens WHERE token_hash = ?'
    );
    $stmt->execute([$tokenHash]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        http_response_code(401);
        echo json_encode(['error' => 'refresh token ไม่ถูกต้องหรือหมดอายุ']);
        return;
    }

    // Reuse detection: ใบที่ถูก revoke แล้วถูกนำมาใช้ซ้ำ
    if ($row['revoked_at'] !== null) {
        $revokedTs = strtotime((string) $row['revoked_at']);
        $graceSeconds = 10;
        // เพิ่ง revoke ไม่กี่วินาที = race ระหว่าง tab (ไม่ใช่ขโมย) -> 401 เฉยๆ ไม่ kill-all
        if ($revokedTs !== false && (time() - $revokedTs) <= $graceSeconds) {
            http_response_code(401);
            echo json_encode(['error' => 'refresh token ไม่ถูกต้องหรือหมดอายุ']);
            return;
        }
        // revoke มานานแล้วถูกใช้ซ้ำ = สงสัยถูกขโมย -> เพิกถอนทุกใบ
        $pdo->prepare(
            'UPDATE refresh_tokens SET revoked_at = NOW()
             WHERE user_id = ? AND revoked_at IS NULL'
        )->execute([(int) $row['user_id']]);
        http_response_code(401);
        echo json_encode(['error' => 'refresh token ไม่ถูกต้องหรือหมดอายุ']);
        return;
    }

    if (strtotime((string) $row['expires_at']) < time()) {
        $pdo->prepare('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_id = ?')
            ->execute([(int) $row['token_id']]);
        http_response_code(401);
        echo json_encode(['error' => 'refresh token ไม่ถูกต้องหรือหมดอายุ']);
        return;
    }

    $userStmt = $pdo->prepare(
        'SELECT user_id, username, full_name, role, is_active, must_change_password
         FROM users WHERE user_id = ? AND is_active = 1'
    );
    $userStmt->execute([(int) $row['user_id']]);
    $user = $userStmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        $pdo->prepare('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_id = ?')
            ->execute([(int) $row['token_id']]);
        http_response_code(401);
        echo json_encode(['error' => 'refresh token ไม่ถูกต้องหรือหมดอายุ']);
        return;
    }

    // Rotation: เพิกถอนใบเดิม ออกใบใหม่
    $pdo->prepare('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_id = ?')
        ->execute([(int) $row['token_id']]);

    $jwtResult = generateJWT((int) $user['user_id'], $user['role']);
    $newRefreshToken = issueRefreshToken($pdo, (int) $user['user_id']);

    echo json_encode(buildAuthResponse($jwtResult, $newRefreshToken, $user));
}

/**
 * POST /auth/logout — เพิกถอน refresh token ที่ client ถืออยู่ (best-effort)
 *
 * ไม่ต้องมี access token ที่ valid เพราะใช้ refresh token เป็น credential
 * คืน success เสมอเพื่อไม่เปิดเผยว่า token มีอยู่จริงหรือไม่
 *
 * @param array<string,mixed>|null $input ใช้ inject ใน integration tests
 */
function logoutSession(PDO $pdo, ?array $input = null): void
{
    $data = $input ?? json_decode(file_get_contents('php://input'), true);
    $rawToken = is_array($data) ? (string) ($data['refresh_token'] ?? '') : '';

    if ($rawToken !== '') {
        $pdo->prepare(
            'UPDATE refresh_tokens SET revoked_at = NOW()
             WHERE token_hash = ? AND revoked_at IS NULL'
        )->execute([hashRefreshToken($rawToken)]);
    }

    echo json_encode(['success' => true]);
}
