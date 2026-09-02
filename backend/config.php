<?php
// ============================================================================
// Database Configuration
// รองรับทั้ง Docker local (MySQL) และ Production (TiDB Cloud Serverless)
// ============================================================================

// อ่าน env var — ลอง getenv ก่อน ถ้าไม่ได้ลอง $_ENV (Apache อาจ clear getenv)
function env($key, $default = '') {
    return getenv($key) ?: ($_ENV[$key] ?? ($_SERVER[$key] ?? $default));
}

// สร้าง PDO SSL options — fail-closed: เปิด SSL แต่ไม่มี CA = error ไม่ใช่ต่อแบบ insecure เงียบๆ
function buildSslOptions(string $useSSL, string $caPath): array {
    if ($useSSL !== 'true' && $useSSL !== '1') {
        return [];
    }
    if ($caPath === '' || !is_readable($caPath)) {
        throw new RuntimeException('MYSQL_SSL เปิดอยู่แต่ MYSQL_SSL_CA ไม่ได้ตั้งค่าหรืออ่านไม่ได้');
    }
    return [
        PDO::MYSQL_ATTR_SSL_CA                 => $caPath,
        PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => true,
    ];
}

header('Content-Type: application/json; charset=UTF-8');

// ============================================================================
// Timezone Alignment (F26) — PHP + MySQL ต้องเห็นเวลาไทยเดียวกัน
// date()/time() ฝั่ง PHP ใช้ Asia/Bangkok และทุก connection ตั้ง session
// time_zone = +07:00 (ใน attemptDbConnection) — ไม่งั้น remaining_days,
// lockout window ฯลฯ ที่คำนวณจาก NOW() ฝั่ง SQL เทียบ clock ฝั่ง PHP จะเพี้ยน 7 ชม.
// ข้อมูลเก่าแบบ DATETIME (เช่น civil_servant_photos.upload_date) จะถูกตีความ
// เป็นเวลาไทยเฉพาะตอนแสดงผล — ยอมรับได้เฉพาะ display ส่วน TIMESTAMP columns
// (refresh_tokens/login_attempts) MySQL แปลงตาม session tz เองจึงไม่มี skew
// ============================================================================
date_default_timezone_set('Asia/Bangkok');

// JWT Secret — ต้องมาจาก env var เท่านั้น
// ห้ามมี default: ค่า fallback ใน source สาธารณะ = ใครก็ forge token ได้
$jwtSecret = env('JWT_SECRET', '');
// F8: สั้นกว่า 32 ตัวอักษร = brute force ได้จริง ถือว่า config พังเทียบเท่าค่าว่าง
// (fail-closed เช่นเดียวกับ CSP_SUMMARY_TOKEN_MIN_LENGTH ใน routes/csp_summary.php)
if ($jwtSecret === '' || strlen($jwtSecret) < 32) {
    http_response_code(500);
    echo json_encode(['error' => 'Server configuration error']);
    exit;
}
define('JWT_SECRET', $jwtSecret);
// Issue #112: รูปเก็บเป็น bytes ในฐานข้อมูล (civil_servant_photos.file_data) —
// ไม่มี upload directory บน filesystem ของ container แล้ว (ดู ADR-0003)

// ============================================================================
// Lazy PDO Connection
// สร้าง connection เฉพาะเมื่อ route ต้องใช้ DB จริงๆ
// (OPTIONS preflight และ error responses ไม่ต้องรอ TiDB SSL handshake)
// ============================================================================
$pdo = null;

function attemptDbConnection(): ?PDO {
    $host     = env('MYSQL_HOST', 'db');
    $port     = env('MYSQL_PORT', '3306');
    $dbname   = env('MYSQL_DATABASE', 'civil_service_mgmt');
    $username = env('MYSQL_USER', '');
    $password = env('MYSQL_PASSWORD', '');
    // F31: ไม่มี default credential — เคย fallback root/rootpassword ซึ่งเดาได้จาก repo
    // ถ้า env ไม่ถูกตั้งให้พังชัดเจนตั้งแต่ต่อ DB (fail-closed แบบเดียวกับ JWT_SECRET ด้านบน)
    if ($username === '' || $password === '') {
        throw new RuntimeException('MYSQL_USER/MYSQL_PASSWORD ไม่ได้ตั้งค่า — ปฏิเสธการเชื่อมต่อฐานข้อมูล');
    }
    $useSSL   = env('MYSQL_SSL', '');

    // สร้าง DSN — รองรับ port ที่ต่างจาก default (TiDB ใช้ 4000)
    $dsn = "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4";

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    // TiDB Cloud ต้องใช้ SSL — เปิดเมื่อ MYSQL_SSL=true (verify cert จริง, fail-closed)
    $options += buildSslOptions($useSSL, env('MYSQL_SSL_CA', ''));

    // Docker local ใช้ persistent connection ได้ แต่ production ไม่ควรใช้
    if ($host === 'db' || $host === 'localhost' || $host === '127.0.0.1') {
        $options[PDO::ATTR_PERSISTENT] = true;
    }

    // Retry on transient connection failure (TiDB Cloud Serverless cold start)
    $maxRetries = 3;
    $lastException = null;
    $connection = null;
    for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
        try {
            $connection = new PDO($dsn, $username, $password, $options);
            // F26: จับคู่กับ date_default_timezone_set('Asia/Bangkok') ด้านบน —
            // NOW() ฝั่ง SQL กับ clock ฝั่ง PHP จึงชี้เวลาไทยเดียวกัน
            $connection->exec("SET time_zone = '+07:00'");
            $lastException = null;
            break;
        } catch (PDOException $e) {
            $lastException = $e;
            if ($attempt < $maxRetries) {
                usleep(200000);
            }
        }
    }

    if ($lastException !== null) {
        error_log('[db] Connection failed after ' . $maxRetries . ' attempts: ' . $lastException->getMessage());
        return null;
    }

    return $connection;
}

// Issue #124: probe แบบไม่ exit — readyz ใช้เพื่อคืน documented not_ready shape
// เองเมื่อ DB ต่อไม่ได้ (getDB() จะ exit ก่อนถึง handler เสมอ)
function tryGetDB(): ?PDO {
    global $pdo;
    if ($pdo !== null) {
        return $pdo;
    }

    // F31/T39: RuntimeException (env credential ขาด) ต้องไม่ทะลุออกนอก — readyz
    // อาศัย null คืน documented not_ready shape (Issue #124) ส่วน getDB() ค่อย exit
    // ด้วยข้อความ fail-closed เดิม
    try {
        $pdo = attemptDbConnection();
    } catch (RuntimeException $e) {
        error_log('[db] ' . $e->getMessage());
        return null;
    }
    return $pdo;
}

function getDB(): PDO {
    $db = tryGetDB();
    if ($db !== null) {
        return $db;
    }

    $host = env('MYSQL_HOST', 'db');
    $isLocal = in_array($host, ['db', 'localhost', '127.0.0.1'], true);
    $msg = $isLocal
        ? 'Database connection failed (check docker compose db service)'
        : 'Database connection failed';
    http_response_code(503);
    echo json_encode(['error' => $msg]);
    exit;
}
