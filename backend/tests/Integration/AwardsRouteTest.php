<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

putenv('JWT_SECRET=integration-test-secret');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/awards.php';

/**
 * Integration tests for the awards route helpers — seeds real rows and exercises the
 * read/validate/delete layer directly (auth + php://input paths are covered by api.php).
 * Skips when MySQL or the awards table is unavailable.
 */
final class AwardsRouteTest extends TestCase
{
    private static ?PDO $pdo = null;
    private static int $seedUserId = 0;
    private int $servantId = 0;
    private array $awardIds = [];

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        foreach (['awards', 'civil_servants', 'users'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table} — รัน migration 19-awards.sql");
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
        )->execute(["EMP-{$suffix}", substr('9' . $suffix . '0000000000', 0, 13), 'ทดสอบ', 'รางวัล', '1980-01-01', '2005-01-01']);
        $this->servantId = (int) self::$pdo->lastInsertId();
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        if (self::$pdo === null) {
            return;
        }
        foreach ($this->awardIds as $id) {
            self::$pdo->prepare('DELETE FROM awards WHERE award_id = ?')->execute([$id]);
        }
        if ($this->servantId) {
            self::$pdo->prepare('DELETE FROM civil_servants WHERE servant_id = ?')->execute([$this->servantId]);
        }
    }

    private function seedAward(string $name, string $type = 'general'): int
    {
        self::$pdo->prepare(
            'INSERT INTO awards (servant_id, award_name, award_type, awarded_date) VALUES (?, ?, ?, ?)'
        )->execute([$this->servantId, $name, $type, '2024-06-01']);
        $id = (int) self::$pdo->lastInsertId();
        $this->awardIds[] = $id;
        return $id;
    }

    private function capture(callable $fn): array
    {
        ob_start();
        $fn();
        return json_decode((string) ob_get_clean(), true) ?? [];
    }

    #[Test]
    public function validate_payload_rejects_missing_core_and_bad_enums(): void
    {
        [, $err1] = validateAwardPayload([], true);
        self::assertNotNull($err1);

        [, $err2] = validateAwardPayload(['servant_id' => 1, 'award_name' => 'x', 'award_type' => 'bogus'], true);
        self::assertNotNull($err2);

        [, $err3] = validateAwardPayload(['servant_id' => 1, 'award_name' => 'x', 'award_level' => 'bogus'], true);
        self::assertNotNull($err3);

        [$valid, $err4] = validateAwardPayload(['servant_id' => 1, 'award_name' => 'x', 'award_type' => 'honor'], true);
        self::assertNull($err4);
        self::assertSame('honor', $valid['award_type']);
    }

    #[Test]
    public function list_returns_seeded_award_with_joined_servant_name(): void
    {
        $name = 'รางวัลทดสอบ-' . bin2hex(random_bytes(3));
        $this->seedAward($name);

        $_GET = ['search' => $name, 'limit' => 20, 'offset' => 0];
        $response = $this->capture(fn () => getAwardList(self::$pdo));

        self::assertTrue($response['success']);
        self::assertArrayHasKey('pagination', $response);
        self::assertGreaterThanOrEqual(1, $response['pagination']['total']);
        self::assertSame($name, $response['data'][0]['award_name']);
        self::assertStringContainsString('ทดสอบ', $response['data'][0]['servant_name']);
    }

    #[Test]
    public function detail_returns_row_then_404_after_delete(): void
    {
        $id = $this->seedAward('รางวัลลบ');

        $detail = $this->capture(fn () => getAwardDetail(self::$pdo, $id));
        self::assertTrue($detail['success']);
        self::assertSame($id, (int) $detail['data']['award_id']);

        $auth = ['user_id' => self::$seedUserId];
        $del = $this->capture(fn () => deleteAward(self::$pdo, $id, $auth));
        self::assertTrue($del['success']);

        http_response_code(200);
        $missing = $this->capture(fn () => getAwardDetail(self::$pdo, $id));
        self::assertSame(404, http_response_code());
        self::assertArrayHasKey('error', $missing);
    }
}
