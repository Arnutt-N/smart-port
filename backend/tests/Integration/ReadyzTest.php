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

        // Issue #129: harness (run.sh/CI) mount database/ เข้า /database และรัน
        // migration runner ก่อน suite แล้ว → bundled/pending วัดจาก state จริง ไม่ว่างเปล่า
        $this->assertSame('ready', $report['status']);
        $this->assertSame('ok', $report['db']);
        $this->assertSame(0, $report['migrations_pending']);
        $this->assertArrayHasKey('release', $report);

        // bundled ต้องเห็นไฟล์จริง (กัน regression กลับไป bundled=[]) —
        // readyzReport นับทุกไฟล์ในโฟลเดอร์ (ไม่กรอง test-seed; การกรองมีเฉพาะฝั่ง pending)
        $expectedBundled = count(listMigrationFiles(migrationDirectory()));
        $this->assertGreaterThan(0, $report['migrations_bundled']);
        $this->assertSame($expectedBundled, $report['migrations_bundled']);

        // minimal disclosure: มีแค่ key สถานะ/ตัวเลข — ไม่มีรายการ schema/migration รั่วออกมา
        $this->assertSame(
            ['status', 'release', 'db', 'migrations_bundled', 'migrations_pending'],
            array_keys($report)
        );
    }

    public function test_report_detects_missing_migration_row(): void
    {
        // Issue #129: negative case — row หายจาก schema_migrations ต้องถูกจับจริง
        // (ดึง migration สุดท้ายที่ไม่ใช่ test-seed ตาม natural order)
        $files = array_values(array_filter(
            listMigrationFiles(migrationDirectory()),
            static fn (string $path): bool => !str_contains(basename($path), 'test-seed')
        ));
        if ($files === []) {
            $this->markTestSkipped('no non-test-seed migrations bundled');
        }
        $name = basename(end($files));

        $stmt = self::$pdo->prepare('SELECT 1 FROM schema_migrations WHERE migration_name = ?');
        $stmt->execute([$name]);
        if (!$stmt->fetchColumn()) {
            $this->markTestSkipped("{$name} not applied in this environment");
        }

        self::$pdo->prepare('DELETE FROM schema_migrations WHERE migration_name = ?')
            ->execute([$name]);
        try {
            $report = readyzReport(self::$pdo);
            $this->assertSame('migrations_pending', $report['status']);
            $this->assertSame(1, $report['migrations_pending']);
        } finally {
            // restore แถวที่ลบ — ตารางนี้ share กับ suite อื่น/การรันซ้ำ
            // (applied_at ถูก reset เป็น now — ไม่มี consumer ของคอลัมน์นี้)
            self::$pdo->prepare('INSERT INTO schema_migrations (migration_name) VALUES (?)')
                ->execute([$name]);
        }
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
