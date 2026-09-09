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

// ============================================================================
// Issue #122: rate limit สำหรับ endpoint public (readyz / csp-report / uploads)
// — key ด้วย IP ไม่ใช่ user_id และไม่แตะ DB เลย:
//   การ probe DB ตอน outage คือ amplification vector ที่ต้องการกัน
// ============================================================================

/**
 * IP ของ client — last hop ของ X-Forwarded-For เมื่อ REMOTE_ADDR ของ host ที่ใช้
 * เป็น "trusted proxy" ตาม TRUSTED_PROXIES env
 *
 * ขั้น 10 S1 review: ใช้ XFF แบบไม่เช็ค REMOTE_ADDR = ใครเข้าถึง backend ตรง ๆ (dev,
 * หลัง LB ที่ reverse ได้) สุ่ม XFF เพื่อหลบ rate limit ได้ทุก request → ต้อง whitelist
 *
 * โทพอลอจีที่ตั้งค่าเอาไว้: Render edge proxy → Apache (php:8.3-apache, ไม่มี mod_remoteip)
 * REMOTE_ADDR ที่ PHP เห็น = IP ของ Render edge — ดังนั้น:
 *  - TRUSTED_PROXIES set + REMOTE_ADDR อยู่ในรายการ → เชื่อ last hop ของ XFF
 *    (Render append IP จริง client ท้าย XFF เสมอ — hop แรก/กลางใด ๆ เป็นค่าที่ client ปลอมได้)
 *  - REMOTE_ADDR ไม่ trusted → ใช้ REMOTE_ADDR ตรง ๆ (dev localhost ต่อตรง: ไม่มี XFF
 *    ถูกนำมาตีความ แม้ส่ง header ปลอมมาก็ไม่เปลี่ยน key ของ rate limit)
 *
 * env: TRUSTED_PROXIES = comma-separated IPs/CIDRs (เว้นว่าง = ไม่เชื่อ XFF ทุกกรณี)
 * (ห้าม end(explode(...)) ตรง ๆ — PHP 8.3 notice: Only variables should be passed by reference)
 */
function publicClientIp(): string
{
    $remoteAddr = (string) ($_SERVER['REMOTE_ADDR'] ?? '');

    // REMOTE_ADDR ที่ไม่ trusted → ใช้เลย (dev / ต่อตรง / whitelist ไม่ตั้ง)
    if (!remoteAddrIsTrustedProxy($remoteAddr)) {
        return $remoteAddr !== '' ? $remoteAddr : 'unknown';
    }


    $forwarded = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    if ($forwarded !== '') {
        $hops = array_map('trim', explode(',', $forwarded));
        $ip = end($hops);
        if (is_string($ip) && $ip !== '' && preg_match('/^[0-9a-fA-F:.]{7,45}$/', $ip) === 1) {
            return $ip;
        }
    }

    // trusted proxy แต่ไม่มี XFF ใช้ได้ — ยอมรับ key ร่วมของ proxy กลุ่มเดียว
    // (โทพอล Render: ทุก connection จริงมาจาก edge เสมอ จึงเหมือน shared bucket)
    return $remoteAddr !== '' ? $remoteAddr : 'unknown';
}

/**
 * เช็ค REMOTE_ADDR อยู่ใน TRUSTED_PROXIES (exact IP หรือ CIDR IPv4) หรือไม่
 * parse เมื่อเรียกเท่านั้น — แคช static เพราะ header เดิมทั้ง request
 */
function remoteAddrIsTrustedProxy(string $remoteAddr): bool
{
    static $cachedFor = null;
    static $cachedVal = false;

    if ($cachedFor === $remoteAddr) {
        return $cachedVal;
    }

    if ($remoteAddr === '' || !filter_var($remoteAddr, FILTER_VALIDATE_IP)) {
        // ไม่ cache ค่า output ไว้เมื่อ REMOTE_ADDR ไม่ใช่ IP (เช่น '' จาก tearDown)
        // เพื่อให้เทสที่ set/unset REMOTE_ADDR ไล่กันได้ — mark cache miss โดยเทียบกับค่าล้ำหน้า
        return false;
    }

    $trusted = array_map('trim', explode(',', (string) getenv('TRUSTED_PROXIES') ?: ''));
    $isTrusted = false;
    foreach ($trusted as $entry) {
        if ($entry === '') {
            continue;
        }
        if ($entry === $remoteAddr) {
            $isTrusted = true;
            break;
        }
        // CIDR /24 /64 — ใช้ filter_var ธรรมดา ไม่พึ่ง extension เพิ่ม
        if (str_contains($entry, '/') && ipInCidr($remoteAddr, $entry)) {
            $isTrusted = true;
            break;
        }
    }

    // แคชเฉพาะกรณีที่ env เปลี่ยนไม่สไตล์ runtime — ค่า get ก่อนหน้าใช้ซ้ำได้
    $cachedVal = $isTrusted;
    return $isTrusted;
}

/** IPv4 CIDR เท่านั้น (IPv6 ไม่ใช้ใน render topology — ระบุ exact IP) */
function ipInCidr(string $ip, string $cidr): bool
{
    [$subnet, $bits] = array_pad(explode('/', $cidr, 2), 2, null);
    if ($bits === null || filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) === false) {
        return false;
    }
    $bits = (int) $bits;
    if ($bits < 0 || $bits > 32) {
        return false;
    }
    $ipLong = ip2long($ip);
    $subnetLong = ip2long($subnet);
    if ($ipLong === false || $subnetLong === false) {
        return false;
    }
    $mask = $bits === 0 ? 0 : (-1 << (32 - $bits)) & 0xFFFFFFFF;
    return ($ipLong & $mask) === ($subnetLong & $mask);
}

/**
 * File-based sliding window สำหรับ public endpoint — คืน bool (ไม่ exit) เพื่อ test ได้
 * บันทึก hit เฉพาะตอนยังไม่เกิน limit — ช่วงถูก flood window จะได้ไม่บวมไปเรื่อย
 */
function publicRateLimitWithin(string $bucket, int $limit, int $windowSeconds, ?string $ip = null): bool
{
    if (!is_dir(RATE_LIMIT_DIR)) {
        mkdir(RATE_LIMIT_DIR, 0775, true);
    }

    $key = 'public_' . ($ip ?? publicClientIp()) . '_' . $bucket;
    $file = RATE_LIMIT_DIR . md5($key) . '.json';
    $now = time();

    $handle = fopen($file, 'c+');
    if ($handle === false) {
        error_log("[RateLimit] cannot open {$file}");
        return true; // fail-open — ปิด rate limit ดีกว่าปิด service ทั้งก้อน
    }
    flock($handle, LOCK_EX);

    $content = stream_get_contents($handle);
    $data = $content ? (json_decode($content, true) ?: []) : [];
    $data['hits'] = array_filter($data['hits'] ?? [], fn($ts) => $ts > $now - $windowSeconds);

    $within = count($data['hits']) < $limit;
    if ($within) {
        $data['hits'][] = $now;
    }

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($data));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    // N43: prune ไฟล์ไร้ hit ล่าสุด — เดิมไฟล์ค้างตลอดชีวิตทำ disk โตไม่จำกัด
    // (สุ่ม 1/50 เรียก + ลบเฉพาะไฟล์ที่ hits[] ว่างเกิน window — ต่ำพอไม่กลาดต่อ latency)
    if (random_int(1, 50) === 1) {
        pruneRateLimitFiles($now);
    }

    return $within;
}

/**
 * ลบไฟล์ state ของ public rate limiter ที่ไม่มี hit อยู่ใน window (ประหยัด disk)
 * — เรียกสุ่มจาก publicRateLimitWithin ไม่ใช่ cron — ไม่ต้อง perfect: เหลือไฟล์
 * ช่องโหว่อะไรไม่ได้ เพราะ hit ถัดไปจะเขียนทับ
 *
 * @param int $now timestamp ตอนเรียก
 */
function pruneRateLimitFiles(int $now): void
{
    $files = glob(RATE_LIMIT_DIR . '*.json') ?: [];
    foreach ($files as $file) {
        $content = @file_get_contents($file);
        if ($content === false) {
            continue;
        }
        $data = json_decode($content, true);
        if (!is_array($data)) {
            @unlink($file); // พัง/ว่าง — ลบเป็น garbage
            continue;
        }
        // "ล่าสุด" = max(hits) — ไฟล์ที่ไม่มี hit เลยว่างเปล่าอยู่แล้ว = ลบได้
        $lastHit = 0;
        foreach ((array) ($data['hits'] ?? []) as $ts) {
            $lastHit = max($lastHit, (int) $ts);
        }
        if ($lastHit === 0 || $now - $lastHit > 3600) {
            @unlink($file);
        }
    }
}

/**
 * Wrapper ที่ exit 429 เมื่อเกิน limit (เรียกจาก api.php สำหรับเส้นทาง public)
 */
function checkRateLimitPublic(string $bucket, int $limit, int $windowSeconds): void
{
    if (!publicRateLimitWithin($bucket, $limit, $windowSeconds)) {
        rateLimitExceededResponse($windowSeconds);
    }
}
