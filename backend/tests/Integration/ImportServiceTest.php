<?php

declare(strict_types=1);

namespace Tests\Integration;

use ImportService;
use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use QualificationEngine;
use Throwable;

/**
 * Integration test สำหรับ ImportService — parse xlsx + validate + insert (transaction)
 * แล้วยืนยันว่า QualificationEngine คำนวณ executive ได้หลังนำเข้า (ปลดล็อกคุณค่าจริง)
 *
 * ใช้ citizen_id ช่วง 11001002990xx เป็น test data → cleanup ทุก setUp/tearDown
 */
final class ImportServiceTest extends TestCase
{
    private const SAMPLE = __DIR__ . '/../fixtures/import-sample.xlsx';
    private static ?PDO $pdo = null;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — integration ข้าม');
        }
        if (!is_file(self::SAMPLE)) {
            self::markTestSkipped('ไม่พบ fixture import-sample.xlsx (สร้างด้วย scripts/gen-import-xlsx.py)');
        }
        $this->cleanup();
    }

    protected function tearDown(): void
    {
        if (self::$pdo !== null) {
            $this->cleanup();
        }
    }

    #[Test]
    public function it_imports_workbook_and_unlocks_executive_calc(): void
    {
        $result = (new ImportService(self::$pdo))->importFromFile(self::SAMPLE);

        self::assertTrue($result['success'], 'import ล้มเหลว: ' . implode(' | ', $result['errors']));
        self::assertSame(2, $result['summary']['personnel']);
        self::assertSame(1, $result['summary']['diverse']);

        // engine คำนวณได้หลังนำเข้า — executive ไม่ว่างอีกต่อไป
        $engine = new QualificationEngine(self::$pdo);

        $m1 = $engine->computeDetail('M1', $this->personnelId('1100100299001'));
        self::assertNotNull($m1);
        // K3 2020-01-01 +3ปี = 2023-01-01 (MAX กับ 3 ต่าง 2018-01-01)
        self::assertSame('2023-01-01', $m1['data']['qualification_date']);

        $s2 = $engine->computeDetail('S2', $this->personnelId('1100100299002'));
        self::assertNotNull($s2);
        // S1 2022-01-01 +1ปี = 2023-01-01
        self::assertSame('2023-01-01', $s2['data']['qualification_date']);
    }

    #[Test]
    public function it_returns_error_when_file_missing(): void
    {
        $result = (new ImportService(self::$pdo))->importFromFile(__DIR__ . '/nonexistent.xlsx');

        self::assertFalse($result['success']);
        self::assertNotEmpty($result['errors']);
    }

    private function personnelId(string $citizenId): int
    {
        $stmt = self::$pdo->prepare('SELECT personnel_id FROM personnel WHERE citizen_id = ?');
        $stmt->execute([$citizenId]);
        return (int) $stmt->fetchColumn();
    }

    private function cleanup(): void
    {
        $ids = "SELECT personnel_id FROM personnel WHERE citizen_id LIKE '11001002990%'";
        try {
            self::$pdo->exec("DELETE FROM diverse_experience WHERE personnel_id IN ({$ids})");
            self::$pdo->exec("DELETE FROM position_equivalence WHERE personnel_id IN ({$ids})");
            self::$pdo->exec("DELETE FROM personnel_position_history WHERE personnel_id IN ({$ids})");
            self::$pdo->exec("DELETE FROM personnel WHERE citizen_id LIKE '11001002990%'");
        } catch (Throwable $e) {
            // ตารางอาจยังไม่มีในบาง schema — ปล่อยให้ test จริงจับ
        }
    }
}
