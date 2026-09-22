<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/diverse.php';

/**
 * T2.5 ตาราง D — parity: response envelope + audit snapshots ของ diverse
 * ต้องเท่าเดิมหลังย้ายเข้า TimeEntryCrud cores (กัน behavior drift เงียบ)
 */
final class DiverseCrudParityTest extends TestCase
{
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

        foreach (['users', 'personnel', 'audit_log', 'diverse_experience'] as $table) {
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

        foreach ($this->records['diverse_experience'] ?? [] as $id) {
            self::$pdo->prepare('DELETE FROM audit_log WHERE table_name = ? AND record_id = ?')
                ->execute(['diverse_experience', $id]);
            self::$pdo->prepare('DELETE FROM diverse_experience WHERE experience_id = ?')->execute([$id]);
        }
    }

    #[Test]
    public function list_returns_envelope_with_thai_fields(): void
    {
        $this->createOk();

        $oldGet = $_GET;
        $_GET = ['limit' => '200', 'offset' => '0'];
        try {
            $res = $this->call(fn () => getDiverseList(self::$pdo));
        } finally {
            $_GET = $oldGet;
        }

        self::assertSame(200, $res['http']);
        self::assertSame(['success', 'data', 'summary', 'pagination'], array_keys($res['body']));
        self::assertTrue($res['body']['success']);
        self::assertNotEmpty($res['body']['data']);
        foreach ($res['body']['data'] as $row) {
            self::assertArrayHasKey('from_start_date_thai', $row);
            self::assertArrayHasKey('from_end_date_thai', $row);
            self::assertArrayHasKey('to_start_date_thai', $row);
            self::assertArrayHasKey('to_end_date_thai', $row);
            self::assertArrayHasKey('qualified_date_thai', $row);
        }
    }

    #[Test]
    public function detail_missing_returns_404(): void
    {
        $res = $this->call(fn () => getDiverseDetail(self::$pdo, 999999));

        self::assertSame(404, $res['http']);
        self::assertSame(['error' => 'ไม่พบรายการนับแตกต่าง'], $res['body']);
    }

    #[Test]
    public function create_missing_field_returns_400(): void
    {
        $res = $this->call(fn () => createDiverse(self::$pdo, ['user_id' => self::$seedUserId], [
            'from_job_series' => 'สายงานเดิม',
        ]));

        self::assertSame(400, $res['http']);
        self::assertSame(['error' => 'กรุณาระบุ personnel_id'], $res['body']);
    }

    #[Test]
    public function create_bad_personnel_returns_404(): void
    {
        $res = $this->call(fn () => createDiverse(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => 999999,
            'from_job_series' => 'สายงานเดิม',
        ]));

        self::assertSame(404, $res['http']);
        self::assertSame(['error' => 'ไม่พบบุคลากร'], $res['body']);
    }

    #[Test]
    public function create_bad_date_returns_400(): void
    {
        $res = $this->call(fn () => createDiverse(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => self::$seedPersonnelId,
            'from_start_date' => 'not-a-date',
        ]));

        self::assertSame(400, $res['http']);
        self::assertSame(['error' => 'รูปแบบวันที่ไม่ถูกต้อง'], $res['body']);
    }

    #[Test]
    public function create_end_before_start_returns_400(): void
    {
        $res = $this->call(fn () => createDiverse(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => self::$seedPersonnelId,
            'from_start_date' => '2025-02-01',
            'from_end_date' => '2025-01-01',
        ]));

        self::assertSame(400, $res['http']);
        self::assertSame(['error' => 'วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น'], $res['body']);
    }

    #[Test]
    public function create_full_returns_201_with_create_audit(): void
    {
        $res = $this->call(fn () => createDiverse(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => self::$seedPersonnelId,
            'from_job_series' => 'พาริตีสายงานเดิม',
            'to_job_series' => 'พาริตีสายงานใหม่',
            'from_start_date' => '2025-01-01',
            'from_end_date' => '2025-01-31',
        ]));

        self::assertSame(201, $res['http']);
        self::assertSame(['success', 'experience_id'], array_keys($res['body']));
        self::assertTrue($res['body']['success']);
        $id = (int) $res['body']['experience_id'];
        self::assertGreaterThan(0, $id);
        $this->track('diverse_experience', $id);

        $audit = $this->audit('diverse_experience', $id, 'CREATE');
        self::assertSame(self::$seedUserId, (int) $audit['user_id']);
        self::assertNull($audit['before_value']);
        self::assertSame('พาริตีสายงานเดิม', $this->json($audit['after_value'])['from_job_series']);
    }

    #[Test]
    public function update_missing_returns_404(): void
    {
        $res = $this->call(fn () => updateDiverse(
            self::$pdo,
            999999,
            ['user_id' => self::$seedUserId],
            ['to_job_series' => 'x']
        ));

        self::assertSame(404, $res['http']);
        self::assertSame(['error' => 'ไม่พบรายการนับแตกต่าง'], $res['body']);
    }

    #[Test]
    public function update_empty_returns_400(): void
    {
        $id = $this->createOk();

        $res = $this->call(fn () => updateDiverse(
            self::$pdo,
            $id,
            ['user_id' => self::$seedUserId],
            []
        ));

        self::assertSame(400, $res['http']);
        self::assertSame(['error' => 'ไม่มีข้อมูลที่จะอัปเดต'], $res['body']);
    }

    #[Test]
    public function update_full_recomputes_qualified_date_and_audits(): void
    {
        $id = $this->createOk();

        $res = $this->call(fn () => updateDiverse(
            self::$pdo,
            $id,
            ['user_id' => self::$seedUserId],
            [
                'is_diff_job_series' => 1,
                'is_diff_org' => 1,
                'is_diff_location' => 1,
                'to_start_date' => '2025-01-01',
                'to_end_date' => '2025-06-30',
            ]
        ));

        self::assertSame(200, $res['http']);
        self::assertSame(['success' => true], $res['body']);
        self::assertSame('2025-01-01', $this->row($id)['qualified_date']);

        $audit = $this->audit('diverse_experience', $id, 'UPDATE');
        self::assertNull($this->json($audit['before_value'])['qualified_date']);
        self::assertSame('2025-01-01', $this->json($audit['after_value'])['qualified_date']);
    }

    #[Test]
    public function delete_returns_200_with_delete_audit(): void
    {
        $id = $this->createOk();

        $res = $this->call(fn () => deleteDiverse(self::$pdo, $id, ['user_id' => self::$seedUserId]));

        self::assertSame(200, $res['http']);
        self::assertSame(['success' => true], $res['body']);

        $audit = $this->audit('diverse_experience', $id, 'DELETE');
        self::assertSame($id, (int) $this->json($audit['before_value'])['experience_id']);
        self::assertNull($audit['after_value']);
    }

    #[Test]
    public function delete_twice_returns_404(): void
    {
        $id = $this->createOk();
        $this->call(fn () => deleteDiverse(self::$pdo, $id, ['user_id' => self::$seedUserId]));

        $res = $this->call(fn () => deleteDiverse(self::$pdo, $id, ['user_id' => self::$seedUserId]));

        self::assertSame(404, $res['http']);
        self::assertSame(['error' => 'ไม่พบรายการนับแตกต่าง'], $res['body']);
    }

    private function createOk(): int
    {
        $res = $this->call(fn () => createDiverse(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => self::$seedPersonnelId,
            'from_job_series' => 'พาริตีสายงานเดิม',
            'to_job_series' => 'พาริตีสายงานใหม่',
        ]));
        self::assertSame(201, $res['http'], json_encode($res['body'], JSON_UNESCAPED_UNICODE));
        $id = (int) $res['body']['experience_id'];
        $this->track('diverse_experience', $id);
        return $id;
    }

    /**
     * @return array<string, mixed>
     */
    private function row(int $id): array
    {
        $stmt = self::$pdo->prepare('SELECT * FROM diverse_experience WHERE experience_id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        self::assertNotFalse($row);
        return $row;
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
