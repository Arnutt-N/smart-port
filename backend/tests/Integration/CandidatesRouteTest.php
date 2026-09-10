<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Throwable;

putenv('JWT_SECRET=integration-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/candidates.php';

/**
 * N23 — integration suite ของ candidates route ต่อ DB จริง
 *
 * QualificationEngine มีเทสแล้ว (QualificationEngineTest) แต่ชั้น route
 * (overview/list/detail, redaction ตาม role, 400/404/405/401) ไม่มีเทสเลย
 * ใช้ $GLOBALS['__auth_user'] ฉีด identity (pattern เดียวกับ routes/settings.php)
 */
final class CandidatesRouteTest extends TestCase
{
    private static ?PDO $pdo = null;
    private static bool $seedReady = false;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
        if (self::$pdo === null) {
            return;
        }
        try {
            $count = (int) self::$pdo
                ->query('SELECT COUNT(*) FROM personnel WHERE personnel_id BETWEEN 101 AND 111')
                ->fetchColumn();
            self::$seedReady = $count >= 11;
        } catch (Throwable $e) {
            self::$seedReady = false;
        }
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        if (!self::$seedReady) {
            self::markTestSkipped('seed executive (personnel 101-111) ไม่ครบ — re-seed DB ก่อน');
        }
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['__auth_user']);
        http_response_code(200);
    }

    #[Test]
    public function overview_returns_by_level_shape(): void
    {
        $out = $this->call('GET', ['candidates', 'overview'], ['user_id' => 1, 'role' => 'admin']);

        self::assertSame(200, $out['code']);
        self::assertTrue($out['body']['success']);
        foreach (['K2', 'K3', 'K4', 'O2', 'O3', 'M1', 'M2', 'S1', 'S2'] as $level) {
            self::assertArrayHasKey($level, $out['body']['by_level'], "by_level ต้องมี {$level}");
        }
    }

    #[Test]
    public function list_returns_pagination_with_full_dataset_summary(): void
    {
        $out = $this->call('GET', ['candidates', 'M1'], ['user_id' => 1, 'role' => 'admin']);

        self::assertSame(200, $out['code']);
        self::assertTrue($out['body']['success']);
        self::assertArrayHasKey('summary', $out['body']);
        self::assertArrayHasKey('pagination', $out['body']);
        $summary = $out['body']['summary'];
        self::assertSame(
            $summary['total'],
            $summary['qualified'] + $summary['not_yet'] + $summary['check_data']
        );
        self::assertGreaterThan(0, $summary['total']);
    }

    #[Test]
    public function detail_visible_citizen_id_for_admin(): void
    {
        $out = $this->call('GET', ['candidates', 'M1', '101'], ['user_id' => 1, 'role' => 'admin']);

        self::assertSame(200, $out['code']);
        self::assertArrayHasKey('data', $out['body']);
        self::assertArrayHasKey('citizen_id', $out['body']['data'], 'admin ต้องเห็น citizen_id');
    }

    #[Test]
    public function detail_redacts_citizen_id_for_viewer(): void
    {
        $out = $this->call('GET', ['candidates', 'M1', '101'], ['user_id' => 2, 'role' => 'viewer']);

        self::assertSame(200, $out['code']);
        self::assertArrayHasKey('data', $out['body']);
        self::assertArrayNotHasKey('citizen_id', $out['body']['data'], 'viewer ต้องไม่เห็น citizen_id');
    }

    #[Test]
    public function invalid_level_returns_400(): void
    {
        $out = $this->call('GET', ['candidates', 'K9'], ['user_id' => 1, 'role' => 'admin']);

        self::assertSame(400, $out['code']);
        self::assertStringContainsString('Invalid target level', (string) ($out['body']['error'] ?? ''));
    }

    #[Test]
    public function unknown_personnel_returns_404(): void
    {
        $out = $this->call('GET', ['candidates', 'M1', '999999989'], ['user_id' => 1, 'role' => 'admin']);

        self::assertSame(404, $out['code']);
        self::assertSame('Personnel not found', $out['body']['error'] ?? null);
    }

    #[Test]
    public function non_get_returns_405(): void
    {
        $out = $this->call('POST', ['candidates', 'M1'], ['user_id' => 1, 'role' => 'admin']);

        self::assertSame(405, $out['code']);
    }

    #[Test]
    public function unauthenticated_returns_401(): void
    {
        $GLOBALS['__auth_user'] = null;
        http_response_code(200);
        ob_start();
        handleCandidates(self::$pdo, 'GET', ['candidates', 'M1']);
        $raw = (string) ob_get_clean();

        self::assertSame(401, http_response_code());
        self::assertSame('Unauthorized', json_decode($raw, true)['error'] ?? null);
    }

    /**
     * @param list<string> $path
     * @param array{user_id?:int|string, role?:string} $auth
     * @return array{code:int, body:array<string,mixed>}
     */
    private function call(string $method, array $path, array $auth): array
    {
        $GLOBALS['__auth_user'] = $auth;
        http_response_code(200);
        ob_start();
        handleCandidates(self::$pdo, $method, $path, $auth, []);
        $raw = (string) ob_get_clean();
        return ['code' => http_response_code(), 'body' => json_decode($raw, true) ?? []];
    }
}
