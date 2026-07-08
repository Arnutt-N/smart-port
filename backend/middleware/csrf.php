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
 * Middleware: Require valid CSRF token for state-changing requests
 *
 * Validates X-CSRF-Token header against token embedded in JWT payload.
 * Returns 403 Forbidden if validation fails.
 *
 * @return void Exits with 403 if CSRF validation fails
 */
function requireCSRFToken(): void
{
    $user = getAuthenticatedUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    $csrfToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $expectedToken = $user['csrf_token'] ?? '';

    if (!validateCSRFToken($csrfToken, $expectedToken)) {
        http_response_code(403);
        echo json_encode(['error' => 'CSRF token validation failed']);
        exit;
    }
}
