<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/multiplier.php';

/**
 * Integration test: การลบรายการทวีคูณต้องบันทึก audit log เหมือน create/update/status
 * (issue #21 — "edit and delete multiplier records safely")
 *
 * ใช้ seed user/personnel ที่มีอยู่จริงเพื่อผ่าน FK และล้างข้อมูลทดสอบใน finally เสมอ
 */
final class MultiplierDeleteAuditTest extends TestCase
{
    private const TEST_PROVINCE = 'ทดสอบ-DELETE-AUDIT';

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
    }

    #[Test]
    public function it_logs_audit_when_deleting_a_multiplier_record(): void
    {
        $areaId = null;
        $multiplierId = null;

        try {
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
            $multiplierId = (int) self::$pdo->lastInsertId();

            ob_start();
            deleteMultiplier(self::$pdo, $multiplierId, ['user_id' => self::$seedUserId]);
            $response = json_decode(ob_get_clean(), true);

            self::assertTrue($response['success'] ?? false);

            $gone = self::$pdo->prepare('SELECT 1 FROM multiplier_experience WHERE multiplier_id = ?');
            $gone->execute([$multiplierId]);
            self::assertFalse($gone->fetchColumn(), 'รายการต้องถูกลบจริง');

            $auditStmt = self::$pdo->prepare(
                "SELECT * FROM audit_log
                 WHERE action = 'DELETE' AND table_name = 'multiplier_experience' AND record_id = ?
                 ORDER BY audit_id DESC LIMIT 1"
            );
            $auditStmt->execute([$multiplierId]);
            $audit = $auditStmt->fetch(PDO::FETCH_ASSOC);

            self::assertNotFalse($audit, 'การลบต้องถูกบันทึกลง audit_log');
            self::assertSame(self::$seedUserId, (int) $audit['user_id']);
            self::assertNull($audit['after_value'], 'DELETE ต้องไม่มี after_value');

            $before = json_decode((string) $audit['before_value'], true);
            self::assertIsArray($before, 'DELETE ต้องเก็บ snapshot ก่อนลบไว้ใน before_value');
            self::assertSame(self::$seedPersonnelId, (int) $before['personnel_id']);
        } finally {
            if ($multiplierId !== null) {
                self::$pdo->prepare('DELETE FROM audit_log WHERE table_name = ? AND record_id = ?')
                    ->execute(['multiplier_experience', $multiplierId]);
                self::$pdo->prepare('DELETE FROM multiplier_experience WHERE multiplier_id = ?')
                    ->execute([$multiplierId]);
            }
            if ($areaId !== null) {
                self::$pdo->prepare('DELETE FROM special_area_multiplier WHERE area_multiplier_id = ?')
                    ->execute([$areaId]);
            }
        }
    }
}
