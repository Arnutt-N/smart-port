<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../csp_violations.php';

/**
 * Integration tests ของตัวนับ CSP violation (issue #113)
 * เขียนลงตาราง csp_violation_daily จริงแล้วอ่านกลับมาตรวจ
 *
 * ใช้ directive ที่ขึ้นต้นด้วย TEST- เพื่อไม่ชนข้อมูลจริง และลบทิ้งใน tearDown
 */
final class CspViolationCounterTest extends TestCase
{
    private const TEST_DIRECTIVE = 'TEST-img-src';

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
        $exists = self::$pdo->query("SHOW TABLES LIKE 'csp_violation_daily'")->fetchColumn();
        if (!$exists) {
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
        // Issue #113 code review I4: ลบ "ทุกแถวของวันนี้" ไม่ใช่แค่ directive = TEST_DIRECTIVE
        // เพราะเพดาน CSP_MAX_KEYS_PER_DAY เป็น global cap ข้ามทุก directive
        // (cspKeyCountToday() ใน csp_violations.php นับไม่กรอง directive) ถ้าตารางมีแถวของ
        // directive อื่นค้างอยู่ของวันนี้ (เช่นเทสนี้เอง ปล่อยตกค้างจากรันก่อนหน้า หรือเทส
        // it_caps_total_rows_even_when_new_violations_use_distinct_directives ที่ใช้หลาย
        // directive) เพดานจริงจะถูกนับรวมด้วย ทำให้เทสอื่นได้ 'overflow' แทน 'recorded' หรือ
        // assertion ที่เทียบ before/after ผิดแบบสุ่ม — ตารางนี้ใช้เฉพาะเทส (test DB) จึงล้าง
        // ทั้งวันได้อย่างปลอดภัย
        self::$pdo->exec('DELETE FROM csp_violation_daily WHERE day = CURDATE()');
    }

    private function hitsOf(string $blockedHost): int
    {
        return $this->hitsOfDirectiveHost(self::TEST_DIRECTIVE, $blockedHost);
    }

    private function hitsOfDirectiveHost(string $directive, string $blockedHost): int
    {
        $stmt = self::$pdo->prepare(
            'SELECT hits FROM csp_violation_daily WHERE day = CURDATE() AND directive = ? AND blocked_host = ?'
        );
        $stmt->execute([$directive, $blockedHost]);
        return (int) $stmt->fetchColumn();
    }

    private function keyCount(): int
    {
        $stmt = self::$pdo->prepare(
            'SELECT COUNT(*) FROM csp_violation_daily WHERE day = CURDATE() AND directive = ?'
        );
        $stmt->execute([self::TEST_DIRECTIVE]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * นับ key ของ "วันนี้ทุก directive" ไม่กรองเฉพาะ TEST_DIRECTIVE
     *
     * ต้องใช้ตัวนี้เทียบก่อน/หลังของเทส cap แทน keyCount() เพราะโค้ดจริง
     * cspKeyCountToday() นับทุกแถวของวันนี้ไม่สนใจ directive (ดู csp_violations.php)
     * ถ้าเทสนับด้วย keyCount() (กรองเฉพาะ TEST_DIRECTIVE) แล้ว DB มีแถว directive
     * อื่นค้างอยู่พร้อมกัน (suite อื่นรันคู่ขนาน/ทิ้งข้อมูลไว้) เพดานจริงจะถูกชนก่อน
     * ครบลูปตามที่เทสคาดไว้ ทำให้ assert ล้มแบบสุ่มโดยไม่เกี่ยวกับบั๊กจริง
     */
    private function totalKeysToday(): int
    {
        $stmt = self::$pdo->query('SELECT COUNT(*) FROM csp_violation_daily WHERE day = CURDATE()');
        return (int) $stmt->fetchColumn();
    }

    #[Test]
    public function it_creates_a_row_with_one_hit_for_a_new_host(): void
    {
        $result = recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'example.invalid');

        $this->assertSame('recorded', $result);
        $this->assertSame(1, $this->hitsOf('example.invalid'));
    }

    #[Test]
    public function it_increments_instead_of_adding_a_row_for_a_repeated_host(): void
    {
        // หมายเหตุ (code review M7 แก้คอมเมนต์เดิมที่อ้างผิด — ของเดิมบอกว่าเทสนี้ "จะพังทันที"
        // ถ้าเปิด PDO::MYSQL_ATTR_FOUND_ROWS แต่ไม่จริง): hits/keyCount ที่เทสนี้ assert
        // มาจาก query ตรงกับตารางหลังการเขียนจริงสองครั้ง ไม่ได้พึ่งค่าที่ recordCspViolation()
        // คืนกลับมา ต่อให้ rowCount() ตีความ isNewKey ผิดพลาดจาก FOUND_ROWS เทสนี้ก็ยังผ่านอยู่ดี
        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'example.invalid');
        $result = recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'example.invalid');

        $this->assertSame('recorded', $result);
        $this->assertSame(2, $this->hitsOf('example.invalid'));
        $this->assertSame(1, $this->keyCount());
    }

    #[Test]
    public function it_folds_new_hosts_into_the_overflow_row_past_the_daily_cap(): void
    {
        for ($i = 0; $i < CSP_MAX_KEYS_PER_DAY; $i++) {
            recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, "host{$i}.invalid");
        }
        // นับข้ามทุก directive (ดู totalKeysToday()) เพราะ cspKeyCountToday() ของจริงทำแบบนั้น
        $before = $this->totalKeysToday();

        $result = recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'one-too-many.invalid');

        $this->assertSame('overflow', $result);
        $this->assertSame(0, $this->hitsOf('one-too-many.invalid'), 'host ที่เกิน cap ต้องไม่มีแถวของตัวเอง');
        // overflow row เก็บที่ (CSP_OVERFLOW_DIRECTIVE, CSP_OVERFLOW_HOST) ไม่ใช่
        // (TEST_DIRECTIVE, CSP_OVERFLOW_HOST) — ยุบรวมข้ามทุก directive ตาม C1
        $this->assertGreaterThanOrEqual(1, $this->hitsOfDirectiveHost(CSP_OVERFLOW_DIRECTIVE, CSP_OVERFLOW_HOST));
        $this->assertSame($before + 1, $this->totalKeysToday(), 'โตได้แค่แถว __overflow__ แถวเดียว');
    }

    #[Test]
    public function it_caps_total_rows_even_when_new_violations_use_distinct_directives(): void
    {
        // C1 (code review): cspFoldIntoOverflow() เดิมเขียนแถวรวมแบบ per-directive
        // (CURDATE(), $directive, '__overflow__') แต่เพดานเป็น global (คิดข้ามทุก
        // directive ผ่าน cspKeyCountToday()) ถ้า attacker ยิงด้วย directive ที่ไม่ซ้ำกัน
        // ทุกครั้ง แถวรวมจะไม่ถูก upsert ทับกันเลย (key ต่างกันทุกครั้ง) ทำให้ตารางโตต่อไป
        // ได้เรื่อย ๆ ไม่มีเพดานจริง — เทสนี้ยิงจนชนเพดานด้วย TEST_DIRECTIVE ก่อน แล้วยิงต่อ
        // ด้วย directive ที่ไม่ซ้ำกันหลายสิบตัว ต้องเห็นว่าแถวรวมของวันนี้ไม่โตอีกเลย
        for ($i = 0; $i < CSP_MAX_KEYS_PER_DAY; $i++) {
            recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, "cap-host-{$i}.invalid");
        }
        // ยิงอีกครั้งให้ชนเพดานแน่นอน (สร้าง overflow row ตัวแรกของวันนี้)
        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'trigger-overflow.invalid');
        $before = $this->totalKeysToday();

        for ($i = 0; $i < 25; $i++) {
            $result = recordCspViolation(self::$pdo, self::TEST_DIRECTIVE . "-distinct-{$i}", 'same-host.invalid');
            $this->assertSame('overflow', $result, "directive ที่ไม่ซ้ำกันตัวที่ {$i} ก็ต้องถูกยุบเข้า overflow ด้วย");
        }

        $this->assertSame(
            $before,
            $this->totalKeysToday(),
            'จำนวนแถวรวมของวันนี้ต้องไม่โตอีกแม้ violation ใหม่จะใช้ directive ที่ไม่ซ้ำกันทุกครั้ง'
        );
    }

    #[Test]
    public function it_returns_skipped_when_there_is_no_database(): void
    {
        $this->assertSame('skipped', recordCspViolation(null, self::TEST_DIRECTIVE, 'example.invalid'));
    }

    #[Test]
    public function it_returns_skipped_when_the_table_is_missing(): void
    {
        // จำลองสถานะ production ก่อนรัน DDL — handler ต้องไม่พังและ contract 204 ต้องไม่เปลี่ยน
        $original = $GLOBALS['_csp_table_ready'];
        $GLOBALS['_csp_table_ready'] = false;
        try {
            $this->assertSame('skipped', recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'example.invalid'));
            $this->assertSame(0, $this->hitsOf('example.invalid'));
        } finally {
            $GLOBALS['_csp_table_ready'] = $original;
        }
    }

    #[Test]
    public function it_prunes_rows_past_the_retention_window_without_touching_recent_ones(): void
    {
        // prune เป็น DELETE ที่ถ้าเขียนผิดจะกินข้อมูลปัจจุบันทิ้ง — ต้องมีเทสยืนยันขอบเขต
        $stale = date('Y-m-d', time() - (CSP_RETENTION_DAYS + 30) * 86400);
        self::$pdo->prepare(
            'INSERT INTO csp_violation_daily (day, directive, blocked_host, hits) VALUES (?, ?, ?, 1)'
        )->execute([$stale, self::TEST_DIRECTIVE, 'old.invalid']);

        // prune ทำงานเฉพาะตอนสร้าง key ใหม่
        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'fresh.invalid');

        $stmt = self::$pdo->prepare(
            'SELECT COUNT(*) FROM csp_violation_daily WHERE directive = ? AND day = ?'
        );
        $stmt->execute([self::TEST_DIRECTIVE, $stale]);
        $this->assertSame(0, (int) $stmt->fetchColumn(), 'แถวเก่ากว่า retention ต้องถูกลบ');
        $this->assertSame(1, $this->hitsOf('fresh.invalid'), 'แถวของวันนี้ต้องไม่ถูกแตะ');
    }

    #[Test]
    public function it_truncates_values_to_column_width(): void
    {
        $longHost = str_repeat('a', 200) . '.invalid';

        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, $longHost);

        $this->assertSame(1, $this->hitsOf(substr($longHost, 0, 128)));
    }
}
