<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/multiplier.php';

/**
 * T2.5 ตาราง M — parity: response envelope + audit snapshots ของ multiplier
 * ต้องเท่าเดิมหลังย้ายเข้า TimeEntryCrud cores (กัน behavior drift เงียบ)
 * หมายเหตุ: areas endpoints ไม่อยู่ใน parity (อยู่นอก helper ตั้งแต่ T2.2)
 */
final class MultiplierCrudParityTest extends TestCase
{
    private const OVERLAP_MSG = 'ช่วงวันที่นับทวีคูณทับซ้อนกับรายการเดิมของบุคลากรนี้';

    private static ?PDO $pdo = null;
    private static int $seedUserId = 0;
    private static int $seedPersonnelId = 0;

    /** @var array<string, list<int>> */
    private array $records = [];

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }

        foreach (['users', 'personnel', 'audit_log', 'multiplier_experience', 'special_area_multiplier'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table} — รัน migration ที่เกี่ยวข้องก่อน");
            }
        }

        $userId = self::$pdo->query('SELECT user_id FROM users LIMIT 1')->fetchColumn();
        $personnelId = self::$pdo->query('SELECT personnel_id FROM personnel LIMIT 1')->fetchColumn();
        if (!$userId || !$personnelId) {
            self::markTestSkipped('ต้องมี seed user และ personnel อย่างน้อยอย่างละ 1 แถว');
        }

        self::$seedUserId = (int) $userId;
        self::$seedPersonnelId = (int) $personnelId;
    }

    protected function tearDown(): void
    {
        if (self::$pdo === null) {
            return;
        }

        foreach ($this->records['multiplier_experience'] ?? [] as $id) {
            self::$pdo->prepare('DELETE FROM audit_log WHERE table_name = ? AND record_id = ?')
                ->execute(['multiplier_experience', $id]);
            self::$pdo->prepare('DELETE FROM multiplier_experience WHERE multiplier_id = ?')->execute([$id]);
        }
        foreach ($this->records['special_area_multiplier'] ?? [] as $id) {
            self::$pdo->prepare('DELETE FROM audit_log WHERE table_name = ? AND record_id = ?')
                ->execute(['special_area_multiplier', $id]);
            self::$pdo->prepare('DELETE FROM special_area_multiplier WHERE area_multiplier_id = ?')->execute([$id]);
        }
    }

    #[Test]
    public function detail_missing_returns_404(): void
    {
        $res = $this->call(fn () => getMultiplierById(self::$pdo, 999999));

        self::assertSame(404, $res['http']);
        self::assertSame(['error' => 'ไม่พบรายการที่ระบุ'], $res['body']);
    }

    #[Test]
    public function create_missing_field_returns_400(): void
    {
        $res = $this->call(fn () => createMultiplier(self::$pdo, ['user_id' => self::$seedUserId], [
            'start_date' => '2026-02-01',
            'end_date' => '2026-02-10',
        ]));

        self::assertSame(400, $res['http']);
        self::assertSame(['error' => 'กรุณาระบุ personnel_id'], $res['body']);
    }

    #[Test]
    public function create_bad_personnel_returns_404(): void
    {
        $areaId = $this->seedArea('พาริตีทวีคูณ personnel');

        $res = $this->call(fn () => createMultiplier(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => 999999,
            'area_multiplier_id' => $areaId,
            'start_date' => '2026-02-01',
            'end_date' => '2026-02-10',
        ]));

        self::assertSame(404, $res['http']);
        self::assertSame(['error' => 'ไม่พบบุคลากรตามรหัสที่ระบุ'], $res['body']);
    }

    #[Test]
    public function create_overlap_returns_409(): void
    {
        $areaId = $this->seedArea('พาริตีทวีคูณ overlap');
        $this->createOk($areaId, '2026-04-01', '2026-04-10');

        $res = $this->call(fn () => createMultiplier(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => self::$seedPersonnelId,
            'area_multiplier_id' => $areaId,
            'start_date' => '2026-04-05',
            'end_date' => '2026-04-15',
        ]));

        self::assertSame(409, $res['http']);
        self::assertSame(['error' => self::OVERLAP_MSG], $res['body']);
    }

    #[Test]
    public function create_full_returns_201_with_computed_and_create_audit(): void
    {
        $areaId = $this->seedArea('พาริตีทวีคูณ สร้าง');

        $res = $this->call(fn () => createMultiplier(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => self::$seedPersonnelId,
            'area_multiplier_id' => $areaId,
            'start_date' => '2026-02-01',
            'end_date' => '2026-02-10',
        ]));

        self::assertSame(201, $res['http']);
        self::assertSame(['success', 'multiplier_id', 'computed'], array_keys($res['body']));
        self::assertTrue($res['body']['success']);
        $id = (int) $res['body']['multiplier_id'];
        self::assertGreaterThan(0, $id);
        $this->track('multiplier_experience', $id);

        $computed = $res['body']['computed'];
        self::assertSame('2026-02-01', $computed['eligible_start_date']);
        self::assertSame('2026-02-10', $computed['eligible_end_date']);
        self::assertEquals(10, $computed['service_days']);
        self::assertEquals(10, $computed['eligible_days']);
        self::assertEquals(10, $computed['bonus_days']);

        $audit = $this->audit('multiplier_experience', $id, 'CREATE');
        self::assertSame(self::$seedUserId, (int) $audit['user_id']);
        self::assertNull($audit['before_value']);
        self::assertSame(self::$seedPersonnelId, (int) $this->json($audit['after_value'])['personnel_id']);
    }

    #[Test]
    public function update_missing_returns_404(): void
    {
        $res = $this->call(fn () => updateMultiplier(
            self::$pdo,
            999999,
            ['user_id' => self::$seedUserId],
            ['description' => 'x']
        ));

        self::assertSame(404, $res['http']);
        self::assertSame(['error' => 'ไม่พบรายการที่ระบุ'], $res['body']);
    }

    #[Test]
    public function update_overlap_returns_409_with_same_message(): void
    {
        $areaId = $this->seedArea('พาริตีทวีคูณ update overlap');
        $this->createOk($areaId, '2026-06-01', '2026-06-10');
        $idB = $this->createOk($areaId, '2026-07-01', '2026-07-10');

        $res = $this->call(fn () => updateMultiplier(
            self::$pdo,
            $idB,
            ['user_id' => self::$seedUserId],
            ['start_date' => '2026-06-05', 'end_date' => '2026-06-15']
        ));

        self::assertSame(409, $res['http']);
        self::assertSame(['error' => self::OVERLAP_MSG], $res['body']);
    }

    #[Test]
    public function update_full_returns_200_with_data_computed_and_audit(): void
    {
        $areaId = $this->seedArea('พาริตีทวีคูณ update');
        $id = $this->createOk($areaId, '2026-05-01', '2026-05-10');

        $res = $this->call(fn () => updateMultiplier(
            self::$pdo,
            $id,
            ['user_id' => self::$seedUserId],
            ['description' => 'พาริตีหลังแก้ไข']
        ));

        self::assertSame(200, $res['http']);
        self::assertSame(['success', 'multiplier_id', 'data', 'computed'], array_keys($res['body']));
        self::assertTrue($res['body']['success']);
        self::assertSame($id, (int) $res['body']['multiplier_id']);
        self::assertSame('พาริตีหลังแก้ไข', $res['body']['data']['description']);

        $audit = $this->audit('multiplier_experience', $id, 'UPDATE');
        self::assertSame(self::$seedUserId, (int) $audit['user_id']);
        self::assertSame('พาริตีหลังแก้ไข', $this->json($audit['after_value'])['description']);
    }

    #[Test]
    public function delete_missing_returns_404(): void
    {
        $res = $this->call(fn () => deleteMultiplier(self::$pdo, 999999, ['user_id' => self::$seedUserId]));

        self::assertSame(404, $res['http']);
        self::assertSame(['error' => 'ไม่พบรายการที่ระบุ'], $res['body']);
    }

    #[Test]
    public function delete_returns_200_with_five_key_before_snapshot(): void
    {
        $areaId = $this->seedArea('พาริตีทวีคูณ ลบ');
        $id = $this->createOk($areaId, '2026-08-01', '2026-08-10');

        $res = $this->call(fn () => deleteMultiplier(self::$pdo, $id, ['user_id' => self::$seedUserId]));

        self::assertSame(200, $res['http']);
        self::assertSame(['success' => true, 'message' => 'ลบรายการเรียบร้อยแล้ว'], $res['body']);

        $audit = $this->audit('multiplier_experience', $id, 'DELETE');
        $before = $this->json($audit['before_value']);
        $beforeKeys = array_keys($before);
        sort($beforeKeys);
        self::assertSame(
            ['area_multiplier_id', 'bonus_days', 'end_date', 'personnel_id', 'start_date'],
            $beforeKeys
        );
        self::assertSame(self::$seedPersonnelId, $before['personnel_id']);
        self::assertSame($areaId, $before['area_multiplier_id']);
        self::assertSame('2026-08-01', $before['start_date']);
        self::assertSame('2026-08-10', $before['end_date']);
        self::assertEquals(10, $before['bonus_days']);
        self::assertNull($audit['after_value']);
    }

    private function seedArea(string $province): int
    {
        self::$pdo->prepare(
            'INSERT INTO special_area_multiplier
                (province, basis_type, multiplier_ratio, effective_start_date, effective_end_date, is_active)
             VALUES (?, ?, 200, ?, ?, 1)'
        )->execute([$province, 'TEST', '2026-01-01', '2026-12-31']);
        $areaId = (int) self::$pdo->lastInsertId();
        $this->track('special_area_multiplier', $areaId);
        return $areaId;
    }

    private function createOk(int $areaId, string $start, string $end): int
    {
        $res = $this->call(fn () => createMultiplier(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => self::$seedPersonnelId,
            'area_multiplier_id' => $areaId,
            'start_date' => $start,
            'end_date' => $end,
        ]));
        self::assertSame(201, $res['http'], json_encode($res['body'], JSON_UNESCAPED_UNICODE));
        $id = (int) $res['body']['multiplier_id'];
        $this->track('multiplier_experience', $id);
        return $id;
    }

    /**
     * @return array{http:int, body:array<string,mixed>}
     */
    private function call(callable $operation): array
    {
        http_response_code(200);
        ob_start();
        $operation();
        $body = json_decode((string) ob_get_clean(), true);
        self::assertIsArray($body);
        return ['http' => http_response_code(), 'body' => $body];
    }

    /**
     * @return array<string, mixed>
     */
    private function audit(string $table, int $recordId, string $action): array
    {
        $stmt = self::$pdo->prepare(
            'SELECT * FROM audit_log
             WHERE table_name = ? AND record_id = ? AND action = ?
             ORDER BY audit_id DESC LIMIT 1'
        );
        $stmt->execute([$table, $recordId, $action]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        self::assertNotFalse($row, "ไม่พบ audit {$action} สำหรับ {$table}:{$recordId}");
        return $row;
    }

    /**
     * @return array<string, mixed>
     */
    private function json(?string $value): array
    {
        self::assertNotNull($value);
        $decoded = json_decode($value, true);
        self::assertIsArray($decoded);
        return $decoded;
    }

    private function track(string $table, int $id): void
    {
        $this->records[$table][] = $id;
    }
}
