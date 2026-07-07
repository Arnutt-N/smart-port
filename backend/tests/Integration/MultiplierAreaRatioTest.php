<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use QualificationEngine;

require_once __DIR__ . '/../../routes/multiplier.php';

/**
 * พิสูจน์ว่า multiplier_ratio อื่นนอกจาก 200 (จาก master data ที่ HR เพิ่มเอง)
 * ไหลถูกทั้งสาย: computeMultiplierFields → multiplier_experience → QualificationEngine
 *
 * ช่วงทดสอบ 2004-01-26 → 2004-09-30 = 249 วัน (นับรวมปลายทั้งสอง, ก.พ. 2004 มี 29 วัน)
 * ratio 150 → effective 373.5 / bonus 124.5 → engine ลด qualification_date = FLOOR(124.5) = 124 วัน
 *
 * pattern เดียวกับ it_subtracts_multiplier_bonus_days_... ใน QualificationEngineTest:
 * insert ชั่วคราว → วัด → cleanup ใน finally (ไม่กระทบ golden values)
 */
final class MultiplierAreaRatioTest extends TestCase
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

    private function insertTestArea(float $ratio): int
    {
        $stmt = self::$pdo->prepare(
            "INSERT INTO special_area_multiplier
                (province, district, basis_type, multiplier_ratio,
                 effective_start_date, effective_end_date, legal_reference, is_active)
             VALUES ('ทดสอบ-ratio', NULL, 'TEST_RATIO', ?, '2004-01-26', '2004-09-30', 'TEST-ONLY', 1)"
        );
        $stmt->execute([$ratio]);
        return (int) self::$pdo->lastInsertId();
    }

    private function deleteTestArea(int $areaId): void
    {
        self::$pdo->prepare('DELETE FROM multiplier_experience WHERE area_multiplier_id = ?')
            ->execute([$areaId]);
        self::$pdo->prepare('DELETE FROM special_area_multiplier WHERE area_multiplier_id = ?')
            ->execute([$areaId]);
    }

    #[Test]
    public function compute_uses_area_ratio_150_for_bonus_days(): void
    {
        $areaId = $this->insertTestArea(150.00);
        try {
            $computed = computeMultiplierFields(self::$pdo, $areaId, '2004-01-26', '2004-09-30');

            self::assertSame(249, $computed['eligible_days']);
            self::assertSame(150.0, $computed['multiplier_ratio']);
            self::assertSame(373.5, $computed['effective_days']); // 249 × 1.5
            self::assertSame(124.5, $computed['bonus_days']);     // 249 × 0.5
        } finally {
            $this->deleteTestArea($areaId);
        }
    }

    #[Test]
    public function engine_shifts_qualification_date_by_floored_ratio150_bonus(): void
    {
        $target = 'K2';
        $personnelId = 1; // K1 golden case — ไม่มีทวีคูณใน seed
        $areaId = $this->insertTestArea(150.00);
        $engine = new QualificationEngine(self::$pdo);

        try {
            $before = $engine->computeDetail($target, $personnelId);
            self::assertSame(0, $before['data']['multiplier_days'], 'baseline ต้องไม่มีทวีคูณ');
            $baseDate = $before['data']['qualification_date'];
            self::assertNotNull($baseDate);

            $computed = computeMultiplierFields(self::$pdo, $areaId, '2004-01-26', '2004-09-30');
            self::$pdo->prepare(
                'INSERT INTO multiplier_experience
                    (personnel_id, area_multiplier_id, province, basis_type,
                     start_date, end_date, eligible_start_date, eligible_end_date,
                     eligible_days, multiplier_ratio, effective_days, bonus_days)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $personnelId, $areaId, $computed['province'], $computed['basis_type'],
                '2004-01-26', '2004-09-30',
                $computed['eligible_start_date'], $computed['eligible_end_date'],
                $computed['eligible_days'], $computed['multiplier_ratio'],
                $computed['effective_days'], $computed['bonus_days'],
            ]);

            $after = $engine->computeDetail($target, $personnelId);
            // engine cast (int) ของ SUM(124.50) = 124 และ FLOOR ในสูตรวันที่ก็ตัดเป็น 124
            self::assertSame(124, $after['data']['multiplier_days']);

            $shift = (new \DateTime($baseDate))
                ->diff(new \DateTime($after['data']['qualification_date']))->days;
            self::assertSame(124, $shift, 'qualification_date ต้องเลื่อนเข้ามา 124 วัน (FLOOR 124.5)');
        } finally {
            $this->deleteTestArea($areaId);
        }
    }
}
