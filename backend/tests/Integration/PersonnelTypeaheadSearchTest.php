<?php
declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

putenv('JWT_SECRET=integration-test-secret');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/personnel.php';

/**
 * GET /personnel typeahead — ค้นด้วยชื่อ / ชื่อเต็ม / รหัสพนักงาน ต้องเจอคนที่ active
 */
final class PersonnelTypeaheadSearchTest extends TestCase
{
    private static ?PDO $pdo = null;
    private int $personnelId = 0;
    private int $prefixId = 0;
    private string $firstName = '';
    private string $lastName = '';
    private string $employeeId = '';

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        foreach (['personnel', 'prefixes'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table}");
            }
        }

        $suffix = bin2hex(random_bytes(3));
        $this->firstName = 'TA' . $suffix;
        $this->lastName = 'TB' . $suffix;
        $this->employeeId = 'E' . $suffix;

        self::$pdo->prepare(
            'INSERT INTO prefixes (prefix_code, prefix_name_th) VALUES (?, ?)'
        )->execute(['P' . $suffix, 'นาย']);
        $this->prefixId = (int) self::$pdo->lastInsertId();

        self::$pdo->prepare(
            'INSERT INTO personnel (first_name, last_name, prefix_id, employee_id, is_active)
             VALUES (?, ?, ?, ?, 1)'
        )->execute([$this->firstName, $this->lastName, $this->prefixId, $this->employeeId]);
        $this->personnelId = (int) self::$pdo->lastInsertId();
    }

    protected function tearDown(): void
    {
        if (self::$pdo === null) {
            return;
        }
        if ($this->personnelId) {
            self::$pdo->prepare('DELETE FROM personnel WHERE personnel_id = ?')
                ->execute([$this->personnelId]);
        }
        if ($this->prefixId) {
            self::$pdo->prepare('DELETE FROM prefixes WHERE prefix_id = ?')
                ->execute([$this->prefixId]);
        }
    }

    #[Test]
    public function search_by_first_name_returns_row_with_prefix_full_name(): void
    {
        $rows = searchPersonnelTypeahead(self::$pdo, $this->firstName, 10);

        self::assertNotEmpty($rows);
        self::assertSame($this->personnelId, (int) $rows[0]['personnel_id']);
        self::assertSame('นาย' . $this->firstName . ' ' . $this->lastName, $rows[0]['full_name']);
    }

    #[Test]
    public function search_by_full_name_as_shown_in_ui_matches(): void
    {
        $full = 'นาย' . $this->firstName . ' ' . $this->lastName;
        $rows = searchPersonnelTypeahead(self::$pdo, $full, 10);

        self::assertCount(1, $rows);
        self::assertSame($this->personnelId, (int) $rows[0]['personnel_id']);
    }

    #[Test]
    public function search_by_employee_id_matches(): void
    {
        $rows = searchPersonnelTypeahead(self::$pdo, $this->employeeId, 10);

        self::assertCount(1, $rows);
        self::assertSame($this->personnelId, (int) $rows[0]['personnel_id']);
    }

    #[Test]
    public function inactive_personnel_are_excluded(): void
    {
        self::$pdo->prepare('UPDATE personnel SET is_active = 0 WHERE personnel_id = ?')
            ->execute([$this->personnelId]);

        $rows = searchPersonnelTypeahead(self::$pdo, $this->firstName, 10);
        self::assertSame([], $rows);
    }

    #[Test]
    public function empty_query_returns_empty_without_querying_wildcards(): void
    {
        self::assertSame([], searchPersonnelTypeahead(self::$pdo, '   ', 10));
    }
}
