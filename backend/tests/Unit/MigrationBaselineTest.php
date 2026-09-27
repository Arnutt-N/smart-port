<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../scripts/migration-lib.php';

/**
 * Guards the baseline cut-off used by scripts/run-migrations.php.
 * docker-compose init + CI init + tidb-init already apply through 36;
 * only newer files execute (Issue #129 — ตัดที่ 25 ไม่ได้แล้ว เพราะ init mounts
 * ครอบถึง 30 และ 30 เป็น ALTER TABLE ADD COLUMN ที่ re-apply ซ้ำไม่ได้;
 * 32 เป็น RENAME ที่ rerun ไม่ได้เช่นกัน จึงขยับ baseline ผ่าน 32;
 * 36 เป็น ALTER ADD COLUMN + UPDATE cutover ที่ rerun ไม่ได้เช่นกัน)
 */
final class MigrationBaselineTest extends TestCase
{
    private const BASELINE_THROUGH = '36-remember-me-session-ttl.sql';

    #[Test]
    public function baseline_cut_off_matches_runner_constant(): void
    {
        self::assertSame(self::BASELINE_THROUGH, MIGRATION_BASELINE_THROUGH);
    }

    #[Test]
    public function next_migration_after_baseline_would_execute(): void
    {
        self::assertGreaterThan(
            0,
            strnatcasecmp('37-placeholder-next.sql', self::BASELINE_THROUGH)
        );
    }

    #[Test]
    public function init_mounted_migrations_are_at_or_before_baseline(): void
    {
        $historical = [
            '03-personnel-stubs.sql',
            '09-auth-users.sql',
            '14-multiplier-area-admin.sql',
            '15-api-rate-limit-hits.sql',
            '22-unify-person-identity.sql',
            '25-ensure-multiplier-tables.sql',
            '27-superadmin-permission-overrides.sql',
            '30-photo-blob-storage.sql',
            '31-csp-violation-daily.sql',
            '32-rename-servant-id.sql',
            '33-drop-photo-versions-and-dead-views.sql',
            '34-password-history.sql',
            '35-fk-retrofit.sql',
            '36-remember-me-session-ttl.sql',
        ];

        foreach ($historical as $name) {
            self::assertLessThanOrEqual(
                0,
                strnatcasecmp($name, self::BASELINE_THROUGH),
                "{$name} should be covered by baseline"
            );
        }
    }

    #[Test]
    public function test_seed_filename_is_detectable_for_baseline_skip(): void
    {
        self::assertStringContainsString('test-seed', '16-multiplier-test-seed-expand.sql');
    }

    #[Test]
    public function migration_36_uses_the_canonical_cutover_update(): void
    {
        // กุญแจกัน replay: legacy_cutover เป็น reason เดียวที่ refreshSession
        // ปฏิเสธโดยไม่ kill-all — ถ้า migration เปลี่ยนเป็น revoke แบบไม่ใส่ reason
        // cookie เก่าจะ kill session ใหม่ทุกใบตอน cutover จริง
        $sql = file_get_contents(__DIR__ . '/../../../database/36-remember-me-session-ttl.sql');
        self::assertIsString($sql);

        self::assertStringContainsString("revocation_reason = 'legacy_cutover'", $sql);
        self::assertStringContainsString('WHERE revoked_at IS NULL', $sql);
        // canonical UPDATE ต้องมีรูปแบบเดียว — นี่คือคำ revoke เพียงคำเดียวในไฟล์
        self::assertSame(1, substr_count($sql, 'SET revoked_at'));
        // paired columns ครบ
        self::assertStringContainsString('remember_me TINYINT(1) NOT NULL DEFAULT 0', $sql);
        self::assertStringContainsString('revocation_reason VARCHAR(32) NULL DEFAULT NULL', $sql);
    }

    #[Test]
    public function baseline_guard_skips_marker_when_column_missing(): void
    {
        // ไฟล์อื่นไม่แตะ PDO เลย
        $unusedPdo = self::createMock(\PDO::class);
        self::assertFalse(baselineRequiresRealApply($unusedPdo, '35-fk-retrofit.sql'));

        // คอลัมน์หาย/เข้าถึงไม่ได้ = fail-closed (ห้าม baseline)
        $missingPdo = self::createMock(\PDO::class);
        $missingPdo->method('query')->willReturn(false);
        self::assertTrue(baselineRequiresRealApply($missingPdo, '36-remember-me-session-ttl.sql'));

        $throwPdo = self::createMock(\PDO::class);
        $throwPdo->method('query')->willThrowException(new \PDOException('no table'));
        self::assertTrue(baselineRequiresRealApply($throwPdo, 'database/36-remember-me-session-ttl.sql'));

        // คอลัมน์มีแล้ว = baseline ได้
        $stmt = self::createMock(\PDOStatement::class);
        $stmt->method('fetch')->willReturn(['Field' => 'remember_me']);
        $okPdo = self::createMock(\PDO::class);
        $okPdo->method('query')->willReturn($stmt);
        self::assertFalse(baselineRequiresRealApply($okPdo, '36-remember-me-session-ttl.sql'));
    }
}
