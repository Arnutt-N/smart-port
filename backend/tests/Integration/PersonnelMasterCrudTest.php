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
 * Master CRUD บุคลากร — สร้าง / รายการ / แก้ / ห้ามแก้ citizen_id / ปิดใช้งาน
 */
final class PersonnelMasterCrudTest extends TestCase
{
    private static ?PDO $pdo = null;
    /** @var list<int> */
    private array $personnelIds = [];
    /** @var list<int> */
    private array $prefixIds = [];
    private string $suffix = '';

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
        self::$pdo->prepare(
            'INSERT INTO prefixes (prefix_code, prefix_name_th) VALUES (?, ?)'
        )->execute(['M' . $this->suffix, 'นาย']);
        $this->prefixIds[] = (int) self::$pdo->lastInsertId();
    }

    protected function tearDown(): void
    {
        if (self::$pdo === null) {
            return;
        }
        foreach ($this->personnelIds as $id) {
            self::$pdo->prepare('DELETE FROM personnel WHERE personnel_id = ?')->execute([$id]);
        }
        foreach ($this->prefixIds as $id) {
            self::$pdo->prepare('DELETE FROM prefixes WHERE prefix_id = ?')->execute([$id]);
        }
    }

    #[Test]
    public function create_list_update_deactivate_and_reject_citizen_id_change(): void
    {
        $auth = ['user_id' => 1];
        $citizenId = $this->uniqueCitizenId('1');

        ob_start();
        $newId = createPersonnelRecord(self::$pdo, $auth, [
            'first_name' => 'สมชาย' . $this->suffix,
            'last_name' => 'ใจดี',
            'citizen_id' => $citizenId,
            'prefix_id' => $this->prefixIds[0],
            'employee_id' => 'EMP' . $this->suffix,
        ]);
        $createOut = ob_get_clean();
        self::assertNotNull($newId, 'create should succeed: ' . $createOut);
        $this->personnelIds[] = $newId;

        $listed = listPersonnelMaster(self::$pdo, 'สมชาย' . $this->suffix, 20, 0, false);
        self::assertGreaterThanOrEqual(1, $listed['pagination']['total']);
        $found = null;
        foreach ($listed['data'] as $row) {
            if ((int) $row['personnel_id'] === $newId) {
                $found = $row;
                break;
            }
        }
        self::assertNotNull($found);
        self::assertSame($citizenId, $found['citizen_id']);

        ob_start();
        $updated = updatePersonnelRecord(self::$pdo, $newId, $auth, [
            'first_name' => 'สมหญิง' . $this->suffix,
            'last_name' => 'รักงาน',
        ]);
        $updateOut = ob_get_clean();
        self::assertTrue($updated, $updateOut);
        $after = getPersonnelById(self::$pdo, $newId);
        self::assertSame('สมหญิง' . $this->suffix, $after['first_name']);

        ob_start();
        $rejected = updatePersonnelRecord(self::$pdo, $newId, $auth, [
            'citizen_id' => '9999999999999',
        ]);
        ob_get_clean();
        self::assertFalse($rejected);
        $still = getPersonnelById(self::$pdo, $newId);
        self::assertSame($citizenId, $still['citizen_id']);

        ob_start();
        $deactivated = updatePersonnelRecord(self::$pdo, $newId, $auth, ['is_active' => 0]);
        ob_get_clean();
        self::assertTrue($deactivated);

        $activeList = listPersonnelMaster(self::$pdo, 'สมหญิง' . $this->suffix, 20, 0, false);
        foreach ($activeList['data'] as $row) {
            self::assertNotSame($newId, (int) $row['personnel_id']);
        }

        $typeahead = searchPersonnelTypeahead(self::$pdo, 'สมหญิง' . $this->suffix, 10);
        self::assertSame([], $typeahead);

        $withInactive = listPersonnelMaster(self::$pdo, 'สมหญิง' . $this->suffix, 20, 0, true);
        $inactiveFound = false;
        foreach ($withInactive['data'] as $row) {
            if ((int) $row['personnel_id'] === $newId) {
                $inactiveFound = true;
                self::assertSame(0, (int) $row['is_active']);
            }
        }
        self::assertTrue($inactiveFound);
    }

    #[Test]
    public function duplicate_citizen_id_returns_conflict(): void
    {
        $auth = ['user_id' => 1];
        $citizenId = $this->uniqueCitizenId('2');

        ob_start();
        $first = createPersonnelRecord(self::$pdo, $auth, [
            'first_name' => 'A' . $this->suffix,
            'last_name' => 'One',
            'citizen_id' => $citizenId,
        ]);
        ob_get_clean();
        self::assertNotNull($first);
        $this->personnelIds[] = $first;

        ob_start();
        $dup = createPersonnelRecord(self::$pdo, $auth, [
            'first_name' => 'B' . $this->suffix,
            'last_name' => 'Two',
            'citizen_id' => $citizenId,
        ]);
        $out = ob_get_clean();
        self::assertNull($dup);
        self::assertStringContainsString('เลขบัตรประชาชน', $out);
    }

    #[Test]
    public function lookups_return_active_prefixes(): void
    {
        $lookups = getPersonnelLookups(self::$pdo);
        self::assertNotEmpty($lookups);
        $ids = array_map(static fn ($r) => (int) $r['prefix_id'], $lookups);
        self::assertContains($this->prefixIds[0], $ids);
    }

    #[Test]
    public function create_rejects_unknown_prefix_id(): void
    {
        $auth = ['user_id' => 1];
        $citizenId = $this->uniqueCitizenId('3');

        ob_start();
        $id = createPersonnelRecord(self::$pdo, $auth, [
            'first_name' => 'C' . $this->suffix,
            'last_name' => 'BadPrefix',
            'citizen_id' => $citizenId,
            'prefix_id' => 999999991,
        ]);
        $out = ob_get_clean();
        self::assertNull($id);
        self::assertStringContainsString('คำนำหน้า', $out);
    }

    #[Test]
    public function create_rejects_citizen_id_with_invalid_checksum(): void
    {
        $auth = ['user_id' => 1];

        ob_start();
        $id = createPersonnelRecord(self::$pdo, $auth, [
            'first_name' => 'D' . $this->suffix,
            'last_name' => 'BadChecksum',
            'citizen_id' => '1234567890123',
        ]);
        $out = ob_get_clean();
        self::assertNull($id);
        self::assertStringContainsString('เลขบัตรประชาชนไม่ถูกต้อง', $out);
        self::assertStringNotContainsString('13 หลัก', $out);
    }

    private function uniqueCitizenId(string $lead): string
    {
        $first12 = substr($lead . str_pad((string) hexdec($this->suffix), 11, '0', STR_PAD_LEFT), 0, 12);
        return testCitizenId($first12);
    }
}
