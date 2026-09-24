<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

putenv('JWT_SECRET=integration-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../routes/auth.php';

/**
 * D3 — cookie production path (เรียก handlers ด้วย $input = null + $_COOKIE):
 * login ออก cookies คู่ + body คงเดิม, refresh/logout อ่าน cookie, flags ถูกต้อง.
 *
 * จับ Set-Cookie ผ่าน $GLOBALS['__capture_cookies'] (N23 hook ใน emitSessionCookie)
 * เพราะ PHP CLI ทิ้ง setcookie() เงียบและ headers_list() ว่างเสมอ.
 *
 * หมายเหตุ: ห้ามเรียก getAuthenticatedUser() ในไฟล์นี้ (static cache ต่อ process —
 * AuthenticatedUserTest เป็นเจ้าของ resolve เดียวของ process นี้)
 */
final class AuthCookieFlowTest extends TestCase
{
    private static ?PDO $pdo = null;

    /** @var list<int> */
    private array $userIds = [];

    /** @var list<string> */
    private array $usernames = [];

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
                self::markTestSkipped("ไม่พบตาราง {$table} — รัน migration ให้ครบก่อน");
            }
        }
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        unset($_COOKIE[AUTH_ACCESS_COOKIE], $_COOKIE[AUTH_REFRESH_COOKIE], $GLOBALS['__capture_cookies']);
        if (self::$pdo !== null) {
            if ($this->userIds !== []) {
                $placeholders = implode(',', array_fill(0, count($this->userIds), '?'));
                self::$pdo->prepare("DELETE FROM refresh_tokens WHERE user_id IN ({$placeholders})")
                    ->execute($this->userIds);
                self::$pdo->prepare("DELETE FROM password_history WHERE user_id IN ({$placeholders})")
                    ->execute($this->userIds);
                self::$pdo->prepare("DELETE FROM users WHERE user_id IN ({$placeholders})")
                    ->execute($this->userIds);
            }
            foreach ($this->usernames as $username) {
                self::$pdo->prepare('DELETE FROM login_attempts WHERE username = ?')->execute([$username]);
            }
        }
        $this->userIds = [];
        $this->usernames = [];
        http_response_code(200);
    }

    #[Test]
    public function login_sets_both_cookies_and_keeps_body_shape(): void
    {
        $username = $this->uniqueUsername();
        $this->createUser($username, 'Login-Test-11');

        $GLOBALS['__capture_cookies'] = [];
        http_response_code(200);
        ob_start();
        loginUser(self::$pdo, ['username' => $username, 'password' => 'Login-Test-11']);
        $body = json_decode((string) ob_get_clean(), true) ?? [];
        $cookies = $GLOBALS['__capture_cookies'];

        self::assertSame(200, http_response_code());
        // compat-keep: body คงทุก field เดิม (frontend เลิกอ่าน token เองใน T-D3.2)
        self::assertArrayHasKey('token', $body);
        self::assertArrayHasKey('csrf_token', $body);
        self::assertArrayHasKey('refresh_token', $body);
        self::assertArrayHasKey('user', $body);

        $access = $this->findCaptured($cookies, AUTH_ACCESS_COOKIE);
        $refresh = $this->findCaptured($cookies, AUTH_REFRESH_COOKIE);
        self::assertNotNull($access, 'login ต้องออก access cookie');
        self::assertNotNull($refresh, 'login ต้องออก refresh cookie');
        self::assertSame($body['token'], $access['value'], 'cookie ต้องถือ JWT เดียวกับ body');
        self::assertSame($body['refresh_token'], $refresh['value']);

        self::assertSame('/', $access['params']['path']);
        self::assertSame(AUTH_REFRESH_COOKIE_PATH, $refresh['params']['path']);
        foreach ([$access, $refresh] as $cookie) {
            self::assertTrue($cookie['params']['httponly']);
            self::assertSame('Lax', $cookie['params']['samesite']);
            self::assertFalse($cookie['params']['secure'], 'http ตรงต้องไม่มี Secure');
            self::assertGreaterThan(time(), $cookie['params']['expires']);
        }
    }

    #[Test]
    public function refresh_reads_cookie_and_rotates_with_new_cookies(): void
    {
        $userId = $this->createUser($this->uniqueUsername(), 'Refresh-Test-11');
        $raw = issueRefreshToken(self::$pdo, $userId);
        $_COOKIE[AUTH_REFRESH_COOKIE] = $raw;

        $GLOBALS['__capture_cookies'] = [];
        http_response_code(200);
        ob_start();
        refreshSession(self::$pdo, null);
        $body = json_decode((string) ob_get_clean(), true) ?? [];
        $cookies = $GLOBALS['__capture_cookies'];

        self::assertSame(200, http_response_code());
        self::assertNotSame($raw, $body['refresh_token'] ?? null, 'rotation ต้องออกใบใหม่');
        self::assertArrayHasKey('token', $body, 'compat-keep: body คง field token');
        $access = $this->findCaptured($cookies, AUTH_ACCESS_COOKIE);
        $refresh = $this->findCaptured($cookies, AUTH_REFRESH_COOKIE);
        self::assertNotNull($access, 'rotation ต้องออก access cookie ใหม่');
        self::assertNotNull($refresh, 'rotation ต้องออก refresh cookie ใหม่');
        self::assertSame($body['refresh_token'], $refresh['value']);

        $stmt = self::$pdo->prepare('SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?');
        $stmt->execute([hashRefreshToken($raw)]);
        self::assertNotNull($stmt->fetchColumn(), 'ใบเดิมต้องถูก revoke');
    }

    #[Test]
    public function refresh_without_cookie_returns_400(): void
    {
        unset($_COOKIE[AUTH_REFRESH_COOKIE]);

        http_response_code(200);
        ob_start();
        refreshSession(self::$pdo, null);
        $body = json_decode((string) ob_get_clean(), true) ?? [];

        self::assertSame(400, http_response_code());
        self::assertArrayHasKey('error', $body);
    }

    #[Test]
    public function logout_via_cookie_revokes_and_clears_cookies(): void
    {
        $userId = $this->createUser($this->uniqueUsername(), 'Logout-Test-11');
        $raw = issueRefreshToken(self::$pdo, $userId);
        $_COOKIE[AUTH_REFRESH_COOKIE] = $raw;

        $GLOBALS['__capture_cookies'] = [];
        http_response_code(200);
        ob_start();
        logoutSession(self::$pdo, null);
        $body = json_decode((string) ob_get_clean(), true) ?? [];
        $cookies = $GLOBALS['__capture_cookies'];

        self::assertTrue($body['success'] ?? false);
        $stmt = self::$pdo->prepare('SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?');
        $stmt->execute([hashRefreshToken($raw)]);
        self::assertNotNull($stmt->fetchColumn(), 'logout ต้อง revoke ใบใน cookie');

        foreach ([AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE] as $name) {
            $cleared = $this->findCaptured($cookies, $name);
            self::assertNotNull($cleared, "logout ต้องล้าง cookie {$name}");
            self::assertSame('', $cleared['value']);
            self::assertLessThan(time(), $cleared['params']['expires'], "cookie {$name} ต้องหมดอายุทันที");
        }
    }

    private function uniqueUsername(): string
    {
        return 'd3login' . bin2hex(random_bytes(4));
    }

    private function createUser(string $username, string $password): int
    {
        self::$pdo->prepare(
            'INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)
             VALUES (?, ?, ?, ?, 1, 0)'
        )->execute([$username, password_hash($password, PASSWORD_BCRYPT), 'D3 Cookie User', 'operator']);
        $id = (int) self::$pdo->lastInsertId();
        $this->userIds[] = $id;
        $this->usernames[] = $username;

        return $id;
    }

    /**
     * @param list<array{name:string,value:string,params:array<string,mixed>}> $cookies
     * @return array{name:string,value:string,params:array<string,mixed>}|null
     */
    private function findCaptured(array $cookies, string $name): ?array
    {
        foreach ($cookies as $cookie) {
            if ($cookie['name'] === $name) {
                return $cookie;
            }
        }

        return null;
    }
}
