<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

putenv('JWT_SECRET=integration-test-secret');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/retirement.php';

/**
 * Integration tests for the retirement report route helper — seeds a servant with a near-term
 * retirement_date and checks the list shape + computed remaining_days. Read-only route.
 * Skips when MySQL or the civil_servants table is unavailable.
 */
final class RetirementRouteTest extends TestCase
{
    private static ?PDO $pdo = null;
    private int $servantId = 0;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        if (!self::$pdo->query("SHOW TABLES LIKE 'civil_servants'")->fetchColumn()) {
            self::markTestSkipped('ไม่พบตาราง civil_servants');
        }

        $suffix = bin2hex(random_bytes(4));
        self::$pdo->prepare(
            'INSERT INTO civil_servants (employee_id, citizen_id, first_name, last_name, birth_date, appointment_date, retirement_date, is_active)
             VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 90 DAY), 1)'
        )->execute(["EMP-{$suffix}", substr('9' . $suffix . '0000000000', 0, 13), 'ทดสอบ', 'เกษียณ', '1965-01-01', '1990-01-01']);
        $this->servantId = (int) self::$pdo->lastInsertId();
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        if (self::$pdo === null || !$this->servantId) {
            return;
        }
        self::$pdo->prepare('DELETE FROM civil_servants WHERE servant_id = ?')->execute([$this->servantId]);
    }

    private function capture(callable $fn): array
    {
        ob_start();
        $fn();
        return json_decode((string) ob_get_clean(), true) ?? [];
    }

    #[Test]
    public function list_returns_seeded_servant_with_remaining_days(): void
    {
        $_GET = ['search' => 'เกษียณ', 'within' => 12, 'limit' => 50, 'offset' => 0];
        $response = $this->capture(fn () => getRetirementList(self::$pdo));

        self::assertTrue($response['success']);
        self::assertArrayHasKey('pagination', $response);
        self::assertArrayHasKey('data', $response);

        $match = null;
        foreach ($response['data'] as $row) {
            if ((int) $row['servant_id'] === $this->servantId) {
                $match = $row;
                break;
            }
        }
        self::assertNotNull($match, 'seeded servant should appear in the within=12 window');
        self::assertArrayHasKey('remaining_days', $match);
        self::assertArrayHasKey('full_name', $match);
        self::assertGreaterThan(0, (int) $match['remaining_days']);
        self::assertStringContainsString('ทดสอบ', $match['full_name']);
    }
}
