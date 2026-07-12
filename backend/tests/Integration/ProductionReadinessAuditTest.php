<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/supportive.php';
require_once __DIR__ . '/../../routes/diverse.php';
require_once __DIR__ . '/../../routes/multiplier.php';
require_once __DIR__ . '/../../routes/equivalence.php';

final class ProductionReadinessAuditTest extends TestCase
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

        foreach ([
            'users',
            'personnel',
            'audit_log',
            'supportive_experience',
            'diverse_experience',
            'multiplier_experience',
            'special_area_multiplier',
            'position_equivalence',
        ] as $table) {
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

        $cleanupOrder = [
            'supportive_experience',
            'diverse_experience',
            'multiplier_experience',
            'position_equivalence',
            'special_area_multiplier',
        ];
        foreach ($cleanupOrder as $table) {
            $ids = $this->records[$table] ?? [];
            $primaryKey = match ($table) {
                'supportive_experience' => 'supportive_id',
                'diverse_experience' => 'experience_id',
                'multiplier_experience' => 'multiplier_id',
                'special_area_multiplier' => 'area_multiplier_id',
                'position_equivalence' => 'equivalence_id',
            };
            foreach ($ids as $id) {
                self::$pdo->prepare('DELETE FROM audit_log WHERE table_name = ? AND record_id = ?')
                    ->execute([$table, $id]);
                self::$pdo->prepare("DELETE FROM {$table} WHERE {$primaryKey} = ?")->execute([$id]);
            }
        }
    }

    #[Test]
    public function supportive_create_update_and_delete_write_complete_audit_snapshots(): void
    {
        $user = ['user_id' => self::$seedUserId];
        $create = $this->capture(fn () => createSupportive(self::$pdo, $user, [
            'personnel_id' => self::$seedPersonnelId,
            'job_series_name' => 'ทดสอบ audit เกื้อกูล',
            'start_date' => '2025-01-01',
            'end_date' => '2025-01-10',
            'description' => 'ก่อนแก้ไข',
        ]));
        $id = (int) $create['supportive_id'];
        $this->track('supportive_experience', $id);

        $createAudit = $this->audit('supportive_experience', $id, 'CREATE');
        self::assertSame(self::$seedUserId, (int) $createAudit['user_id']);
        self::assertNull($createAudit['before_value']);
        self::assertSame('ก่อนแก้ไข', $this->json($createAudit['after_value'])['description']);

        $this->capture(fn () => updateSupportive(
            self::$pdo,
            $id,
            $user,
            ['description' => 'หลังแก้ไข']
        ));
        $updateAudit = $this->audit('supportive_experience', $id, 'UPDATE');
        self::assertSame('ก่อนแก้ไข', $this->json($updateAudit['before_value'])['description']);
        self::assertSame('หลังแก้ไข', $this->json($updateAudit['after_value'])['description']);

        $this->capture(fn () => deleteSupportive(self::$pdo, $id, $user));
        $deleteAudit = $this->audit('supportive_experience', $id, 'DELETE');
        self::assertSame('หลังแก้ไข', $this->json($deleteAudit['before_value'])['description']);
        self::assertNull($deleteAudit['after_value']);
    }

    #[Test]
    public function diverse_create_update_and_delete_write_complete_audit_snapshots(): void
    {
        $user = ['user_id' => self::$seedUserId];
        $create = $this->capture(fn () => createDiverse(self::$pdo, $user, [
            'personnel_id' => self::$seedPersonnelId,
            'from_job_series' => 'สายงานเดิม',
            'to_job_series' => 'สายงานใหม่',
            'is_diff_job_series' => 1,
        ]));
        $id = (int) $create['experience_id'];
        $this->track('diverse_experience', $id);

        $createAudit = $this->audit('diverse_experience', $id, 'CREATE');
        self::assertSame('สายงานเดิม', $this->json($createAudit['after_value'])['from_job_series']);

        $this->capture(fn () => updateDiverse(
            self::$pdo,
            $id,
            $user,
            ['to_job_series' => 'สายงานใหม่หลังแก้ไข']
        ));
        $updateAudit = $this->audit('diverse_experience', $id, 'UPDATE');
        self::assertSame('สายงานใหม่', $this->json($updateAudit['before_value'])['to_job_series']);
        self::assertSame('สายงานใหม่หลังแก้ไข', $this->json($updateAudit['after_value'])['to_job_series']);

        $this->capture(fn () => deleteDiverse(self::$pdo, $id, $user));
        $deleteAudit = $this->audit('diverse_experience', $id, 'DELETE');
        self::assertSame('สายงานใหม่หลังแก้ไข', $this->json($deleteAudit['before_value'])['to_job_series']);
        self::assertNull($deleteAudit['after_value']);
    }

    #[Test]
    public function multiplier_update_writes_before_and_after_audit_snapshots(): void
    {
        self::$pdo->prepare(
            'INSERT INTO special_area_multiplier
                (province, basis_type, multiplier_ratio, effective_start_date, effective_end_date, is_active)
             VALUES (?, ?, 200, ?, ?, 1)'
        )->execute(['ทดสอบ audit update', 'TEST', '2025-01-01', '2025-12-31']);
        $areaId = (int) self::$pdo->lastInsertId();
        $this->track('special_area_multiplier', $areaId);

        self::$pdo->prepare(
            'INSERT INTO multiplier_experience
                (personnel_id, area_multiplier_id, province, basis_type, start_date, end_date,
                 eligible_start_date, eligible_end_date, service_days, eligible_days,
                 multiplier_ratio, effective_days, bonus_days, net_end_date,
                 net_years, net_months, net_day_remainder, description, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 10, 10, 200, 20, 10, ?, 0, 0, 20, ?, ?)'
        )->execute([
            self::$seedPersonnelId,
            $areaId,
            'ทดสอบ audit update',
            'TEST',
            '2025-02-01',
            '2025-02-10',
            '2025-02-01',
            '2025-02-10',
            '2025-02-20',
            'ก่อนแก้ไข',
            self::$seedUserId,
        ]);
        $id = (int) self::$pdo->lastInsertId();
        $this->track('multiplier_experience', $id);

        $this->capture(fn () => updateMultiplier(
            self::$pdo,
            $id,
            ['user_id' => self::$seedUserId],
            ['description' => 'หลังแก้ไข']
        ));

        $audit = $this->audit('multiplier_experience', $id, 'UPDATE');
        self::assertSame('ก่อนแก้ไข', $this->json($audit['before_value'])['description']);
        self::assertSame('หลังแก้ไข', $this->json($audit['after_value'])['description']);
    }

    #[Test]
    public function equivalence_create_and_regular_update_write_audit_snapshots(): void
    {
        $user = ['user_id' => self::$seedUserId];
        $create = $this->capture(fn () => createEquivalence(self::$pdo, $user, [
            'personnel_id' => self::$seedPersonnelId,
            'actual_position' => 'ตำแหน่งเดิม',
            'equivalent_type' => 'อำนวยการ',
        ]));
        $id = (int) $create['equivalence_id'];
        $this->track('position_equivalence', $id);

        $createAudit = $this->audit('position_equivalence', $id, 'CREATE');
        self::assertSame('PENDING', $this->json($createAudit['after_value'])['approval_status']);

        $this->capture(fn () => updateEquivalence(
            self::$pdo,
            $id,
            $user,
            ['actual_position' => 'ตำแหน่งหลังแก้ไข']
        ));
        $updateAudit = $this->audit('position_equivalence', $id, 'UPDATE');
        self::assertSame('ตำแหน่งเดิม', $this->json($updateAudit['before_value'])['actual_position']);
        self::assertSame('ตำแหน่งหลังแก้ไข', $this->json($updateAudit['after_value'])['actual_position']);
    }

    /**
     * @return array<string, mixed>
     */
    private function capture(callable $operation): array
    {
        http_response_code(200);
        ob_start();
        $operation();
        $response = json_decode((string) ob_get_clean(), true);
        self::assertIsArray($response);
        self::assertTrue($response['success'] ?? false, json_encode($response, JSON_UNESCAPED_UNICODE));
        return $response;
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
