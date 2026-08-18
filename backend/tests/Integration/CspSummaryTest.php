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
        //
        // Issue #113 code review M1: ยังไม่พอ — cspSummary() ควอรีข้าม "ทั้งหน้าต่าง" ไม่ใช่
        // แค่วันนี้ (it_echoes_the_requested_window ใช้ days=30, handleCspSummary() ยอมรับสูงสุด
        // days=90) และ violations.top ถูกตัดที่ LIMIT 50 — ถ้ามีแถวของวันก่อน ๆ ค้างอยู่ในหน้าต่าง
        // นั้น (เช่นรันเทสไฟล์นี้ซ้ำหลายวันโดยไม่ล้าง หรือ suite อื่นเขียนวันที่ไม่ใช่วันนี้)
        // แถวเก่าอาจเบียดแถวของเทสตกอันดับใน top หรือรวมเข้า total ผิด ล้างทั้งหน้าต่าง 90 วัน
        // (ค่าสูงสุดที่ระบบยอมรับ) ให้ครอบคลุมทุกเทสในไฟล์นี้แน่นอน
        self::$pdo->exec('DELETE FROM csp_violation_daily WHERE day >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)');
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
        // Issue #113 code review M3: hits/last_seen เป็นส่วนหนึ่งของสัญญาที่ Task 4 (สคริปต์
        // gate) พึ่งพา แต่ก่อนหน้านี้ไม่มีเทสไหนแตะเลย — recordCspViolation() ครั้งเดียวต้องได้
        // hits=1 และ last_seen ต้องไม่ว่าง (มาจาก MAX(last_seen) ของแถวจริงใน DB)
        $this->assertSame(1, $rows[0]['hits']);
        $this->assertNotEmpty($rows[0]['last_seen'], 'last_seen ต้องมาจากแถวจริง ไม่ใช่ค่าว่าง/null');

        $markers = array_column($summary['selftest']['markers'], 'blocked_host');
        $this->assertContains('csp-selftest-20260824-a3f9.invalid', $markers);

        $markerRow = current(array_filter(
            $summary['selftest']['markers'],
            static fn (array $m): bool => $m['blocked_host'] === 'csp-selftest-20260824-a3f9.invalid'
        ));
        $this->assertIsArray($markerRow);
        $this->assertSame(1, $markerRow['hits']);
        $this->assertNotEmpty($markerRow['last_seen']);
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

    #[Test]
    public function it_does_not_report_ready_when_a_query_fails_partway_through(): void
    {
        // Issue #113 code review I2 — failure mode ที่แพงที่สุดของ endpoint นี้: ตั้ง
        // storage='ready' ก่อนดึงผลลัพธ์จริงครบ ทำให้ query ที่ล้มเหลวกลางฟังก์ชันกลายเป็น
        // "ready + 0 violation" แทน "ไม่รู้" — สคริปต์ gate (Task 4) จะอ่านว่าพร้อมและสะอาด
        // ทั้งที่จริงคือสรุปไม่สำเร็จ ใช้ FlakyPreparePdo (ต่อ MySQL จริง แค่ prepare() ครั้งที่
        // เกิน $succeedCalls จะ throw) จำลอง query กลางฟังก์ชันล้มเหลวโดยไม่ต้องแตะ schema จริง
        //
        // cspSummary() ยิง prepare() ตามลำดับ: sinceStmt(1) → total(2) → top(3) → markers(4)
        // → overflow(5) — ให้ 2 คำสั่งแรกผ่าน (เหมือน query จริงเริ่มทำงานแล้ว) แล้วให้คำสั่งที่ 3
        // (top) ล้มเหลว จำลอง "query กลางคันพัง" ที่ finding นี้พูดถึงตรง ๆ
        $originalCache = $GLOBALS['_csp_table_ready'];
        $GLOBALS['_csp_table_ready'] = true; // ข้าม SHOW TABLES จริง — เทสนี้ไม่ได้ทดสอบจุดนั้น
        try {
            $flaky = self::buildFlakyPdo(succeedCalls: 2);

            $summary = cspSummary($flaky, 7);

            $this->assertNotSame(
                'ready',
                $summary['storage'],
                'query ล้มเหลวกลางฟังก์ชันต้องไม่รายงานว่า ready — ผู้บริโภคจะเข้าใจผิดว่าสะอาดจริง'
            );
            $this->assertSame(0, $summary['violations']['total']);
            $this->assertSame([], $summary['violations']['top']);
        } finally {
            $GLOBALS['_csp_table_ready'] = $originalCache;
        }
    }

    /**
     * สร้าง PDO ที่ต่อ MySQL จริงตามปกติ (เหมือน testPdo()) แต่ prepare() ครั้งที่เกิน
     * $succeedCalls จะ throw PDOException — ใช้จำลอง "query ล้มเหลวกลางฟังก์ชัน" แบบปลอดภัย
     * โดยไม่ต้องแตะ schema จริง (ไม่ DROP/RENAME ตาราง — วิธีที่ brief เตือนว่าอันตราย)
     */
    private static function buildFlakyPdo(int $succeedCalls): FlakyPreparePdo
    {
        $host   = getenv('MYSQL_HOST') ?: 'db';
        $port   = getenv('MYSQL_PORT') ?: '3306';
        $dbname = getenv('MYSQL_DATABASE') ?: 'civil_service_mgmt';
        $user   = getenv('MYSQL_USER') ?: 'root';
        $pass   = getenv('MYSQL_PASSWORD');
        if ($pass === false) {
            $pass = 'rootpassword';
        }

        $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";

        return new FlakyPreparePdo($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_TIMEOUT            => 4,
        ], $succeedCalls);
    }
}

/**
 * PDO ทดสอบสำหรับ it_does_not_report_ready_when_a_query_fails_partway_through — ต่อ MySQL
 * จริงผ่าน parent::__construct() ตามปกติทุกประการ (ไม่ใช่ mock) แค่ override prepare() ให้
 * นับจำนวนครั้งที่ถูกเรียก แล้ว throw PDOException เมื่อเกิน $succeedCalls ครั้ง — จำลอง
 * connection/query หลุดกลางฟังก์ชันโดยไม่ต้องแก้ schema หรือ permission ของ DB จริงเลย
 */
final class FlakyPreparePdo extends PDO
{
    private int $prepareCalls = 0;

    public function __construct(
        string $dsn,
        string $user,
        string $pass,
        array $options,
        private readonly int $succeedCalls
    ) {
        parent::__construct($dsn, $user, $pass, $options);
    }

    public function prepare(string $query, array $options = []): \PDOStatement|false
    {
        $this->prepareCalls++;
        if ($this->prepareCalls > $this->succeedCalls) {
            throw new \PDOException(
                "simulated failure: prepare() call #{$this->prepareCalls} (succeedCalls={$this->succeedCalls})"
            );
        }
        return parent::prepare($query, $options);
    }
}
