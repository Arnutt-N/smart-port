<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/multiplier.php';

/**
 * F2 — deleteMultiplier เข้า transaction (SELECT FOR UPDATE → DELETE → audit):
 * ลบสำเร็จได้ audit แถวเดียว, ลบ id ไม่มีได้ 404 โดยไม่มี audit แถวใหม่.
 */
final class DeleteMultiplierTxnTest extends TestCase
{
    private const TEST_PROVINCE = 'ทดสอบ-DELETE-TXN';

    private static ?PDO $pdo = null;
    private static int $seedUserId = 0;
    private static int $seedPersonnelId = 0;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }

        foreach (['multiplier_experience', 'special_area_multiplier', 'audit_log'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table} — รัน migration ที่เกี่ยวข้องก่อน");
            }
        }

        $userId = self::$pdo->query('SELECT user_id FROM users LIMIT 1')->fetchColumn();
        if (!$userId) {
            self::markTestSkipped('ไม่พบ seed user ในตาราง users');
        }
        self::$seedUserId = (int) $userId;

        $personnelId = self::$pdo->query('SELECT personnel_id FROM personnel LIMIT 1')->fetchColumn();
        if (!$personnelId) {
            self::markTestSkipped('ไม่พบ seed personnel ในตาราง personnel');
        }
        self::$seedPersonnelId = (int) $personnelId;
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        http_response_code(200);
    }

    #[Test]
    public function delete_success_writes_single_audit_row(): void
    {
        $areaId = null;
        $multiplierId = null;

        try {
            [$areaId, $multiplierId] = $this->seedRecord();

            http_response_code(200);
            ob_start();
            deleteMultiplier(self::$pdo, $multiplierId, ['user_id' => self::$seedUserId]);
            $response = json_decode((string) ob_get_clean(), true);

            self::assertSame(200, http_response_code());
            self::assertTrue($response['success'] ?? false);
            self::assertFalse(self::$pdo->query(
                "SELECT multiplier_id FROM multiplier_experience WHERE multiplier_id = {$multiplierId}"
            )->fetchColumn());
            self::assertSame(1, $this->auditCount($multiplierId));
        } finally {
            $this->cleanup($areaId, $multiplierId);
        }
    }

    #[Test]
    public function delete_missing_id_returns_404_without_audit(): void
    {
        $missingId = 999999989;

        http_response_code(200);
        ob_start();
        deleteMultiplier(self::$pdo, $missingId, ['user_id' => self::$seedUserId]);
        $response = json_decode((string) ob_get_clean(), true);

        self::assertSame(404, http_response_code());
        self::assertSame('ไม่พบรายการที่ระบุ', $response['error'] ?? null);
        self::assertSame(0, $this->auditCount($missingId));
    }

    /**
     * @return array{0:int, 1:int} [areaId, multiplierId]
     */
    private function seedRecord(): array
    {
        self::$pdo->prepare(
            'INSERT INTO special_area_multiplier
                (province, district, basis_type, multiplier_ratio,
                 effective_start_date, effective_end_date, legal_reference, is_active)
             VALUES (?, NULL, ?, 200.00, ?, ?, ?, 1)'
        )->execute([self::TEST_PROVINCE, 'MARTIAL_LAW', '2004-01-26', '2004-09-30', 'TEST_ONLY']);
        $areaId = (int) self::$pdo->lastInsertId();

        self::$pdo->prepare(
            'INSERT INTO multiplier_experience
                (personnel_id, area_multiplier_id, province, district, basis_type,
                 start_date, end_date, eligible_start_date, eligible_end_date,
                 service_days, eligible_days, multiplier_ratio, effective_days,
                 bonus_days, net_end_date, net_years, net_months, net_day_remainder,
                 created_by)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            self::$seedPersonnelId, $areaId, self::TEST_PROVINCE, 'MARTIAL_LAW',
            '2004-02-01', '2004-03-01', '2004-02-01', '2004-03-01',
            30, 30, 200.00, 60,
            30, '2004-03-31', 0, 2, 0,
            self::$seedUserId,
        ]);

        return [$areaId, (int) self::$pdo->lastInsertId()];
    }

    private function auditCount(int $multiplierId): int
    {
        $stmt = self::$pdo->prepare(
            "SELECT COUNT(*) FROM audit_log
             WHERE table_name = 'multiplier_experience' AND record_id = ? AND action = 'DELETE'"
        );
        $stmt->execute([$multiplierId]);

        return (int) $stmt->fetchColumn();
    }

    private function cleanup(?int $areaId, ?int $multiplierId): void
    {
        if ($multiplierId !== null) {
            self::$pdo->prepare(
                "DELETE FROM audit_log WHERE table_name = 'multiplier_experience' AND record_id = ?"
            )->execute([$multiplierId]);
            self::$pdo->prepare('DELETE FROM multiplier_experience WHERE multiplier_id = ?')
                ->execute([$multiplierId]);
        }
        if ($areaId !== null) {
            self::$pdo->prepare('DELETE FROM special_area_multiplier WHERE area_multiplier_id = ?')
                ->execute([$areaId]);
        }
    }
}
