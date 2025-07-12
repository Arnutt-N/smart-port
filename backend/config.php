<?php
// สำหรับมือใหม่: ไฟล์นี้เชื่อมต่อฐานข้อมูล – เปลี่ยน user/pass ให้ตรงกับเครื่องคุณ
$host = 'localhost';
$db = 'civil_service_mgmt';
$user = 'root';
$pass = '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}

define('JWT_SECRET', 'your_secret_key_here'); // เปลี่ยนเป็นรหัสลับจริง
define('UPLOAD_DIR', __DIR__ . '/uploads/'); // Folder สำหรับภาพ
?>