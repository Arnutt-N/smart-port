<?php

declare(strict_types=1);

// ============================================================================
// PHPUnit bootstrap — Smart Port backend
// โหลด composer autoloader (test classes ผ่าน PSR-4 Tests\) + source ที่เป็น
// global namespace (helpers.php / QualificationEngine.php ไม่มี PSR-4 → require ตรง)
// ============================================================================

require_once __DIR__ . '/../vendor/autoload.php';

// Source files อยู่ใน global namespace (โค้ดเดิมใช้ include_once) — โหลดเอง
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../QualificationEngine.php';
require_once __DIR__ . '/../ImportService.php';

/**
 * สร้าง PDO สำหรับ integration test — อ่าน env เดียวกับ config.php::getDB()
 * แต่ "คืน null แทนการ exit" เมื่อต่อไม่ได้ เพื่อให้ integration test markTestSkipped ได้
 * (unit suite ไม่เรียกฟังก์ชันนี้ → รันได้แม้ไม่มี DB)
 *
 * @return PDO|null connection หรือ null ถ้าต่อ database ไม่ได้
 */
function testPdo(): ?PDO
{
    $host   = getenv('MYSQL_HOST') ?: 'db';
    $port   = getenv('MYSQL_PORT') ?: '3306';
    $dbname = getenv('MYSQL_DATABASE') ?: 'civil_service_mgmt';
    $user   = getenv('MYSQL_USER') ?: 'root';
    $pass   = getenv('MYSQL_PASSWORD');
    if ($pass === false) {
        $pass = 'rootpassword';
    }

    $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";

    try {
        return new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_TIMEOUT            => 4,
        ]);
    } catch (PDOException $e) {
        return null;
    }
}
