<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

putenv('JWT_SECRET=integration-test-secret');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/decorations.php';

/**
 * Integration tests for the royal-decorations route helpers — seeds real rows and exercises
 * the read/validate/delete layer directly (auth + php://input paths are covered by api.php).
 * Skips when MySQL or the royal_decorations table is unavailable.
 */
final class DecorationsRouteTest extends TestCase
{
    private static ?PDO $pdo = null;
    private static int $seedUserId = 0;
    private int $servantId = 0;
    private array $decorationIds = [];

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        foreach (['royal_decorations', 'civil_servants', 'users'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table} — รัน migration 20-royal-decorations.sql");
            }
        }

        self::$seedUserId = (int) self::$pdo->query('SELECT user_id FROM users LIMIT 1')->fetchColumn();
        if (!self::$seedUserId) {
            self::markTestSkipped('ไม่พบ seed user');
        }

        $suffix = bin2hex(random_bytes(4));
        self::$pdo->prepare(
            'INSERT INTO civil_servants (employee_id, citizen_id, first_name, last_name, birth_date, appointment_date)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute(["EMP-{$suffix}", substr('9' . $suffix . '0000000000', 0, 13), 'ทดสอบ', 'ราชอิสริยาภรณ์', '1980-01-01', '2005-01-01']);
        $this->servantId = (int) self::$pdo->lastInsertId();
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        if (self::$pdo === null) {
            return;
        }
        foreach ($this->decorationIds as $id) {
            self::$pdo->prepare('DELETE FROM royal_decorations WHERE decoration_id = ?')->execute([$id]);
        }
        if ($this->servantId) {
            self::$pdo->prepare('DELETE FROM civil_servants WHERE servant_id = ?')->execute([$this->servantId]);
        }
    }

    private function seedDecoration(string $name, ?int $year = 2565): int
    {
        self::$pdo->prepare(
            'INSERT INTO royal_decorations (servant_id, decoration_name, received_year) VALUES (?, ?, ?)'
        )->execute([$this->servantId, $name, $year]);
        $id = (int) self::$pdo->lastInsertId();
        $this->decorationIds[] = $id;
        return $id;
    }

    private function capture(callable $fn): array
    {
        ob_start();
        $fn();
        return json_decode((string) ob_get_clean(), true) ?? [];
    }

    #[Test]
    public function validate_payload_rejects_missing_core_and_bad_year(): void
    {
        [, $err1] = validateDecorationPayload([], true);
        self::assertNotNull($err1);

        [, $err2] = validateDecorationPayload(['servant_id' => 1, 'decoration_name' => 'x', 'received_year' => 1900], true);
        self::assertNotNull($err2);

        [, $err3] = validateDecorationPayload(['servant_id' => 1, 'decoration_name' => 'x', 'received_year' => 9999], true);
        self::assertNotNull($err3);

        [$valid, $err4] = validateDecorationPayload(['servant_id' => 1, 'decoration_name' => 'x', 'received_year' => 2565], true);
        self::assertNull($err4);
        self::assertSame(2565, (int) $valid['received_year']);
    }

    #[Test]
    public function list_returns_seeded_decoration_with_joined_servant_name(): void
    {
        $name = 'เครื่องราชฯทดสอบ-' . bin2hex(random_bytes(3));
        $this->seedDecoration($name);

        $_GET = ['search' => $name, 'limit' => 20, 'offset' => 0];
        $response = $this->capture(fn () => getDecorationList(self::$pdo));

        self::assertTrue($response['success']);
        self::assertArrayHasKey('pagination', $response);
        self::assertGreaterThanOrEqual(1, $response['pagination']['total']);
        self::assertSame($name, $response['data'][0]['decoration_name']);
        self::assertStringContainsString('ทดสอบ', $response['data'][0]['servant_name']);
    }

    #[Test]
    public function detail_returns_row_then_404_after_delete(): void
    {
        $id = $this->seedDecoration('เครื่องราชฯลบ');

        $detail = $this->capture(fn () => getDecorationDetail(self::$pdo, $id));
        self::assertTrue($detail['success']);
        self::assertSame($id, (int) $detail['data']['decoration_id']);

        $auth = ['user_id' => self::$seedUserId];
        $del = $this->capture(fn () => deleteDecoration(self::$pdo, $id, $auth));
        self::assertTrue($del['success']);

        http_response_code(200);
        $missing = $this->capture(fn () => getDecorationDetail(self::$pdo, $id));
        self::assertSame(404, http_response_code());
        self::assertArrayHasKey('error', $missing);
    }
}
