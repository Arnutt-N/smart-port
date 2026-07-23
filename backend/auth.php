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

// อายุ refresh token = 30 วัน (access JWT อายุ 1 ชม. ใน generateJWT)
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

// สร้าง refresh token แบบ opaque (ไม่ใช่ JWT) 32 bytes -> 64 hex
function generateRefreshToken(): string {
    return bin2hex(random_bytes(32));
}

// เก็บเฉพาะ hash ของ refresh token ใน DB — plaintext อยู่ที่ client เท่านั้น
function hashRefreshToken(string $rawToken): string {
    return hash('sha256', $rawToken);
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

function extractBearerTokenFromRequest(array $server, array $headers = []): ?string {
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $serverKey) {
        if (isset($server[$serverKey]) && is_string($server[$serverKey])) {
            return extractBearerToken($server[$serverKey]);
        }
    }

    foreach ($headers as $name => $value) {
        if (strcasecmp((string) $name, 'Authorization') === 0 && is_string($value)) {
            return extractBearerToken($value);
        }
    }

    return null;
}

function getAuthHeader(): ?string {
    $headers = [];
    if (function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        if (is_array($requestHeaders)) {
            $headers = $requestHeaders;
        }
    }

    return extractBearerTokenFromRequest($_SERVER, $headers);
}

?>
