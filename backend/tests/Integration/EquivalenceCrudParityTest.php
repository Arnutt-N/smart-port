<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/equivalence.php';

/**
 * T2.5 ตาราง E — parity: response envelope + audit snapshots ของ equivalence
 * ต้องเท่าเดิมหลังย้ายเข้า TimeEntryCrud cores (กัน behavior drift เงียบ)
 * หมายเหตุ: equivalence ไม่มี delete; เคส approve/reject ฉีด role=superadmin
 * (approval gate สงวนสิทธิ์ admin — direct-call ไม่ผ่าน dispatcher/JWT)
 */
final class EquivalenceCrudParityTest extends TestCase
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

        foreach (['users', 'personnel', 'audit_log', 'position_equivalence'] as $table) {
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

        foreach ($this->records['position_equivalence'] ?? [] as $id) {
            self::$pdo->prepare('DELETE FROM audit_log WHERE table_name = ? AND record_id = ?')
                ->execute(['position_equivalence', $id]);
            self::$pdo->prepare('DELETE FROM position_equivalence WHERE equivalence_id = ?')->execute([$id]);
        }
    }

    #[Test]
    public function detail_missing_returns_404(): void
    {
        $res = $this->call(fn () => getEquivalenceDetail(self::$pdo, 999));

        self::assertSame(404, $res['http']);
        self::assertSame(['error' => 'ไม่พบรายการเทียบตำแหน่ง'], $res['body']);
    }

    #[Test]
    public function create_missing_field_returns_400(): void
    {
        $res = $this->call(fn () => createEquivalence(self::$pdo, ['user_id' => self::$seedUserId], [
            'actual_position' => 'นักวิชาการ',
        ]));

        self::assertSame(400, $res['http']);
        self::assertSame(['error' => 'กรุณาระบุข้อมูล: personnel_id'], $res['body']);
    }

    #[Test]
    public function create_bad_personnel_returns_404(): void
    {
        $res = $this->call(fn () => createEquivalence(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => 999999,
            'actual_position' => 'นักวิชาการ',
            'equivalent_type' => 'อำนวยการ',
        ]));

        self::assertSame(404, $res['http']);
        self::assertSame(['error' => 'ไม่พบบุคลากร'], $res['body']);
    }

    #[Test]
    public function create_full_returns_201_pending_with_create_audit(): void
    {
        $res = $this->call(fn () => createEquivalence(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => self::$seedPersonnelId,
            'actual_position' => 'พาริตีตำแหน่งเดิม',
            'equivalent_type' => 'อำนวยการ',
        ]));

        self::assertSame(201, $res['http']);
        self::assertSame(['success', 'equivalence_id'], array_keys($res['body']));
        self::assertTrue($res['body']['success']);
        $id = (int) $res['body']['equivalence_id'];
        self::assertGreaterThan(0, $id);
        $this->track('position_equivalence', $id);

        self::assertSame('PENDING', $this->row($id)['approval_status']);

        $audit = $this->audit('position_equivalence', $id, 'CREATE');
        self::assertSame(self::$seedUserId, (int) $audit['user_id']);
        self::assertNull($audit['before_value']);
        self::assertSame('PENDING', $this->json($audit['after_value'])['approval_status']);
    }

    #[Test]
    public function approve_without_dates_returns_400(): void
    {
        $id = $this->createOk();

        $res = $this->call(fn () => updateEquivalence(
            self::$pdo,
            $id,
            $this->adminUser(),
            ['approval_status' => 'APPROVED']
        ));

        self::assertSame(400, $res['http']);
        self::assertSame(['error' => 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุดที่อนุมัติ'], $res['body']);
    }

    #[Test]
    public function invalid_transition_returns_400(): void
    {
        $id = $this->createOk();

        $res = $this->call(fn () => updateEquivalence(
            self::$pdo,
            $id,
            $this->adminUser(),
            ['approval_status' => 'DRAFT']
        ));

        self::assertSame(400, $res['http']);
        self::assertSame(['error' => 'ไม่สามารถเปลี่ยนสถานะจาก PENDING เป็น DRAFT'], $res['body']);
    }

    #[Test]
    public function approve_full_returns_200_with_days_approver_and_audit(): void
    {
        $id = $this->createOk();

        $res = $this->call(fn () => updateEquivalence(
            self::$pdo,
            $id,
            $this->adminUser(),
            [
                'approval_status' => 'APPROVED',
                'approved_start_date' => '2025-03-01',
                'approved_end_date' => '2025-03-10',
            ]
        ));

        self::assertSame(200, $res['http']);
        self::assertSame(['success' => true], $res['body']);

        $row = $this->row($id);
        self::assertSame('APPROVED', $row['approval_status']);
        self::assertEquals(10, $row['approved_total_days']);
        self::assertSame(self::$seedUserId, (int) $row['approved_by']);

        $audit = $this->audit('position_equivalence', $id, 'UPDATE');
        $after = $this->json($audit['after_value']);
        self::assertSame('APPROVED', $after['approval_status']);
        self::assertEquals(10, $after['approved_total_days']);
    }

    #[Test]
    public function reject_clears_approved_fields_and_audits(): void
    {
        $id = $this->createOk();

        $res = $this->call(fn () => updateEquivalence(
            self::$pdo,
            $id,
            $this->adminUser(),
            ['approval_status' => 'REJECTED']
        ));

        self::assertSame(200, $res['http']);
        self::assertSame(['success' => true], $res['body']);

        $row = $this->row($id);
        self::assertSame('REJECTED', $row['approval_status']);
        self::assertNull($row['approved_start_date']);
        self::assertNull($row['approved_end_date']);
        self::assertNull($row['approved_total_days']);
        self::assertNull($row['approved_by']);

        $audit = $this->audit('position_equivalence', $id, 'UPDATE');
        self::assertSame('PENDING', $this->json($audit['before_value'])['approval_status']);
        self::assertSame('REJECTED', $this->json($audit['after_value'])['approval_status']);
    }

    #[Test]
    public function field_update_empty_returns_400(): void
    {
        $id = $this->createOk();

        $res = $this->call(fn () => updateEquivalence(
            self::$pdo,
            $id,
            ['user_id' => self::$seedUserId],
            []
        ));

        self::assertSame(400, $res['http']);
        self::assertSame(['error' => 'ไม่มีข้อมูลที่สามารถอัปเดตได้'], $res['body']);
    }

    #[Test]
    public function field_update_full_returns_200_with_audit(): void
    {
        $id = $this->createOk();

        $res = $this->call(fn () => updateEquivalence(
            self::$pdo,
            $id,
            ['user_id' => self::$seedUserId],
            ['actual_position' => 'พาริตีตำแหน่งหลังแก้ไข']
        ));

        self::assertSame(200, $res['http']);
        self::assertSame(['success' => true], $res['body']);

        $audit = $this->audit('position_equivalence', $id, 'UPDATE');
        self::assertSame('พาริตีตำแหน่งเดิม', $this->json($audit['before_value'])['actual_position']);
        self::assertSame('พาริตีตำแหน่งหลังแก้ไข', $this->json($audit['after_value'])['actual_position']);
    }

    /**
     * @return array<string, mixed>
     */
    private function adminUser(): array
    {
        return ['user_id' => self::$seedUserId, 'role' => 'superadmin'];
    }

    private function createOk(): int
    {
        $res = $this->call(fn () => createEquivalence(self::$pdo, ['user_id' => self::$seedUserId], [
            'personnel_id' => self::$seedPersonnelId,
            'actual_position' => 'พาริตีตำแหน่งเดิม',
            'equivalent_type' => 'อำนวยการ',
        ]));
        self::assertSame(201, $res['http'], json_encode($res['body'], JSON_UNESCAPED_UNICODE));
        $id = (int) $res['body']['equivalence_id'];
        $this->track('position_equivalence', $id);
        return $id;
    }

    /**
     * @return array<string, mixed>
     */
    private function row(int $id): array
    {
        $stmt = self::$pdo->prepare('SELECT * FROM position_equivalence WHERE equivalence_id = ?');
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
