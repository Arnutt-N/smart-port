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

// JWT Secret — ต้องมาจาก env var เท่านั้น
// ห้ามมี default: ค่า fallback ใน source สาธารณะ = ใครก็ forge token ได้
$jwtSecret = env('JWT_SECRET', '');
if ($jwtSecret === '') {
    http_response_code(500);
    echo json_encode(['error' => 'Server configuration error']);
    exit;
}
define('JWT_SECRET', $jwtSecret);
define('UPLOAD_DIR', __DIR__ . '/uploads/');

// ============================================================================
// Lazy PDO Connection
// สร้าง connection เฉพาะเมื่อ route ต้องใช้ DB จริงๆ
// (OPTIONS preflight และ error responses ไม่ต้องรอ TiDB SSL handshake)
// ============================================================================
$pdo = null;

function getDB(): PDO {
    global $pdo;
    if ($pdo !== null) {
        return $pdo;
    }

    $host     = env('MYSQL_HOST', 'db');
    $port     = env('MYSQL_PORT', '3306');
    $dbname   = env('MYSQL_DATABASE', 'civil_service_mgmt');
    $username = env('MYSQL_USER', 'root');
    $password = env('MYSQL_PASSWORD', 'rootpassword');
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
    for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
        try {
            $pdo = new PDO($dsn, $username, $password, $options);
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
        $isLocal = in_array($host, ['db', 'localhost', '127.0.0.1'], true);
        $msg = $isLocal
            ? 'Database connection failed (check docker compose db service)'
            : 'Database connection failed';
        http_response_code(503);
        echo json_encode(['error' => $msg]);
        exit;
    }

    return $pdo;
}
