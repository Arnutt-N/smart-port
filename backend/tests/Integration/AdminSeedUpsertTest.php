<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * คุม invariant ของ seed admin ใน database/09-auth-users.sql และ database/tidb-init.sql
 *
 * บั๊กที่เทสชุดนี้กันไม่ให้กลับมา: เดิม upsert เขียน password_hash ทับทุกครั้ง
 * แปลว่า "รัน migration ซ้ำ = รีเซ็ตรหัสผ่าน admin ของ production กลับไปเป็นค่า
 * bootstrap ที่อยู่ใน repo สาธารณะ" โดยไม่มีสัญญาณเตือนใด ๆ
 *
 * เทสอ่านคำสั่ง ON DUPLICATE KEY UPDATE จากไฟล์ .sql จริง (anti-drift) แล้วรันกับ
 * ผู้ใช้ทดสอบแยกแถว เพื่อไม่ไปแตะแถว admin ที่เทสอื่นและ e2e ใช้ล็อกอิน
 *
 * คลาสนี้เก็บเฉพาะเทส "พฤติกรรมบน DB จริง" เท่านั้น — guard แบบ static
 * (clause ของสองไฟล์ตรงกัน, ไม่มีรหัสผ่าน plaintext) อยู่ที่
 * scripts/tests/admin-seed-guards.test.mjs ซึ่งรันได้โดยไม่ต้องมี MySQL
 */
final class AdminSeedUpsertTest extends TestCase
{
    private const MIGRATION_FILE = __DIR__ . '/../../../database/09-auth-users.sql';
    private const TEST_USERNAME = 'seed-upsert-probe-999';

    private static ?PDO $pdo = null;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    /**
     * ทุกเทสในคลาสนี้ต้องใช้ DB จริง — ถ้าจะเพิ่มเทสที่ไม่ต้องใช้ DB
     * อย่าใส่ที่นี่ เพราะ setUp() skip ทั้งคลาสเมื่อต่อ MySQL ไม่ได้
     * ให้ไปเพิ่มที่ scripts/tests/admin-seed-guards.test.mjs แทน
     */
    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db');
        }
        $this->deleteProbeRow();
    }

    protected function tearDown(): void
    {
        if (self::$pdo !== null) {
            $this->deleteProbeRow();
        }
    }

    private function deleteProbeRow(): void
    {
        $stmt = self::$pdo->prepare('DELETE FROM users WHERE username = ?');
        $stmt->execute([self::TEST_USERNAME]);
    }

    /** อ่านไฟล์ .sql แล้วคืนค่าเป็น LF เสมอ (ไฟล์ในโปรเจกต์เป็น CRLF) */
    private static function readSql(string $path): string
    {
        $raw = file_get_contents($path);
        if ($raw === false) {
            throw new RuntimeException("อ่านไฟล์ไม่ได้: {$path}");
        }

        return str_replace("\r\n", "\n", $raw);
    }

    /** ดึงคำสั่งหลัง ON DUPLICATE KEY UPDATE ของ seed admin ออกมาจากไฟล์จริง */
    private static function extractUpsertClause(string $path): string
    {
        $sql = self::readSql($path);
        $matched = preg_match(
            '/INSERT INTO users \(username, password_hash.*?ON DUPLICATE KEY UPDATE(.*?);/s',
            $sql,
            $m
        );
        if ($matched !== 1) {
            throw new RuntimeException("หา seed admin ใน {$path} ไม่เจอ — โครงไฟล์เปลี่ยนไป");
        }

        return trim($m[1]);
    }

    /** ดึง hash ที่ไฟล์ seed ใช้จริง แทนการ hardcode ในเทส */
    private static function extractSeedHash(string $path): string
    {
        $sql = self::readSql($path);
        $matched = preg_match(
            "/INSERT INTO users \(username, password_hash.*?VALUES \('admin', '([^']+)'/s",
            $sql,
            $m
        );
        if ($matched !== 1) {
            throw new RuntimeException("หา seed hash ใน {$path} ไม่เจอ");
        }

        return $m[1];
    }

    /**
     * รัน upsert เดียวกับ migration แต่เปลี่ยน username เป็นแถวทดสอบ
     * คำสั่งส่วน ON DUPLICATE KEY UPDATE มาจากไฟล์ .sql จริงทั้งดุ้น
     */
    private function runSeedUpsert(string $hash, string $fullName = 'ผู้ดูแลระบบ'): void
    {
        $clause = self::extractUpsertClause(self::MIGRATION_FILE);
        $sql = 'INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)'
            . " VALUES (:username, :hash, :full_name, 'admin', 1, 1)\n"
            . "ON DUPLICATE KEY UPDATE\n" . $clause;

        $stmt = self::$pdo->prepare($sql);
        $stmt->execute([
            ':username'  => self::TEST_USERNAME,
            ':hash'      => $hash,
            ':full_name' => $fullName,
        ]);
    }

    /** @return array<string, mixed> */
    private function fetchProbeRow(): array
    {
        $stmt = self::$pdo->prepare(
            'SELECT password_hash, full_name, is_active, must_change_password
             FROM users WHERE username = ?'
        );
        $stmt->execute([self::TEST_USERNAME]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $this->assertIsArray($row, 'ไม่พบแถวทดสอบหลังรัน upsert');

        return $row;
    }

    #[Test]
    public function seeds_admin_row_when_none_exists(): void
    {
        $seedHash = self::extractSeedHash(self::MIGRATION_FILE);

        $this->runSeedUpsert($seedHash);

        $row = $this->fetchProbeRow();
        $this->assertSame($seedHash, $row['password_hash'], 'ติดตั้งใหม่ต้องได้รหัส bootstrap เพื่อกัน lock-out');
        $this->assertSame(1, (int) $row['must_change_password'], 'ติดตั้งใหม่ต้องถูกบังคับให้เปลี่ยนรหัส');
        $this->assertSame(1, (int) $row['is_active']);
    }

    #[Test]
    public function rerun_does_not_reset_password_that_operator_already_changed(): void
    {
        $seedHash = self::extractSeedHash(self::MIGRATION_FILE);
        $this->runSeedUpsert($seedHash);

        // จำลองผู้ดูแลเปลี่ยนรหัสผ่านเองหลัง deploy
        $operatorHash = password_hash('rotated-by-operator-' . bin2hex(random_bytes(6)), PASSWORD_BCRYPT);
        $update = self::$pdo->prepare(
            'UPDATE users SET password_hash = ?, must_change_password = 0, full_name = ? WHERE username = ?'
        );
        $update->execute([$operatorHash, 'ชื่อที่ผู้ดูแลตั้งเอง', self::TEST_USERNAME]);

        // รัน migration ซ้ำ (เช่น re-deploy / import ทับ)
        $this->runSeedUpsert($seedHash);

        $row = $this->fetchProbeRow();
        $this->assertSame(
            $operatorHash,
            $row['password_hash'],
            'รัน migration ซ้ำต้องไม่รีเซ็ตรหัสผ่านกลับไปเป็นค่า bootstrap สาธารณะ'
        );
        $this->assertSame(0, (int) $row['must_change_password'], 'ต้องไม่ปลุกธงบังคับเปลี่ยนรหัสซ้ำ');
        $this->assertSame(
            'ผู้ดูแลระบบ',
            $row['full_name'],
            'full_name ถูกเขียนทับเสมอโดยตั้งใจ — เป็นตัวซ่อมชื่อที่เพี้ยนจาก dump เก่าตอน import ทับ '
            . 'ถ้าจะเปลี่ยนให้ปกป้องชื่อที่ผู้ดูแลตั้งเอง ต้องเป็นงานแยกที่ตัดสินใจโดยรู้ตัว'
        );
    }

    #[Test]
    public function fills_password_when_existing_row_has_no_usable_hash(): void
    {
        $seedHash = self::extractSeedHash(self::MIGRATION_FILE);

        foreach ([null, ''] as $emptyValue) {
            $this->deleteProbeRow();
            $insert = self::$pdo->prepare(
                "INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)
                 VALUES (?, ?, NULL, 'admin', 1, 0)"
            );
            $insert->execute([self::TEST_USERNAME, $emptyValue]);

            $this->runSeedUpsert($seedHash);

            $row = $this->fetchProbeRow();
            $label = $emptyValue === null ? 'NULL' : 'ว่าง';
            $this->assertSame($seedHash, $row['password_hash'], "แถวที่ hash เป็น {$label} ต้องถูกเติมรหัส bootstrap (กัน lock-out)");
            $this->assertSame(1, (int) $row['must_change_password'], "แถวที่ hash เป็น {$label} ต้องถูกบังคับเปลี่ยนรหัส");
            $this->assertSame('ผู้ดูแลระบบ', $row['full_name'], 'ชื่อที่ยังว่างต้องถูกเติมให้');
        }
    }

    #[Test]
    public function rerun_reactivates_disabled_admin_by_design(): void
    {
        $seedHash = self::extractSeedHash(self::MIGRATION_FILE);
        $this->runSeedUpsert($seedHash);

        $disable = self::$pdo->prepare('UPDATE users SET is_active = 0 WHERE username = ?');
        $disable->execute([self::TEST_USERNAME]);

        $this->runSeedUpsert($seedHash);

        $row = $this->fetchProbeRow();
        $this->assertSame(
            1,
            (int) $row['is_active'],
            'is_active = 1 เสมอเป็นพฤติกรรมที่ตั้งใจ (กัน lock-out) — ถ้าจะเปลี่ยนต้องเป็นการตัดสินใจโดยรู้ตัว'
        );
    }

}
