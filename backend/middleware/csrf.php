<?php

/**
 * CSRF Protection Middleware
 * Double-submit pattern with JWT-embedded token
 *
 * Security pattern: CSRF token embedded in JWT payload and validated via X-CSRF-Token header
 * This prevents CSRF attacks while maintaining stateless JWT authentication
 */

/**
 * Generate a cryptographically secure CSRF token
 *
 * @return string 64-character hexadecimal token
 */
function generateCSRFToken(): string
{
    return bin2hex(random_bytes(32));
}

/**
 * Validate CSRF token using timing-safe comparison
 *
 * @param string $token Token from X-CSRF-Token header
 * @param string $expectedToken Token from JWT payload
 * @return bool True if tokens match, false otherwise
 */
function validateCSRFToken(string $token, string $expectedToken): bool
{
    if ($token === '' || $expectedToken === '') {
        return false;
    }
    return hash_equals($expectedToken, $token);
}

/**
 * D3: pure core ของ requireCSRFToken — ตัดสินใจล้วน ไม่แตะ superglobal/exit
 *
 * @param array{csrf_token?:string}|null $user ผู้ใช้ที่ resolve แล้ว (null = ยังไม่ auth)
 * @return array{code:int,error:string}|null null = ผ่าน, array = ปฏิเสธพร้อมรหัส/ข้อความ
 */
function csrfCheckResult(?array $user, string $headerToken): ?array
{
    if ($user === null) {
        return ['code' => 401, 'error' => 'Unauthorized'];
    }
    if (!validateCSRFToken($headerToken, (string) ($user['csrf_token'] ?? ''))) {
        return ['code' => 403, 'error' => 'CSRF token validation failed'];
    }

    return null;
}

/**
 * Middleware: Require valid CSRF token for state-changing requests
 *
 * Validates X-CSRF-Token header against token embedded in JWT payload.
 * Returns 403 Forbidden if validation fails.
 *
 * @return void Exits with 403 if CSRF validation fails
 */
function requireCSRFToken(): void
{
    $rejection = csrfCheckResult(getAuthenticatedUser(), (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
    if ($rejection !== null) {
        http_response_code($rejection['code']);
        echo json_encode(['error' => $rejection['error']]);
        exit;
    }
}
