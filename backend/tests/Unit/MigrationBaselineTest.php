<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../scripts/migration-lib.php';

/**
 * Guards the baseline cut-off used by scripts/run-migrations.php.
 * docker-compose init + tidb-init already apply through 25; only newer files execute.
 */
final class MigrationBaselineTest extends TestCase
{
    private const BASELINE_THROUGH = '25-ensure-multiplier-tables.sql';

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
            strnatcasecmp('26-placeholder-next.sql', self::BASELINE_THROUGH)
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
