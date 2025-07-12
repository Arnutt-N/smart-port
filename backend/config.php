<?php
$host = getenv('MYSQL_HOST') ?: 'db';  // Default to 'db' if not set
$dbname = getenv('MYSQL_DATABASE') ?: 'smartport_db';
$username = getenv('MYSQL_USER') ?: 'root';
$password = getenv('MYSQL_PASSWORD') ?: 'rootpassword';

$dsn = "mysql:host=$host;dbname=$dbname;charset=utf8mb4";
$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

try {
    $pdo = new PDO($dsn, $username, $password, $options);
} catch (PDOException $e) {
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Connection failed: ' . $e->getMessage()]);
    exit;
}

header('Content-Type: application/json');

define('JWT_SECRET', 'your_secret_key_here'); // เปลี่ยนเป็นรหัสลับจริง
define('UPLOAD_DIR', __DIR__ . '/uploads/'); // Folder สำหรับภาพ
