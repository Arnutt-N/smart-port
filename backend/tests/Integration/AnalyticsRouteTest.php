<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

putenv('JWT_SECRET=integration-test-secret');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/analytics.php';

/**
 * Integration tests for the analytics summary route helper — verifies the response shape and
 * that per-query try/catch fallbacks keep the endpoint intact even if a table is missing.
 * Skips when MySQL is unavailable.
 */
final class AnalyticsRouteTest extends TestCase
{
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
    }

    private function capture(callable $fn): array
    {
        ob_start();
        $fn();
        return json_decode((string) ob_get_clean(), true) ?? [];
    }

    #[Test]
    public function summary_returns_expected_totals_and_distribution_keys(): void
    {
        $response = $this->capture(fn () => getAnalyticsSummary(self::$pdo));

        self::assertTrue($response['success']);
        self::assertArrayHasKey('data', $response);

        $data = $response['data'];
        self::assertArrayHasKey('totals', $data);
        self::assertArrayHasKey('proposals_by_status', $data);
        self::assertArrayHasKey('awards_by_type', $data);

        foreach (['personnel', 'civil_servants', 'awards', 'decorations', 'work_results', 'retirement_upcoming'] as $key) {
            self::assertArrayHasKey($key, $data['totals']);
            self::assertIsInt($data['totals'][$key]);
        }

        self::assertIsArray($data['proposals_by_status']);
        self::assertIsArray($data['awards_by_type']);
    }

    #[Test]
    public function scalar_helper_returns_zero_on_missing_table(): void
    {
        self::assertSame(0, analyticsScalar(self::$pdo, 'SELECT COUNT(*) FROM __no_such_table_xyz'));
    }

    #[Test]
    public function group_helper_returns_empty_on_missing_table(): void
    {
        self::assertSame([], analyticsGroup(self::$pdo, 'SELECT x AS label, COUNT(*) AS count FROM __no_such_table_xyz GROUP BY x'));
    }
}
