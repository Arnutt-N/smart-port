<?php
/**
 * Rate Limiting Middleware
 * Primary: MySQL sliding window (persists across Render restarts)
 * Fallback: JSON files when api_rate_limit_hits table is unavailable
 */

define('RATE_LIMIT_DIR', __DIR__ . '/../storage/rate_limits/');

/** @var bool|null */
$GLOBALS['_rate_limit_db_ready'] = null;

function rateLimitUsesDatabase(): bool
{
    if ($GLOBALS['_rate_limit_db_ready'] !== null) {
        return $GLOBALS['_rate_limit_db_ready'];
    }

    try {
        if (!function_exists('getDB')) {
            require_once __DIR__ . '/../config.php';
        }
        $pdo = getDB();
        $stmt = $pdo->query("SHOW TABLES LIKE 'api_rate_limit_hits'");
        $GLOBALS['_rate_limit_db_ready'] = (bool) $stmt->fetchColumn();
    } catch (Throwable $e) {
        error_log('[RateLimit] DB probe failed: ' . $e->getMessage());
        $GLOBALS['_rate_limit_db_ready'] = false;
    }

    return $GLOBALS['_rate_limit_db_ready'];
}

/**
 * Check rate limit for a specific user and method
 *
 * @param int $userId User ID from authenticated user
 * @param string $method Request method or custom identifier
 * @param int $limit Maximum requests allowed in window
 * @param int $windowSeconds Time window in seconds
 * @return void Exits with 429 if limit exceeded
 */
function checkRateLimit(int $userId, string $method, int $limit, int $windowSeconds): void
{
    if (rateLimitUsesDatabase()) {
        checkRateLimitDatabase($userId, $method, $limit, $windowSeconds);
        return;
    }

    checkRateLimitFile($userId, $method, $limit, $windowSeconds);
}

function checkRateLimitDatabase(int $userId, string $method, int $limit, int $windowSeconds): void
{
    $pdo = getDB();
    $rateKey = "user_{$userId}_{$method}";
    $now = time();
    $windowStart = $now - $windowSeconds;

    $pdo->beginTransaction();
    try {
        $delete = $pdo->prepare(
            'DELETE FROM api_rate_limit_hits WHERE rate_key = ? AND hit_at <= ?'
        );
        $delete->execute([$rateKey, $windowStart]);

        $countStmt = $pdo->prepare(
            'SELECT COUNT(*) FROM api_rate_limit_hits WHERE rate_key = ?'
        );
        $countStmt->execute([$rateKey]);
        $currentCount = (int) $countStmt->fetchColumn();

        if ($currentCount >= $limit) {
            $pdo->rollBack();
            rateLimitExceededResponse($windowSeconds);
        }

        $insert = $pdo->prepare(
            'INSERT INTO api_rate_limit_hits (rate_key, hit_at) VALUES (?, ?)'
        );
        $insert->execute([$rateKey, $now]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[RateLimit] DB check failed: ' . $e->getMessage());
        checkRateLimitFile($userId, $method, $limit, $windowSeconds);
    }
}

function checkRateLimitFile(int $userId, string $method, int $limit, int $windowSeconds): void
{
    if (!is_dir(RATE_LIMIT_DIR)) {
        mkdir(RATE_LIMIT_DIR, 0775, true);
    }

    $key = "user_{$userId}_{$method}";
    $file = RATE_LIMIT_DIR . md5($key) . '.json';
    $now = time();

    $handle = fopen($file, 'c+');
    if ($handle === false) {
        error_log("[RateLimit] cannot open {$file}");
        return;
    }
    flock($handle, LOCK_EX);

    $content = stream_get_contents($handle);
    $data = $content ? (json_decode($content, true) ?: []) : [];
    $data['hits'] = array_filter($data['hits'] ?? [], fn($ts) => $ts > $now - $windowSeconds);

    if (count($data['hits']) >= $limit) {
        flock($handle, LOCK_UN);
        fclose($handle);
        rateLimitExceededResponse($windowSeconds);
    }

    $data['hits'][] = $now;
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($data));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function rateLimitExceededResponse(int $windowSeconds): void
{
    http_response_code(429);
    header('Retry-After: ' . $windowSeconds);
    echo json_encode([
        'error' => 'Rate limit exceeded',
        'message' => 'คำขอมากเกินไป กรุณารอสักครู่',
        'retry_after' => $windowSeconds,
    ]);
    exit;
}

/**
 * Global rate limiter applied to all authenticated requests
 *
 * Different limits for read (GET) vs write (POST/PUT/DELETE) operations
 *
 * @return void Exits with 429 if limit exceeded
 */
function rateLimitGlobal(): void
{
    $user = getAuthenticatedUser();
    if (!$user) {
        return;
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $limit = ($method === 'GET') ? 200 : 50;
    $window = 60;

    checkRateLimit($user['user_id'], $method, $limit, $window);
}
