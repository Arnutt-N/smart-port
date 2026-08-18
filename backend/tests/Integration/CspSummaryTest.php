<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../csp_violations.php';

/**
 * Integration tests ของ cspSummary() — แยก violation จริงออกจาก marker ของ self-test
 * และรายงาน overflow แยกต่างหาก (ถ้ามี overflow แปลว่าข้อมูลไม่ครบ ห้ามสรุปว่าสะอาด)
 */
final class CspSummaryTest extends TestCase
{
    private const TEST_DIRECTIVE = 'TEST-summary-src';

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
        if (!self::$pdo->query("SHOW TABLES LIKE 'csp_violation_daily'")->fetchColumn()) {
            self::markTestSkipped('ไม่พบตาราง csp_violation_daily — รัน database/31-csp-violation-daily.sql ก่อน');
        }
        $this->cleanUp();
    }

    protected function tearDown(): void
    {
        $this->cleanUp();
    }

    private function cleanUp(): void
    {
        // เดิม (brief) ลบเฉพาะแถวของ TEST_DIRECTIVE — เปลี่ยนมาลบ "ทุกแถวของวันนี้" แบบเดียวกับ
        // CspViolationCounterTest::cleanUp() เพราะ recordCspViolation() ใช้เพดาน
        // CSP_MAX_KEYS_PER_DAY = 200 แบบ global ข้ามทุก directive (cspKeyCountToday() นับไม่กรอง
        // directive) ถ้าตารางมีแถวของวันนี้ค้างจาก suite อื่นหรือรันก่อนหน้าเกินเพดาน การ seed
        // ในเทสนี้จะกลายเป็น 'overflow' แล้วแถวที่เทสคาดหวังจะไม่มีจริง → เทสล้มแบบสุ่ม
        self::$pdo->exec('DELETE FROM csp_violation_daily WHERE day = CURDATE()');
    }

    /** สรุปเฉพาะแถวของเทสนี้ — กรอง directive ของเทสออกจากผลรวมทั้งระบบ */
    private function summaryRowsForTest(array $summary): array
    {
        return array_values(array_filter(
            $summary['violations']['top'],
            static fn (array $row): bool => $row['directive'] === self::TEST_DIRECTIVE
        ));
    }

    #[Test]
    public function it_separates_selftest_markers_from_real_violations(): void
    {
        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'evil.example.invalid');
        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'csp-selftest-20260824-a3f9.invalid');

        $summary = cspSummary(self::$pdo, 7);

        $this->assertSame('ready', $summary['storage']);
        $rows = $this->summaryRowsForTest($summary);
        $this->assertCount(1, $rows, 'marker ของ self-test ต้องไม่ถูกนับเป็น violation');
        $this->assertSame('evil.example.invalid', $rows[0]['blocked_host']);

        $markers = array_column($summary['selftest']['markers'], 'blocked_host');
        $this->assertContains('csp-selftest-20260824-a3f9.invalid', $markers);
    }

    #[Test]
    public function it_reports_storage_unavailable_without_a_database(): void
    {
        $summary = cspSummary(null, 7);

        $this->assertSame('unavailable', $summary['storage']);
        $this->assertSame(0, $summary['violations']['total']);
    }

    #[Test]
    public function it_counts_overflow_hits_separately(): void
    {
        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, CSP_OVERFLOW_HOST);

        $summary = cspSummary(self::$pdo, 7);

        $this->assertGreaterThan(0, $summary['overflow_hits']);
        $rows = $this->summaryRowsForTest($summary);
        $this->assertCount(0, $rows, 'แถว __overflow__ ต้องไม่ปนใน violations');
    }

    #[Test]
    public function it_does_not_report_the_overflow_directive_as_a_real_directive(): void
    {
        // Task 2 (code review C1) เปลี่ยนแถว overflow ให้ key ด้วยค่าคงที่ตายตัว
        // (CSP_OVERFLOW_DIRECTIVE, CSP_OVERFLOW_HOST) เสมอคู่กัน — ต่างจากของเดิมที่ key ด้วย
        // $directive ตัวจริง (attacker คุมได้) ทำให้เพดานรวมไม่ทำงาน ที่นี่ยิงจนชนเพดานจริง
        // (เหมือน CspViolationCounterTest::it_folds_new_hosts_into_the_overflow_row_past_the_daily_cap)
        // เพื่อให้เกิดแถว (CSP_OVERFLOW_DIRECTIVE, CSP_OVERFLOW_HOST) จริง แล้วยืนยันว่า
        // CSP_OVERFLOW_DIRECTIVE ไม่โผล่ใน violations.top ในฐานะ directive จริง ไม่ใช่แค่เดาว่า
        // การกรองด้วย blocked_host คอลัมน์เดียวพอ
        for ($i = 0; $i < CSP_MAX_KEYS_PER_DAY; $i++) {
            recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, "cap-host-{$i}.invalid");
        }
        $result = recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'one-too-many.invalid');
        $this->assertSame('overflow', $result, 'setup ต้องชนเพดานจริงถึงจะมีแถว __overflow__ ให้ตรวจ');

        $summary = cspSummary(self::$pdo, 7);

        $overflowDirectiveRows = array_values(array_filter(
            $summary['violations']['top'],
            static fn (array $row): bool => $row['directive'] === CSP_OVERFLOW_DIRECTIVE
        ));
        $this->assertCount(0, $overflowDirectiveRows, 'CSP_OVERFLOW_DIRECTIVE ต้องไม่โผล่ใน violations.top');
    }

    #[Test]
    public function it_echoes_the_requested_window(): void
    {
        $summary = cspSummary(self::$pdo, 30);

        $this->assertSame(30, $summary['window_days']);
        $this->assertSame(date('Y-m-d', time() - 29 * 86400), $summary['since']);
    }
}
