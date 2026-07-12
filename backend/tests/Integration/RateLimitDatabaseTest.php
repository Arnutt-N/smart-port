<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../middleware/rate_limit.php';

final class RateLimitDatabaseTest extends TestCase
{
    private static ?PDO $pdo = null;
    private const TEST_USER_ID = 999999002;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
        if (!getenv('JWT_SECRET')) {
            putenv('JWT_SECRET=test-jwt-secret-for-integration');
            $_ENV['JWT_SECRET'] = 'test-jwt-secret-for-integration';
        }
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db');
        }

        if (!self::$pdo->query("SHOW TABLES LIKE 'api_rate_limit_hits'")->fetchColumn()) {
            self::markTestSkipped('ไม่พบตาราง api_rate_limit_hits — รัน migration 15 ก่อน');
        }

        self::$pdo->prepare('DELETE FROM api_rate_limit_hits WHERE rate_key LIKE ?')
            ->execute(['user_' . self::TEST_USER_ID . '_%']);
        $GLOBALS['_rate_limit_db_ready'] = true;
    }

    protected function tearDown(): void
    {
        if (self::$pdo === null) {
            return;
        }
        self::$pdo->prepare('DELETE FROM api_rate_limit_hits WHERE rate_key LIKE ?')
            ->execute(['user_' . self::TEST_USER_ID . '_%']);
    }

    #[Test]
    public function database_backend_records_hits_and_purges_old_entries(): void
    {
        if (!function_exists('getDB')) {
            require_once __DIR__ . '/../../config.php';
        }

        checkRateLimitDatabase(self::TEST_USER_ID, 'GET_DB_TEST', 5, 60);
        checkRateLimitDatabase(self::TEST_USER_ID, 'GET_DB_TEST', 5, 60);

        $stmt = self::$pdo->prepare(
            'SELECT COUNT(*) FROM api_rate_limit_hits WHERE rate_key = ?'
        );
        $stmt->execute(['user_' . self::TEST_USER_ID . '_GET_DB_TEST']);
        self::assertSame(2, (int) $stmt->fetchColumn());

        self::$pdo->prepare(
            'UPDATE api_rate_limit_hits SET hit_at = ? WHERE rate_key = ?'
        )->execute([time() - 7200, 'user_' . self::TEST_USER_ID . '_GET_DB_TEST']);

        checkRateLimitDatabase(self::TEST_USER_ID, 'GET_DB_TEST', 5, 60);
        $stmt->execute(['user_' . self::TEST_USER_ID . '_GET_DB_TEST']);
        self::assertSame(1, (int) $stmt->fetchColumn());
    }
}
