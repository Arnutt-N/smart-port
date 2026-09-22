<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/supportive.php';

/**
 * T2.5 ตาราง S — parity: response envelope + audit snapshots ของ supportive
 * ต้องเท่าเดิมหลังย้ายเข้า TimeEntryCrud cores (กัน behavior drift เงียบ)
 */
final class SupportiveCrudParityTest extends TestCase
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

        foreach (['users', 'personnel', 'audit_log', 'supportive_experience'] as $table) {
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

        foreach ($this->records['supportive_experience'] ?? [] as $id) {
            self::$pdo->prepare('DELETE FROM audit_log WHERE table_name = ? AND record_id = ?')
                ->execute(['supportive_experience', $id]);
            self::$pdo->prepare('DELETE FROM supportive_experience WHERE supportive_id = ?')->execute([$id]);
        }
    }

    #[Test]
    public function list_returns_envelope_with_thai_dates(): void
    {
        $this->createOk('2025-01-01', '2025-01-10');

        $oldGet = $_GET;
        $_GET = ['limit' => '200', 'offset' => '0'];
        try {
            $res = $this->call(fn () => getSupportiveList(self::$pdo));
        } finally {
            $_GET = $oldGet;
        }

        self::assertSame(200, $res['http']);
        self::assertSame(['success', 'data', 'summary', 'pagination'], array_keys($res['body']));
        self::assertTrue($res['body']['success']);
        self::assertNotEmpty($res['body']['data']);
        $pagination = $res['body']['pagination'];
        self::assertSame(['total', 'limit', 'offset', 'has_more'], array_keys($pagination));
        self::assertSame(($pagination['offset'] + $pagination['limit']) < $pagination['total'], $pagination['has_more']);
        foreach ($res['body']['data'] as $row) {
            self::assertArrayHasKey('start_date_thai', $row);
            self::assertArrayHasKey('end_date_thai', $row);
        }
    }

    #[Test]
    public function detail_missing_returns_404(): void
    {
        $res = $this->call(fn () => getSupportiveDetail(self::$pdo, 999999));

        self::assertSame(404, $res['http']);
        self::assertSame(['error' => 'ไม่พบรายการนับเกื้อกูล'], $res['body']);
    }

    #[Test]
    public function create_missing_personnel_returns_400(): void
    {
        $res = $this->call(fn () => createSupportive(self::$pdo, ['user_id' => self::$seedUserId], [
            'job_series_name' => 'วิชาการ',
            'start_date' => '2025-01-01',
            'end_date' => '2025-01-10',
        ]));

        self::assertSame(400, $res['http']);
        self::assertSame(['error' => 'กรุณาระบุ personnel_id'], $res['body']);
    }

    #[Test]
    public function create_full_returns_201_with_computed_and_single_create_audit(): void
    {
        $res = $this->call(fn () => createSupportive(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => self::$seedPersonnelId,
            'job_series_name' => 'พาริตีเกื้อกูล',
            'start_date' => '2025-01-01',
            'end_date' => '2025-01-10',
        ]));

        self::assertSame(201, $res['http']);
        self::assertSame(['success', 'supportive_id'], array_keys($res['body']));
        self::assertTrue($res['body']['success']);
        $id = (int) $res['body']['supportive_id'];
        self::assertGreaterThan(0, $id);
        $this->track('supportive_experience', $id);

        $row = $this->row($id);
        self::assertNotNull($row['net_end_date']);
        self::assertNotNull($row['net_years']);
        self::assertNotNull($row['net_months']);
        self::assertNotNull($row['net_day_remainder']);

        self::assertSame(1, $this->auditCount('supportive_experience', $id, 'CREATE'));
        $audit = $this->audit('supportive_experience', $id, 'CREATE');
        self::assertSame(self::$seedUserId, (int) $audit['user_id']);
        self::assertNull($audit['before_value']);
        self::assertSame('พาริตีเกื้อกูล', $this->json($audit['after_value'])['job_series_name']);
    }

    #[Test]
    public function update_end_date_recomputes_and_audits_before_after(): void
    {
        $id = $this->createOk('2025-01-01', '2025-01-10');
        $beforeTotal = (int) $this->row($id)['total_days'];

        $res = $this->call(fn () => updateSupportive(
            self::$pdo,
            $id,
            ['user_id' => self::$seedUserId],
            ['end_date' => '2025-01-20']
        ));

        self::assertSame(200, $res['http']);
        self::assertSame(['success' => true], $res['body']);
        self::assertNotSame($beforeTotal, (int) $this->row($id)['total_days']);

        $audit = $this->audit('supportive_experience', $id, 'UPDATE');
        $before = $this->json($audit['before_value']);
        $after = $this->json($audit['after_value']);
        self::assertNotSame((int) $before['total_days'], (int) $after['total_days']);
        self::assertSame('2025-01-20', $after['end_date']);
    }

    #[Test]
    public function update_empty_returns_400(): void
    {
        $id = $this->createOk('2025-01-01', '2025-01-10');

        $res = $this->call(fn () => updateSupportive(
            self::$pdo,
            $id,
            ['user_id' => self::$seedUserId],
            []
        ));

        self::assertSame(400, $res['http']);
        self::assertSame(['error' => 'ไม่มีข้อมูลที่ต้องอัปเดต'], $res['body']);
    }

    #[Test]
    public function delete_returns_200_with_delete_audit(): void
    {
        $id = $this->createOk('2025-01-01', '2025-01-10');

        $res = $this->call(fn () => deleteSupportive(self::$pdo, $id, ['user_id' => self::$seedUserId]));

        self::assertSame(200, $res['http']);
        self::assertSame(['success' => true], $res['body']);

        $audit = $this->audit('supportive_experience', $id, 'DELETE');
        self::assertSame($id, (int) $this->json($audit['before_value'])['supportive_id']);
        self::assertNull($audit['after_value']);
    }

    #[Test]
    public function delete_twice_returns_404(): void
    {
        $id = $this->createOk('2025-01-01', '2025-01-10');
        $this->call(fn () => deleteSupportive(self::$pdo, $id, ['user_id' => self::$seedUserId]));

        $res = $this->call(fn () => deleteSupportive(self::$pdo, $id, ['user_id' => self::$seedUserId]));

        self::assertSame(404, $res['http']);
    }

    private function createOk(string $start, string $end): int
    {
        $res = $this->call(fn () => createSupportive(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => self::$seedPersonnelId,
            'job_series_name' => 'พาริตีเกื้อกูล',
            'start_date' => $start,
            'end_date' => $end,
        ]));
        self::assertSame(201, $res['http'], json_encode($res['body'], JSON_UNESCAPED_UNICODE));
        $id = (int) $res['body']['supportive_id'];
        $this->track('supportive_experience', $id);
        return $id;
    }

    /**
     * @return array<string, mixed>
     */
    private function row(int $id): array
    {
        $stmt = self::$pdo->prepare('SELECT * FROM supportive_experience WHERE supportive_id = ?');
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

    private function auditCount(string $table, int $recordId, string $action): int
    {
        $stmt = self::$pdo->prepare(
            'SELECT COUNT(*) FROM audit_log WHERE table_name = ? AND record_id = ? AND action = ?'
        );
        $stmt->execute([$table, $recordId, $action]);
        return (int) $stmt->fetchColumn();
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
