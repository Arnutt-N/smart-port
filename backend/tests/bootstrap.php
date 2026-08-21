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
require_once __DIR__ . '/../SyncTransformService.php';

/**
 * ตรวจว่า host ที่ integration test จะต่อเป็น DB ในเครื่อง/ใน CI จริง
 *
 * ทำไมต้องมี: เทสใน `tests/Integration/` **เขียนข้อมูลจริง** (INSERT/UPDATE/DELETE เช่น
 * `AdminSeedUpsertTest` ที่ upsert แถว admin แล้วลบทิ้ง) และ `testPdo()` อ่าน `MYSQL_HOST`
 * จาก env ตรง ๆ — ถ้าใครมี env ชี้ production ค้างอยู่ในเชลล์เดียวกันแล้วรัน phpunit
 * เทสจะเขียนลง production **โดยไม่มีสัญญาณเตือนใด ๆ** ซึ่งเป็นความเสี่ยงที่ code review
 * บันทึกไว้ (M-2) · ต่อไม่ได้ = skip ได้ แต่ต่อ**ผิดที่**ต้องหยุด ไม่ใช่ปล่อยผ่าน
 *
 * ค่าที่ทางเข้าทุกทางใช้จริง: `db` (docker compose และ default ของฟังก์ชันนี้) ·
 * `host.docker.internal` (`run.sh` ตอน WSL แยกจาก Docker Desktop) · `127.0.0.1` (ci.yml)
 *
 * @throws RuntimeException เมื่อ host ไม่ใช่ของในเครื่องและไม่ได้ตั้ง ALLOW_REMOTE_TEST_DB=1
 */
function assertLocalTestDbHost(string $host): void
{
    $localHosts = ['db', 'localhost', '127.0.0.1', '::1', 'host.docker.internal', 'mysql', 'mariadb', 'smartport-db'];
    if (in_array(strtolower(trim($host)), $localHosts, true)) {
        return;
    }
    if (getenv('ALLOW_REMOTE_TEST_DB') === '1') {
        return;
    }

    throw new RuntimeException(
        "ปฏิเสธการต่อ MYSQL_HOST=\"{$host}\" — integration test เขียนข้อมูลจริง จึงต่อได้เฉพาะ DB "
        . 'ในเครื่องหรือใน CI เท่านั้น (' . implode(', ', $localHosts) . ') '
        . 'ถ้าตั้งใจชี้ไป host อื่นจริง ๆ ให้ตั้ง ALLOW_REMOTE_TEST_DB=1 เพื่อให้เห็นชัดว่าเป็นการตัดสินใจ'
    );
}

/**
 * สร้าง PDO สำหรับ integration test — อ่าน env เดียวกับ config.php::getDB()
 * แต่ "คืน null แทนการ exit" เมื่อต่อไม่ได้ เพื่อให้ integration test markTestSkipped ได้
 * (unit suite ไม่เรียกฟังก์ชันนี้ → รันได้แม้ไม่มี DB)
 *
 * **การต่อไม่ได้กับการต่อผิดที่ถูกแยกกันโดยตั้งใจ**: ต่อไม่ได้คืน null (เทส skip)
 * ส่วน host ที่ไม่ใช่ของในเครื่อง throw ทันทีตั้งแต่ก่อนเปิด connection
 *
 * @return PDO|null connection หรือ null ถ้าต่อ database ไม่ได้
 */
function testPdo(): ?PDO
{
    $host   = getenv('MYSQL_HOST') ?: 'db';
    assertLocalTestDbHost($host);
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

/**
 * Build a checksum-valid 13-digit citizen_id from a 12-digit stem (test data only).
 */
function testCitizenId(string $first12): string
{
    if (!preg_match('/^\d{12}$/', $first12)) {
        throw new InvalidArgumentException('testCitizenId expects exactly 12 digits');
    }
    for ($d = 0; $d <= 9; $d++) {
        $id = $first12 . (string) $d;
        if (isValidCitizenId($id)) {
            return $id;
        }
    }
    throw new RuntimeException('no valid Thai citizen-id check digit for stem');
}
