<?php

// Simple JWT Implementation without external libraries
function base64url_encode($data)
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode($data)
{
    return base64_decode(str_pad(strtr($data, '-_', '+/'), strlen($data) % 4, '=', STR_PAD_RIGHT));
}

function generateJWT($user_id, $role = 'operator')
{
    // Generate CSRF token for double-submit pattern
    $csrfToken = bin2hex(random_bytes(32));

    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload = json_encode([
        'iat' => time(),
        'exp' => time() + 3600, // หมดอายุ 1 ชม.
        'csrf' => $csrfToken, // CSRF token embedded in JWT
        'data' => ['user_id' => $user_id, 'role' => $role]
    ]);

    $headerEncoded = base64url_encode($header);
    $payloadEncoded = base64url_encode($payload);

    $signature = hash_hmac('sha256', $headerEncoded . '.' . $payloadEncoded, JWT_SECRET, true);
    $signatureEncoded = base64url_encode($signature);

    $token = $headerEncoded . '.' . $payloadEncoded . '.' . $signatureEncoded;

    // Return both JWT and CSRF token separately
    return [
        'token' => $token,
        'csrf_token' => $csrfToken
    ];
}

// อายุ refresh token = 30 วัน (access JWT อายุ 1 ชม. ใน generateJWT)
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

// สร้าง refresh token แบบ opaque (ไม่ใช่ JWT) 32 bytes -> 64 hex
function generateRefreshToken(): string
{
    return bin2hex(random_bytes(32));
}

// เก็บเฉพาะ hash ของ refresh token ใน DB — plaintext อยู่ที่ client เท่านั้น
function hashRefreshToken(string $rawToken): string
{
    return hash('sha256', $rawToken);
}

// นโยบายรหัสผ่านเข้ม (D2) — product ตัดสิน 2026-09-23: ยาว >= 12, ครบ 4 กลุ่ม, จำ 5 รุ่น
const PASSWORD_POLICY_MIN_LENGTH = 12;
const PASSWORD_POLICY_HISTORY_KEEP = 5;
// bcrypt ตัด input ที่ 72 bytes เงียบ ๆ — กันรหัสยาวต่างกันได้ hash เดียวกัน
const PASSWORD_POLICY_MAX_BYTES = 72;

/**
 * ตรวจรหัสผ่านตามนโยบายเข้ม — คืน null = ผ่าน, string = ข้อความ error ไทยข้อแรกที่ตก
 *
 * @param string $pw รหัสผ่านใหม่ (plaintext)
 * @param array $historyHashes password_hash 5 รุ่นล่าสุด (ใหม่สุดก่อนหรือไม่ก็ได้)
 */
function validatePasswordPolicy(string $pw, array $historyHashes): ?string
{
    if (mb_strlen($pw) < PASSWORD_POLICY_MIN_LENGTH) {
        return 'รหัสผ่านต้องมีความยาวอย่างน้อย ' . PASSWORD_POLICY_MIN_LENGTH . ' ตัวอักษร';
    }
    if (strlen($pw) > PASSWORD_POLICY_MAX_BYTES) {
        return 'รหัสผ่านต้องยาวไม่เกิน ' . PASSWORD_POLICY_MAX_BYTES . ' bytes';
    }
    // Unicode-aware: ไทย/สากลนับตาม class จริง (Thai digits เป็น \p{N})
    if (!preg_match('/\p{Lu}/u', $pw)) {
        return 'รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว';
    }
    if (!preg_match('/\p{Ll}/u', $pw)) {
        return 'รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว';
    }
    if (!preg_match('/[\p{N}]/u', $pw)) {
        return 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว';
    }
    if (!preg_match('/[^\p{L}\p{N}\s]/u', $pw)) {
        return 'รหัสผ่านต้องมีอักขระพิเศษอย่างน้อย 1 ตัว';
    }
    foreach ($historyHashes as $oldHash) {
        if (is_string($oldHash) && $oldHash !== '' && password_verify($pw, $oldHash)) {
            return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับ ' . PASSWORD_POLICY_HISTORY_KEEP . ' รุ่นล่าสุด';
        }
    }
    return null;
}

/**
 * ตัดประวัติรหัสผ่านให้เหลือ PASSWORD_POLICY_HISTORY_KEEP รุ่นล่าสุด (เรียกใน txn เดียวกับ INSERT)
 */
function prunePasswordHistory(PDO $pdo, int $userId): void
{
    $ids = $pdo->query(
        'SELECT history_id FROM password_history WHERE user_id = ' . $userId . ' ORDER BY history_id DESC'
    )->fetchAll(PDO::FETCH_COLUMN);
    $drop = array_slice($ids === false ? [] : $ids, PASSWORD_POLICY_HISTORY_KEEP);
    if ($drop === []) {
        return;
    }
    $pdo->prepare(
        'DELETE FROM password_history WHERE history_id IN (' . implode(',', array_fill(0, count($drop), '?')) . ')'
    )->execute($drop);
}
function validateJWT($token)
{
    if (!$token) {
        return false;
    }

    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return false;
    }

    list($headerEncoded, $payloadEncoded, $signatureEncoded) = $parts;

    // ตรวจ alg ใน header ก่อน — defense-in-depth กัน algorithm-confusion (รับเฉพาะ HS256)
    $header = json_decode(base64url_decode($headerEncoded), true);
    if (!is_array($header) || ($header['alg'] ?? '') !== 'HS256') {
        return false;
    }

    // Verify signature
    $signature = base64url_decode($signatureEncoded);
    $expectedSignature = hash_hmac('sha256', $headerEncoded . '.' . $payloadEncoded, JWT_SECRET, true);

    if (!hash_equals($signature, $expectedSignature)) {
        return false;
    }

    // Decode payload
    $payload = json_decode(base64url_decode($payloadEncoded), true);

    if (!is_array($payload)) {
        return false;
    }

    // Check expiration — exp ต้องเป็นตัวเลขและยังไม่หมดอายุ (ไม่มี/ผิดรูป = ปฏิเสธเงียบ ไม่ warning)
    if (!isset($payload['exp']) || !is_numeric($payload['exp']) || (int) $payload['exp'] < time()) {
        return false;
    }

    if (!isset($payload['data']) || !is_array($payload['data'])) {
        return false;
    }

    return $payload['data'];
}

// D3: session ย้ายลง httpOnly cookie (cut over จาก Authorization header — 2026-09-23)
// ชื่อสั้น + prefix sp_ กันชน cookie อื่น; frontend ตัวเดียวใน repo ใช้ผ่าน /api (same-origin)
const AUTH_ACCESS_COOKIE = 'sp_access';
const AUTH_REFRESH_COOKIE = 'sp_refresh';
const AUTH_ACCESS_COOKIE_TTL_SECONDS = 3600; // = อายุ access JWT ใน generateJWT
const AUTH_REFRESH_COOKIE_PATH = '/api/auth'; // แคบสุด — ใช้ได้เฉพาะเส้น refresh/logout

/**
 * D3: request นี้มาผ่าน HTTPS หรือไม่ (proxy ส่ง X-Forwarded-Proto มาให้ —
 * nginx.conf ตั้งให้แล้ว, Render ก็ส่ง) — ใช้ตัดสิน flag Secure ของ cookie
 */
function isHttpsRequest(): bool
{
    $https = (string) ($_SERVER['HTTPS'] ?? '');
    if ($https !== '' && strtolower($https) !== 'off') {
        return true;
    }

    return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

/**
 * D3: พารามิเตอร์ setcookie มาตรฐาน (pure core — เทส flags ได้โดยไม่แตะ header จริง)
 *
 * @return array{expires:int,path:string,secure:bool,httponly:bool,samesite:string}
 */
function authCookieParams(string $path, int $ttlSeconds): array
{
    return [
        'expires' => time() + $ttlSeconds,
        'path' => $path,
        'secure' => isHttpsRequest(),
        'httponly' => true,
        'samesite' => 'Lax',
    ];
}

/**
 * D3: ส่ง Set-Cookie หนึ่งใบ (N23 test hook — CLI ทิ้ง setcookie เงียบและ
 * headers_list() ว่างเสมอ จึง capture ผ่าน $GLOBALS['__capture_cookies'] แทน
 * เมื่อ integration test ตั้ง hook นี้ไว้; production ไม่ตั้ง = setcookie จริง)
 *
 * @param array{expires:int,path:string,secure:bool,httponly:bool,samesite:string} $params
 */
function emitSessionCookie(string $name, string $value, array $params): void
{
    if (array_key_exists('__capture_cookies', $GLOBALS) && is_array($GLOBALS['__capture_cookies'])) {
        $GLOBALS['__capture_cookies'][] = ['name' => $name, 'value' => $value, 'params' => $params];

        return;
    }
    setcookie($name, $value, $params);
}

/**
 * D3: ออก session cookies คู่หลัง login/refresh สำเร็จ (body response คงเดิม — compat-keep)
 */
function setAuthCookies(string $accessJwt, string $refreshRawToken): void
{
    emitSessionCookie(AUTH_ACCESS_COOKIE, $accessJwt, authCookieParams('/', AUTH_ACCESS_COOKIE_TTL_SECONDS));
    emitSessionCookie(AUTH_REFRESH_COOKIE, $refreshRawToken, authCookieParams(AUTH_REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_SECONDS));
}

/**
 * D3: ล้าง session cookies คู่ (logout — path/flags ต้องตรงตอนออก ไม่งั้น browser ไม่อัปเดต)
 */
function clearAuthCookies(): void
{
    emitSessionCookie(AUTH_ACCESS_COOKIE, '', authCookieParams('/', -3600));
    emitSessionCookie(AUTH_REFRESH_COOKIE, '', authCookieParams(AUTH_REFRESH_COOKIE_PATH, -3600));
}

// D3 cut over: อ่าน access JWT จาก httpOnly cookie เท่านั้น (เลิกอ่าน Authorization header)
function getAuthHeader(): ?string
{
    $token = $_COOKIE[AUTH_ACCESS_COOKIE] ?? null;

    return is_string($token) && $token !== '' ? $token : null;
}
