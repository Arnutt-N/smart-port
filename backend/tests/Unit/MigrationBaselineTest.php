<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../scripts/migration-lib.php';

/**
 * Guards the baseline cut-off used by scripts/run-migrations.php.
 * docker-compose init + CI init + tidb-init already apply through 30;
 * only newer files execute (Issue #129 — ตัดที่ 25 ไม่ได้แล้ว เพราะ init mounts
 * ครอบถึง 30 และ 30 เป็น ALTER TABLE ADD COLUMN ที่ re-apply ซ้ำไม่ได้)
 */
final class MigrationBaselineTest extends TestCase
{
    private const BASELINE_THROUGH = '30-photo-blob-storage.sql';

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
            strnatcasecmp('31-placeholder-next.sql', self::BASELINE_THROUGH)
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
}
