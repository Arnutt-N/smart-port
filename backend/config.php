<?php
// ============================================================================
// Database Configuration
// รองรับทั้ง Docker local (MySQL) และ Production (TiDB Cloud Serverless)
// ============================================================================

// อ่าน env var — ลอง getenv ก่อน ถ้าไม่ได้ลอง $_ENV (Apache อาจ clear getenv)
function env($key, $default = '') {
    return getenv($key) ?: ($_ENV[$key] ?? ($_SERVER[$key] ?? $default));
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

// TiDB Cloud ต้องใช้ SSL — เปิดเมื่อตั้ง MYSQL_SSL=true
if ($useSSL === 'true' || $useSSL === '1') {
    $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = false;
    $options[PDO::MYSQL_ATTR_SSL_CA] = '';
}

// Docker local ใช้ persistent connection ได้ แต่ production ไม่ควรใช้
if ($host === 'db' || $host === 'localhost' || $host === '127.0.0.1') {
    $options[PDO::ATTR_PERSISTENT] = true;
}

try {
    $pdo = new PDO($dsn, $username, $password, $options);
} catch (PDOException $e) {
    header('Content-Type: application/json');
    $msg = ($host === 'db' || $host === 'localhost')
        ? 'Connection failed: ' . $e->getMessage()
        : 'Database connection failed';
    echo json_encode(['error' => $msg]);
    exit;
}

header('Content-Type: application/json');

// JWT Secret — อ่านจาก env var ก่อน ถ้าไม่มีใช้ค่า default (dev only)
define('JWT_SECRET', env('JWT_SECRET', 'your_secret_key_here'));
define('UPLOAD_DIR', __DIR__ . '/uploads/');
