<?php

declare(strict_types=1);

namespace Tests\Integration;

use InvalidArgumentException;
use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/multiplier.php';

/**
 * เทสต์ clamp-start / clamp-end ตาม UAT fixtures TC-001, TC-002 ใน
 * docs/multiplier_phase0_uat_cases_template.csv (issue #20 acceptance criteria)
 *
 * พื้นที่ทดสอบใช้ช่วง 2004-01-26 → 2004-09-30, ratio 200:
 *   TC-001 เริ่มงานก่อนวันเริ่มประกาศ → eligible_start ต้องถูก clamp เป็นวันเริ่มประกาศ
 *   TC-002 สิ้นสุดงานหลังวันสิ้นสุดประกาศ → eligible_end ต้องถูก clamp เป็นวันสิ้นสุดประกาศ
 *
 * ค่า expected ตรวจอิสระแล้วด้วย scripts/validate-multiplier-phase0.mjs (check
 * "UAT expected values match calculation rules") — สองแหล่งต้องตรงกันเสมอ
 */
final class MultiplierClampTest extends TestCase
{
    private static ?PDO $pdo = null;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
    }

    private function insertTestArea(): int
    {
        self::$pdo->prepare(
            "INSERT INTO special_area_multiplier
                (province, district, basis_type, multiplier_ratio,
                 effective_start_date, effective_end_date, legal_reference, is_active)
             VALUES ('ทดสอบ-clamp', NULL, 'TEST_CLAMP', 200.00, '2004-01-26', '2004-09-30', 'TEST-ONLY', 1)"
        )->execute();
        return (int) self::$pdo->lastInsertId();
    }

    private function deleteTestArea(int $areaId): void
    {
        self::$pdo->prepare('DELETE FROM special_area_multiplier WHERE area_multiplier_id = ?')
            ->execute([$areaId]);
    }

    #[Test]
    public function it_clamps_start_date_to_effective_period_tc001(): void
    {
        $areaId = $this->insertTestArea();
        try {
            $computed = computeMultiplierFields(self::$pdo, $areaId, '2004-01-01', '2004-02-10');

            self::assertSame('2004-01-26', $computed['eligible_start_date'], 'ต้อง clamp เป็นวันเริ่มประกาศ');
            self::assertSame('2004-02-10', $computed['eligible_end_date']);
            self::assertSame(41, $computed['service_days']);
            self::assertSame(16, $computed['eligible_days']);
            self::assertSame(32.0, $computed['effective_days']);
            self::assertSame(16.0, $computed['bonus_days']);
            self::assertSame(0, $computed['net_years']);
            self::assertSame(1, $computed['net_months']);
            self::assertSame(2, $computed['net_day_remainder']);
        } finally {
            $this->deleteTestArea($areaId);
        }
    }

    #[Test]
    public function it_clamps_end_date_to_effective_period_tc002(): void
    {
        $areaId = $this->insertTestArea();
        try {
            $computed = computeMultiplierFields(self::$pdo, $areaId, '2004-08-01', '2004-10-15');

            self::assertSame('2004-08-01', $computed['eligible_start_date']);
            self::assertSame('2004-09-30', $computed['eligible_end_date'], 'ต้อง clamp เป็นวันสิ้นสุดประกาศ');
            self::assertSame(76, $computed['service_days']);
            self::assertSame(61, $computed['eligible_days']);
            self::assertSame(122.0, $computed['effective_days']);
            self::assertSame(61.0, $computed['bonus_days']);
            self::assertSame(0, $computed['net_years']);
            self::assertSame(4, $computed['net_months']);
            self::assertSame(2, $computed['net_day_remainder']);
        } finally {
            $this->deleteTestArea($areaId);
        }
    }

    #[Test]
    public function it_rejects_service_period_with_no_eligible_overlap(): void
    {
        $areaId = $this->insertTestArea();
        try {
            $this->expectException(InvalidArgumentException::class);
            computeMultiplierFields(self::$pdo, $areaId, '2003-01-01', '2003-12-31');
        } finally {
            $this->deleteTestArea($areaId);
        }
    }
}
