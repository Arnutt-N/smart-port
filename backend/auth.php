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

/**
 * D6: สร้าง access JWT ผูกกับ session deadline
 *
 * @param int $user_id
 * @param string $role
 * @param int $sessionExp Unix timestamp ของ session absolute expiry (ตอน login)
 *                        — exp ถูก bound ด้วยค่านี้เสมอ (ไม่มีทางเกิน 12ชม./30วัน)
 *                        · ไม่ส่งหรือไม่ใช่ int → throw InvalidArgumentException
 * @return array{token:string,csrf_token:string}
 */
function generateJWT($user_id, $role = 'operator', $sessionExp = null)
{
    if (!is_int($sessionExp) || $sessionExp <= 0) {
        // ป้องกันการเรียกเผลอโดยไม่ผ่าน login/refresh path — ไม่มี deadline = ไม่มีสิทธิ์ออก token
        throw new InvalidArgumentException('generateJWT ต้องได้ sessionExp เป็น int');
    }
    // Generate CSRF token for double-submit pattern
    $csrfToken = bin2hex(random_bytes(32));

    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload = json_encode([
        'iat' => time(),
        // D6: exp = min(1 ชม., session deadline) — strict: token ใช้ได้เมื่อ now < claim
        'exp' => min(time() + AUTH_ACCESS_COOKIE_TTL_SECONDS, $sessionExp),
        'session_exp' => $sessionExp, // D6: session absolute expiry ฝังใน token
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

// D6: อายุ session สองโหมด (ลบ remember = session cookie + 12 ชม., จำ = 30 วัน)
// ทั้งคู่เป็น absolute cap ที่ login — rotation ไม่ต่ออายุ (ดู routes/auth.php refreshSession)
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // remember=on → 30 วัน
const SESSION_ABS_TTL_SECONDS = 60 * 60 * 12; // remember=off → 12 ชม.

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
/**
 * D6: ตรวจ signature + ข้อความ exp/session_exp (strict `now < claim` ทั้งคู่)
 *
 * @param string|null $token access JWT จาก cookie
 * @return array<string,mixed>|false payload `data` เมื่อผ่าน, false เมื่อปฏิเสธ
 *                                    (ทุกเคสปฏิเสธแบบเงียบ ไม่มี warning)
 */
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

    // D6: exp ต้อง valid แบบ strict `now < exp` — หมดอายุตรงวินาที = หมดอายุ
    if (!isset($payload['exp']) || !is_int($payload['exp']) || $payload['exp'] <= time()) {
        return false;
    }

    // D6: session_exp ต้องมี เป็น int และยังไม่หมดอายุ (token ที่ไม่มี claim = legacy ก่อน D6 → ใช้ไม่ได้)
    if (!isset($payload['session_exp']) || !is_int($payload['session_exp']) || $payload['session_exp'] <= time()) {
        return false;
    }

    // D6: exp ห้ามเกิน session deadline — ทั้งสอง claim ต้อง strict `now < claim`
    if ($payload['exp'] > $payload['session_exp']) {
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
const AUTH_ACCESS_COOKIE_TTL_SECONDS = 3600; // อายุ access JWT สูงสุด — จริงคือ min(1 ชม., session deadline)
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
 * D6: พารามิเตอร์ setcookie มาตรฐาน (pure core — เทส flags ได้โดยไม่แตะ header จริง)
 *
 * $expiresAt = null → ไม่ส่ง key `expires` เลย = PHP ออก session cookie (จำไม่ได้);
 * $expiresAt = int  → persistent cookie หมดอายุที่ timestamp นั้น
 *
 * @param string $path
 * @param int|null $expiresAt Unix timestamp หรือ null (session cookie)
 * @return array{path:string,secure:bool,httponly:bool,samesite:string,expires?:int}
 */
function authCookieParams(string $path, ?int $expiresAt = null): array
{
    $params = [
        'path' => $path,
        'secure' => isHttpsRequest(),
        'httponly' => true,
        'samesite' => 'Lax',
    ];
    if ($expiresAt !== null) {
        $params['expires'] = $expiresAt;
    }

    return $params;
}

/**
 * D3: ส่ง Set-Cookie หนึ่งใบ (N23 test hook — CLI ทิ้ง setcookie เงียบและ
 * headers_list() ว่างเสมอ จึง capture ผ่าน $GLOBALS['__capture_cookies'] แทน
 * เมื่อ integration test ตั้ง hook นี้ไว้; production ไม่ตั้ง = setcookie จริง)
 *
 * @param array{path:string,secure:bool,httponly:bool,samesite:string,expires?:int} $params
 */
function emitSessionCookie(string $name, string $value, array $params): void
{
    if (array_key_exists('__capture_cookies', $GLOBALS) && is_array($GLOBALS['__capture_cookies'])) {
        $GLOBALS['__capture_cookies'][] = ['name' => $name, 'value' => $value, 'params' => $params];

        return;
    }
    // setcookie() คืน false เมื่อ headers ส่งไปแล้ว — session จะไม่ตั้งโดย user ไม่รู้
    // (login 200 แต่ request ถัดไป 401) log ไว้ให้ trace ได้ ไม่ใช่พังเงียบ
    if (!setcookie($name, $value, $params)) {
        error_log('[auth] setcookie failed (headers already sent): ' . $name);
    }
}

/**
 * D6: ออก session cookies คู่หลัง login/refresh สำเร็จ (body response คงเดิม — compat-keep)
 *
 * remember=false (session mode): ทั้งคู่เป็น session cookie — ส่ง null/null
 *   → ไม่มี Expires/Max-Age ฝั่ง browser (อายุจริงคุมที่ server ด้วย session_exp)
 * remember=true (persistent): access = JWT exp, refresh = session deadline
 *
 * @param string $accessJwt
 * @param string $refreshRawToken
 * @param int|null $accessExpiresAt
 * @param int|null $refreshExpiresAt
 */
function setAuthCookies(string $accessJwt, string $refreshRawToken, ?int $accessExpiresAt, ?int $refreshExpiresAt): void
{
    emitSessionCookie(AUTH_ACCESS_COOKIE, $accessJwt, authCookieParams('/', $accessExpiresAt));
    emitSessionCookie(AUTH_REFRESH_COOKIE, $refreshRawToken, authCookieParams(AUTH_REFRESH_COOKIE_PATH, $refreshExpiresAt));
}

/**
 * D6: ล้าง session cookies คู่ (terminal rejection / logout — path/flags ต้องตรงตอนออก
 * ไม่งั้น browser ไม่อัปเดต) — ใช้ absolute expiry ในอดีตเสมอ ไม่สน remember mode
 */
function clearAuthCookies(): void
{
    $past = time() - 3600;
    emitSessionCookie(AUTH_ACCESS_COOKIE, '', authCookieParams('/', $past));
    emitSessionCookie(AUTH_REFRESH_COOKIE, '', authCookieParams(AUTH_REFRESH_COOKIE_PATH, $past));
}

// D3 cut over: อ่าน access JWT จาก httpOnly cookie เท่านั้น (เลิกอ่าน Authorization header)
function getAuthHeader(): ?string
{
    $token = $_COOKIE[AUTH_ACCESS_COOKIE] ?? null;

    return is_string($token) && $token !== '' ? $token : null;
}
