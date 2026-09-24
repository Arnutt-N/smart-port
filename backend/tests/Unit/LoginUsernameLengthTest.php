<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

putenv('JWT_SECRET=t11-login-length-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../middleware/rate_limit.php';
require_once __DIR__ . '/../../routes/auth.php';

/**
 * T11-H3 — login ปฏิเสธ username เกินคอลัมน์แบบ generic ก่อนแตะ SQL
 * (กัน INSERT login_attempts ระเบิด 1406 กลายเป็น 500)
 */
final class LoginUsernameLengthTest extends TestCase
{
    protected function setUp(): void
    {
        $_SERVER['REMOTE_ADDR'] = '127.0.0.1';
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        unset($_SERVER['REMOTE_ADDR']);
        http_response_code(200);
    }

    #[Test]
    public function overlong_username_is_rejected_without_touching_db(): void
    {
        $pdo = $this->sqliteLogin();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        ob_start();
        loginUser($pdo, ['username' => str_repeat('u', 201), 'password' => 'whatever']);
        $body = json_decode((string) ob_get_clean(), true);

        // ข้อความเดียวกับรหัสผิด — ไม่เปิด oracle ใหม่, ไม่นับ lockout (ไม่มีเหยื่อให้ล็อก)
        self::assertSame(401, http_response_code());
        self::assertSame('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', $body['error'] ?? null);
        self::assertSame(
            0,
            (int) $pdo->query('SELECT COUNT(*) FROM login_attempts')->fetchColumn()
        );
    }

    private function sqliteLogin(): ?PDO
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            return null;
        }

        $pdo = new PDO('sqlite::memory:');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec(
            'CREATE TABLE users (
                user_id INTEGER PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                full_name TEXT,
                role TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                must_change_password INTEGER NOT NULL DEFAULT 0
            )'
        );
        $pdo->exec(
            'CREATE TABLE login_attempts (
                attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                ip_address TEXT,
                is_success INTEGER NOT NULL DEFAULT 0,
                attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )'
        );
        return $pdo;
    }
}
