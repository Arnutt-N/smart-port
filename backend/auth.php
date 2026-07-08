<?php
// Simple JWT Implementation without external libraries
function base64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode($data) {
    return base64_decode(str_pad(strtr($data, '-_', '+/'), strlen($data) % 4, '=', STR_PAD_RIGHT));
}

function generateJWT($user_id, $role = 'operator') {
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

    $signature = hash_hmac('sha256', $headerEncoded . "." . $payloadEncoded, JWT_SECRET, true);
    $signatureEncoded = base64url_encode($signature);

    $token = $headerEncoded . "." . $payloadEncoded . "." . $signatureEncoded;

    // Return both JWT and CSRF token separately
    return [
        'token' => $token,
        'csrf_token' => $csrfToken
    ];
}

function validateJWT($token) {
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
    $expectedSignature = hash_hmac('sha256', $headerEncoded . "." . $payloadEncoded, JWT_SECRET, true);
    
    if (!hash_equals($signature, $expectedSignature)) {
        return false;
    }
    
    // Decode payload
    $payload = json_decode(base64url_decode($payloadEncoded), true);
    
    // Check expiration
    if ($payload['exp'] < time()) {
        return false;
    }
    
    return $payload['data'];
}

// แยก token จากค่า header "Bearer <token>" — รองรับ prefix ทุกตัวพิมพ์ (Bearer/bearer)
function extractBearerToken(string $headerValue): ?string {
    if (stripos($headerValue, 'Bearer ') === 0) {
        return substr($headerValue, 7);
    }
    return null;
}

function getAuthHeader() {
    // Check for Authorization header in different ways
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        return extractBearerToken($_SERVER['HTTP_AUTHORIZATION']);
    }

    // Apache rewrite sets REDIRECT_HTTP_AUTHORIZATION
    if (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return extractBearerToken($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
    }

    if (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        if (isset($headers['Authorization'])) {
            return extractBearerToken($headers['Authorization']);
        }
    }

    return null;
}

// ดึงข้อมูล user จาก JWT ของ request ปัจจุบัน — คืน ['user_id'=>.., 'role'=>..] หรือ null
function currentUser(): ?array {
    $payload = validateJWT(getAuthHeader());
    return is_array($payload) ? $payload : null;
}

// บังคับ role admin — ส่ง 403 แล้วจบ request ถ้าไม่ใช่
function requireAdmin(): array {
    $user = currentUser();
    if (!$user || ($user['role'] ?? '') !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'ต้องเป็นผู้ดูแลระบบเท่านั้น']);
        exit;
    }
    return $user;
}
?>
