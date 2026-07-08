<?php
/**
 * Rate Limiting Middleware
 * File-based sliding window (no Redis dependency)
 *
 * Implementation: Sliding window counter using JSON files
 * Each user-method combination gets its own file for concurrent access safety
 */

define('RATE_LIMIT_DIR', __DIR__ . '/../storage/rate_limits/');

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
    if (!is_dir(RATE_LIMIT_DIR)) {
        mkdir(RATE_LIMIT_DIR, 0775, true);
    }

    $key = "user_{$userId}_{$method}";
    $file = RATE_LIMIT_DIR . md5($key) . '.json';
    $now = time();

    // เปิดไฟล์ครั้งเดียวแล้วถือ exclusive lock ตลอด read+check+write
    // กัน race condition (TOCTOU) เมื่อ request พร้อมกันจาก user เดียวกันมาถึงพร้อมกัน
    $handle = fopen($file, 'c+');
    if ($handle === false) {
        error_log("[RateLimit] cannot open {$file}");
        return; // fail-open: filesystem error ไม่ควรบล็อก request จริง
    }
    flock($handle, LOCK_EX);

    $content = stream_get_contents($handle);
    $data = $content ? (json_decode($content, true) ?: []) : [];

    // ลบ timestamps เก่าที่เกิน window (sliding window cleanup)
    $data['hits'] = array_filter($data['hits'] ?? [], fn($ts) => $ts > $now - $windowSeconds);

    // ตรวจนับจำนวน requests ใน window
    if (count($data['hits']) >= $limit) {
        flock($handle, LOCK_UN);
        fclose($handle);
        http_response_code(429);
        header('Retry-After: ' . $windowSeconds);
        echo json_encode([
            'error' => 'Rate limit exceeded',
            'message' => 'คำขอมากเกินไป กรุณารอสักครู่',
            'retry_after' => $windowSeconds
        ]);
        exit;
    }

    // เพิ่ม hit ใหม่ แล้วเขียนทับทั้งไฟล์ขณะยังถือ lock อยู่
    $data['hits'][] = $now;
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($data));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
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
        return; // ให้ผ่าน JWT validation ก่อน
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $limit = ($method === 'GET') ? 200 : 50; // GET อ่านได้มาก, POST/PUT/DELETE น้อย
    $window = 60; // 1 นาที

    checkRateLimit($user['user_id'], $method, $limit, $window);
}
