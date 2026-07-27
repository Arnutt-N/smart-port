<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../scripts/migration-lib.php';

/**
 * Guards the production baseline cut-off used by scripts/run-migrations.php.
 * Existing TiDB DBs already have migrations through 14; only 15+ should execute.
 */
final class MigrationBaselineTest extends TestCase
{
    private const BASELINE_THROUGH = '14-multiplier-area-admin.sql';

    #[Test]
    public function baseline_cut_off_matches_runner_constant(): void
    {
        self::assertSame(self::BASELINE_THROUGH, MIGRATION_BASELINE_THROUGH);
    }

    #[Test]
    public function net_new_rate_limit_migration_is_after_baseline(): void
    {
        self::assertGreaterThan(
            0,
            strnatcasecmp('15-api-rate-limit-hits.sql', self::BASELINE_THROUGH)
        );
    }

    #[Test]
    public function historical_migrations_are_at_or_before_baseline(): void
    {
        $historical = [
            '03-personnel-stubs.sql',
            '09-auth-users.sql',
            '13-multiplier-time-counting.sql',
            '14-multiplier-area-admin.sql',
        ];

        foreach ($historical as $name) {
            self::assertLessThanOrEqual(
                0,
                strnatcasecmp($name, self::BASELINE_THROUGH),
                "{$name} should be covered by baseline"
            );
        }
    }
}
