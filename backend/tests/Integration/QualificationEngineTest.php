<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use QualificationEngine;
use Throwable;

/**
 * Integration tests สำหรับ QualificationEngine — รันกับ MySQL จริง (docker compose db)
 *
 * เทสต์ตรรกะหลักทั้งสอง path:
 *   - buildBaseQuery (K/O linear)        — DATE_ADD + DATE_SUB(supportive/equivalence)
 *   - buildExecutiveQuery (M/S multi-path) — UNION ALL + MIN(qual_date) + gate 3 ต่าง/เทียบตำแหน่ง
 *
 * golden values อ้างอิง database/06-seed-data.sql (personnel 1-5 = K/O, 101-107 = executive)
 * และตรงกับ backend/tests/verify-executive.sh (เวอร์ชัน HTTP เดิม)
 *
 * assert เฉพาะ qualification_date (deterministic จาก data) — ไม่ assert qualified/not_yet
 * เพราะผูกกับ CURDATE() (เปลี่ยนทุกวัน) ดู NEAR_THRESHOLD ใน engine
 */
final class QualificationEngineTest extends TestCase
{
    private static ?PDO $pdo = null;
    private static bool $seedReady = false;
    private QualificationEngine $engine;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
        if (self::$pdo === null) {
            return;
        }
        // ยืนยันว่า seed executive (101-107) ถูก import แล้ว ก่อนเชื่อ golden values
        try {
            $count = (int) self::$pdo
                ->query('SELECT COUNT(*) FROM personnel WHERE personnel_id BETWEEN 101 AND 107')
                ->fetchColumn();
            self::$seedReady = $count >= 7;
        } catch (Throwable $e) {
            self::$seedReady = false;
        }
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped(
                'ต่อ MySQL ไม่ได้ — รัน unit suite แยกได้, integration ข้าม (ดู tests/run.sh)'
            );
        }
        if (!self::$seedReady) {
            self::markTestSkipped(
                'seed executive (personnel 101-107) ไม่ครบ — รัน: docker compose down -v && docker compose up -d --build db backend'
            );
        }
        $this->engine = new QualificationEngine(self::$pdo);
    }

    /**
     * golden case: วันมีคุณสมบัติ (qualification_date) ตรงกับที่คำนวณจาก Excel/เกณฑ์
     */
    #[Test]
    #[DataProvider('qualificationDateProvider')]
    public function it_computes_qualification_date(string $target, int $personnelId, string $expected): void
    {
        $result = $this->engine->computeDetail($target, $personnelId);

        self::assertNotNull(
            $result,
            "computeDetail('{$target}', {$personnelId}) คืน null — ตรวจ seed/personnel"
        );
        self::assertSame(
            $expected,
            $result['data']['qualification_date'],
            "qualification_date ของ {$target}/{$personnelId} ไม่ตรง golden"
        );
    }

    /**
     * @return array<string, array{string, int, string}>
     */
    public static function qualificationDateProvider(): array
    {
        return [
            // --- Executive (M/S multi-path) — ตรงกับ verify-executive.sh ---
            'M1 จาก K3 +3ปี (MAX กับวันครบ 3 ต่าง)' => ['M1', 101, '2023-08-26'],
            'M1 จาก O3 +6ปี'                          => ['M1', 102, '2024-03-28'],
            'M2 จาก M1 +1ปี'                          => ['M2', 103, '2021-08-26'],
            'M2 combination M1+K3 รวม 4 (เร็วสุด)'    => ['M2', 105, '2023-06-01'],
            'S1 จาก M1 +2ปี'                          => ['S1', 103, '2022-08-26'],
            'S1 จาก K4 +2ปี (มีเทียบตำแหน่ง)'         => ['S1', 106, '2024-01-01'],
            'S2 จาก S1 +1ปี'                          => ['S2', 107, '2025-01-01'],

            // --- K/O linear (buildBaseQuery) — coverage ใหม่ ไม่เคยมี automated test ---
            'K2 จาก K1 +6ปี (BACHELOR)'               => ['K2', 1, '2026-06-01'],
            'K3 จาก K2 +4ปี (ANY)'                    => ['K3', 2, '2023-03-15'],
            'K4 จาก K3 +3ปี (ANY)'                    => ['K4', 3, '2021-10-01'],
            'O2 จาก O1 +5ปี (HIGH_VOCATIONAL)'        => ['O2', 4, '2026-04-01'],
            'O3 จาก O2 +6ปี (ANY)'                    => ['O3', 5, '2026-01-15'],
        ];
    }

    /**
     * gate: M1 ที่ขาด "3 ต่าง" (diverse_experience) ต้องเป็น check_data ไม่ใช่คำนวณวันมั่ว
     * personnel 104 = K3 ครบ 3 ปีแล้ว แต่ไม่มี diverse record → ไม่มี path → check_data
     */
    #[Test]
    public function it_flags_check_data_when_diverse_gate_is_missing(): void
    {
        $result = $this->engine->computeDetail('M1', 104);

        self::assertNotNull($result);
        self::assertSame('check_data', $result['data']['status']);
        self::assertNull($result['data']['qualification_date']);
    }

    /**
     * list endpoint: computeForLevel คืน summary จาก full dataset + pagination shape ครบ
     */
    #[Test]
    public function it_lists_candidates_with_full_dataset_summary(): void
    {
        $result = $this->engine->computeForLevel('M1', null, 100, 0);

        self::assertTrue($result['success']);
        self::assertArrayHasKey('summary', $result);
        self::assertArrayHasKey('pagination', $result);

        $summary = $result['summary'];
        // total = qualified + not_yet + check_data (ทุก row ถูกจัดหมวดครบ ไม่ตกหล่น)
        self::assertSame(
            $summary['total'],
            $summary['qualified'] + $summary['not_yet'] + $summary['check_data'],
            'ผลรวม status ไม่เท่ากับ total — มี row หลุดการจัดหมวด'
        );
        self::assertGreaterThan(0, $summary['total'], 'M1 ต้องมีผู้สมัครจาก seed (101,102,104)');
    }

    /**
     * detail ต้องตรงกับ list เสมอ (legal requirement) — qualification_date ของ computeDetail
     * ต้องเท่ากับ row เดียวกันใน computeForLevel
     */
    #[Test]
    public function it_keeps_detail_consistent_with_list(): void
    {
        $list = $this->engine->computeForLevel('M1', null, 100, 0);
        $detail = $this->engine->computeDetail('M1', 101);

        $listRow = null;
        foreach ($list['data'] as $row) {
            if ((int) $row['personnel_id'] === 101) {
                $listRow = $row;
                break;
            }
        }

        self::assertNotNull($listRow, 'ไม่พบ personnel 101 ใน list M1');
        self::assertSame(
            $listRow['qualification_date'],
            $detail['data']['qualification_date'],
            'qualification_date ของ detail ไม่ตรงกับ list'
        );
    }
}
