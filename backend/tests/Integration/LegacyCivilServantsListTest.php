<?php
declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/personnel.php';

/**
 * HTTP-contract ของ legacy GET /civil-servants (Issue #110):
 * operator/viewer ต้องไม่เคยได้รับ citizen_id — admin/superadmin ยังเห็นเหมือนเดิม
 * และค้นหาด้วยเลขบัตรประชาชนได้โดยไม่ echo ค่ากลับ
 */
final class LegacyCivilServantsListTest extends TestCase
{
    private static ?PDO $pdo = null;
    private string $suffix = '';
    private int $personnelId = 0;
    private int $prefixId = 0;
    private string $citizenId = '';

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

        $this->suffix = bin2hex(random_bytes(3));
        $this->citizenId = '9' . $this->suffix . str_repeat('0', max(0, 12 - strlen($this->suffix) - 1));

        self::$pdo->prepare(
            'INSERT INTO prefixes (prefix_code, prefix_name_th) VALUES (?, ?)'
        )->execute(['L' . $this->suffix, 'นาย']);
        $this->prefixId = (int) self::$pdo->lastInsertId();

        self::$pdo->prepare(
            'INSERT INTO personnel (citizen_id, first_name, last_name, prefix_id, employee_id, is_active)
             VALUES (?, ?, ?, ?, ?, 1)'
        )->execute([
            $this->citizenId,
            'ทดสอบ' . $this->suffix,
            'นามสกุล' . $this->suffix,
            $this->prefixId,
            'E' . $this->suffix,
        ]);
        $this->personnelId = (int) self::$pdo->lastInsertId();
    }

    protected function tearDown(): void
    {
        if (self::$pdo === null) {
            return;
        }
        if ($this->personnelId > 0) {
            self::$pdo->prepare('DELETE FROM personnel WHERE personnel_id = ?')->execute([$this->personnelId]);
        }
        if ($this->prefixId > 0) {
            self::$pdo->prepare('DELETE FROM prefixes WHERE prefix_id = ?')->execute([$this->prefixId]);
        }
    }

    /**
     * @return array<string, mixed>|null row ของ seed ตาม personnel_id
     */
    private function seededRow(array $payload): ?array
    {
        foreach ($payload['data'] as $row) {
            if ((int) ($row['servant_id'] ?? 0) === $this->personnelId) {
                return $row;
            }
        }
        return null;
    }

    #[Test]
    public function citizen_id_present_only_for_admin_and_superadmin(): void
    {
        foreach (['admin', 'superadmin'] as $role) {
            $payload = legacyCivilServantsList(self::$pdo, $role, '', 200, 0);
            $row = $this->seededRow($payload);
            self::assertNotNull($row, "role {$role} ต้องเห็น seeded row");
            self::assertArrayHasKey('citizen_id', $row, "role {$role} ต้องได้ citizen_id");
            self::assertSame($this->citizenId, $row['citizen_id']);
        }

        foreach (['operator', 'viewer'] as $role) {
            $payload = legacyCivilServantsList(self::$pdo, $role, '', 200, 0);
            $row = $this->seededRow($payload);
            self::assertNotNull($row, "role {$role} ต้องเห็น seeded row");
            self::assertArrayNotHasKey('citizen_id', $row, "role {$role} ต้องไม่ได้รับ citizen_id");
        }
    }

    #[Test]
    public function unknown_role_is_redacted_fail_closed(): void
    {
        $payload = legacyCivilServantsList(self::$pdo, '', '', 200, 0);
        $row = $this->seededRow($payload);
        self::assertNotNull($row);
        self::assertArrayNotHasKey('citizen_id', $row);
    }

    #[Test]
    public function search_by_citizen_id_finds_row_without_echoing_pii(): void
    {
        foreach (['admin', 'superadmin', 'operator', 'viewer'] as $role) {
            $payload = legacyCivilServantsList(self::$pdo, $role, $this->citizenId, 50, 0);
            $row = $this->seededRow($payload);
            self::assertNotNull($row, "role {$role} ต้องค้นหาด้วย citizen_id เจอ");

            if ($role === 'admin' || $role === 'superadmin') {
                self::assertSame($this->citizenId, $row['citizen_id'] ?? null);
            } else {
                self::assertArrayNotHasKey('citizen_id', $row, "role {$role} ต้องไม่ echo citizen_id");
            }
        }
    }

    #[Test]
    public function pagination_contract_is_preserved(): void
    {
        $payload = legacyCivilServantsList(self::$pdo, 'viewer', '', 10, 0);
        self::assertTrue($payload['success'] ?? false);
        self::assertArrayHasKey('total', $payload['pagination']);
        self::assertArrayHasKey('limit', $payload['pagination']);
        self::assertArrayHasKey('offset', $payload['pagination']);
        self::assertArrayHasKey('has_more', $payload['pagination']);
        self::assertSame(10, $payload['pagination']['limit']);
        self::assertSame(0, $payload['pagination']['offset']);
    }
}
