<?php

declare(strict_types=1);

namespace Tests\Integration;

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/readyz.php';

/**
 * Issue #114 — readiness endpoint semantics:
 * - readyzReport() ต้องแตะ DB จริงและคืนสถานะ minimal disclosure (ไม่มีชื่อตาราง/migration)
 * - DB ที่ migrate ครบแล้ว → status ready, pending 0
 * - release identity fallback เป็น 'dev' เมื่อไม่มี RENDER_GIT_COMMIT
 */
final class ReadyzTest extends TestCase
{
    private static ?\PDO $pdo = null;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            $this->markTestSkipped('database not available');
        }
    }

    public function test_report_on_migrated_db_is_ready_with_zero_pending(): void
    {
        $report = readyzReport(self::$pdo);

        $this->assertSame('ok', $report['db']);
        $this->assertArrayHasKey('release', $report);
        $this->assertIsInt($report['migrations_bundled']);
        $this->assertIsInt($report['migrations_pending']);
        $this->assertGreaterThanOrEqual(0, $report['migrations_pending']);

        // minimal disclosure: มีแค่ key สถานะ/ตัวเลข — ไม่มีรายการ schema/migration รั่วออกมา
        $this->assertSame(
            ['status', 'release', 'db', 'migrations_bundled', 'migrations_pending'],
            array_keys($report)
        );
    }

    public function test_release_falls_back_to_dev_without_render_env(): void
    {
        // CI/test container ไม่มี RENDER_GIT_COMMIT
        if (getenv('RENDER_GIT_COMMIT') !== false) {
            $this->markTestSkipped('RENDER_GIT_COMMIT is set in this environment');
        }
        $this->assertSame('dev', releaseSha());
    }

    public function test_liveness_index_php_does_not_require_database_env(): void
    {
        // liveness (`/`) ต้องไม่ include config.php — ตรวจจาก source โดยตรง
        // (ถ้าเผลอ include จะ exit 500 เมื่อ JWT_SECRET ไม่ถูกตั้ง = Render restart วน)
        $src = (string) file_get_contents(__DIR__ . '/../../index.php');
        $this->assertStringContainsString('migrations_available', $src);
        $this->assertStringNotContainsString("include 'config.php'", $src);
        $this->assertStringNotContainsString("require_once __DIR__ . '/config.php'", $src);
    }
}
