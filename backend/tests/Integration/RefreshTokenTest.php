<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

putenv('JWT_SECRET=integration-test-secret');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../routes/auth.php';

/**
 * Integration tests for the refresh-token flow (rotation, expiry, reuse detection, logout).
 * Skips when MySQL or the refresh_tokens table is unavailable.
 */
final class RefreshTokenTest extends TestCase
{
    private static ?PDO $pdo = null;
    private int $userId = 0;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }

        foreach (['users', 'refresh_tokens'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table} — รัน migration 18-refresh-tokens.sql");
            }
        }

        $username = 'refresh-' . bin2hex(random_bytes(5));
        self::$pdo->prepare(
            'INSERT INTO users
                (username, password_hash, full_name, role, is_active, must_change_password)
             VALUES (?, ?, ?, ?, 1, 0)'
        )->execute([
            $username,
            password_hash('test-only-password', PASSWORD_DEFAULT),
            'Refresh Token Test',
            'operator',
        ]);
        $this->userId = (int) self::$pdo->lastInsertId();
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        if (self::$pdo === null || $this->userId === 0) {
            return;
        }
        self::$pdo->prepare('DELETE FROM refresh_tokens WHERE user_id = ?')->execute([$this->userId]);
        self::$pdo->prepare('DELETE FROM users WHERE user_id = ?')->execute([$this->userId]);
    }

    /**
     * @return array<string,mixed>
     */
    private function callRefresh(string $rawToken): array
    {
        ob_start();
        refreshSession(self::$pdo, ['refresh_token' => $rawToken]);
        return json_decode((string) ob_get_clean(), true) ?? [];
    }

    #[Test]
    public function valid_token_is_rotated_and_returns_new_tokens(): void
    {
        $raw = issueRefreshToken(self::$pdo, $this->userId);
        $response = $this->callRefresh($raw);

        self::assertSame(200, http_response_code());
        self::assertArrayHasKey('token', $response);
        self::assertArrayHasKey('csrf_token', $response);
        self::assertArrayHasKey('refresh_token', $response);
        self::assertNotSame($raw, $response['refresh_token']);
        self::assertSame($this->userId, $response['user']['id'] ?? null);

        $stmt = self::$pdo->prepare(
            'SELECT token_hash, revoked_at FROM refresh_tokens WHERE user_id = ?'
        );
        $stmt->execute([$this->userId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        self::assertCount(2, $rows, 'rotation should leave the old (revoked) + new (active) token');

        $revokedByHash = [];
        foreach ($rows as $row) {
            $revokedByHash[$row['token_hash']] = $row['revoked_at'];
        }

        $oldHash = hashRefreshToken($raw);
        $newHash = hashRefreshToken($response['refresh_token']);
        self::assertArrayHasKey($oldHash, $revokedByHash);
        self::assertArrayHasKey($newHash, $revokedByHash);
        self::assertNotNull($revokedByHash[$oldHash], 'old token must be revoked');
        self::assertNull($revokedByHash[$newHash], 'new token must be active');
    }

    #[Test]
    public function expired_token_is_rejected(): void
    {
        $raw = generateRefreshToken();
        self::$pdo->prepare(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
        )->execute([$this->userId, hashRefreshToken($raw), date('Y-m-d H:i:s', time() - 60)]);

        $response = $this->callRefresh($raw);

        self::assertSame(401, http_response_code());
        self::assertArrayHasKey('error', $response);
    }

    #[Test]
    public function unknown_token_is_rejected(): void
    {
        $response = $this->callRefresh(generateRefreshToken());

        self::assertSame(401, http_response_code());
        self::assertArrayHasKey('error', $response);
    }

    #[Test]
    public function reusing_a_revoked_token_revokes_all_user_tokens(): void
    {
        $raw = issueRefreshToken(self::$pdo, $this->userId);

        // ครั้งแรก: rotation สำเร็จ -> raw ถูก revoke, มี token ใหม่ที่ active
        $this->callRefresh($raw);
        self::assertSame(200, http_response_code());

        // นำ raw (ที่ถูก revoke แล้ว) มาใช้ซ้ำ = สงสัยถูกขโมย
        http_response_code(200);
        $response = $this->callRefresh($raw);
        self::assertSame(401, http_response_code());
        self::assertArrayHasKey('error', $response);

        // token ทุกใบของ user ต้องถูกเพิกถอน (รวมใบใหม่ที่เพิ่งออก)
        $stmt = self::$pdo->prepare(
            'SELECT COUNT(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL'
        );
        $stmt->execute([$this->userId]);
        self::assertSame(0, (int) $stmt->fetchColumn());
    }

    #[Test]
    public function missing_token_returns_400(): void
    {
        $response = $this->callRefresh('');

        self::assertSame(400, http_response_code());
        self::assertArrayHasKey('error', $response);
    }

    #[Test]
    public function logout_revokes_the_refresh_token(): void
    {
        $raw = issueRefreshToken(self::$pdo, $this->userId);

        ob_start();
        logoutSession(self::$pdo, ['refresh_token' => $raw]);
        $response = json_decode((string) ob_get_clean(), true);

        self::assertTrue($response['success'] ?? false);

        $stmt = self::$pdo->prepare('SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?');
        $stmt->execute([hashRefreshToken($raw)]);
        self::assertNotNull($stmt->fetchColumn());
    }
}
