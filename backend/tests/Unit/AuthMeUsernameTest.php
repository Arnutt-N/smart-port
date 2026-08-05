<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/auth.php';

final class AuthMeUsernameTest extends TestCase
{
    #[Test]
    public function rejects_invalid_username_characters(): void
    {
        $pdo = $this->sqliteUsers();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        updateAuthMe($pdo, ['user_id' => 1], [
            'username' => 'bad name',
            'full_name' => 'Alice',
            'email' => '',
            'current_password' => 'secret-password',
        ]);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(400, http_response_code());
        self::assertStringContainsString('ชื่อผู้ใช้', (string) ($body['error'] ?? ''));
        self::assertSame('alice', $pdo->query('SELECT username FROM users WHERE user_id = 1')->fetchColumn());
    }

    #[Test]
    public function username_change_requires_current_password(): void
    {
        $pdo = $this->sqliteUsers();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        updateAuthMe($pdo, ['user_id' => 1], [
            'username' => 'alice2',
            'full_name' => 'Alice',
        ]);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(400, http_response_code());
        self::assertStringContainsString('รหัสผ่านปัจจุบัน', (string) ($body['error'] ?? ''));
        self::assertSame('alice', $pdo->query('SELECT username FROM users WHERE user_id = 1')->fetchColumn());
    }

    #[Test]
    public function wrong_current_password_rejects_username_change(): void
    {
        $pdo = $this->sqliteUsers();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        updateAuthMe($pdo, ['user_id' => 1], [
            'username' => 'alice2',
            'full_name' => 'Alice',
            'current_password' => 'not-the-password',
        ]);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(400, http_response_code());
        self::assertStringContainsString('รหัสผ่านปัจจุบัน', (string) ($body['error'] ?? ''));
        self::assertSame('alice', $pdo->query('SELECT username FROM users WHERE user_id = 1')->fetchColumn());
    }

    #[Test]
    public function duplicate_username_returns_409(): void
    {
        $pdo = $this->sqliteUsers();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        updateAuthMe($pdo, ['user_id' => 1], [
            'username' => 'bob',
            'full_name' => 'Alice',
            'current_password' => 'secret-password',
        ]);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(409, http_response_code());
        self::assertStringContainsString('ถูกใช้งานแล้ว', (string) ($body['error'] ?? ''));
        self::assertSame('alice', $pdo->query('SELECT username FROM users WHERE user_id = 1')->fetchColumn());
    }

    #[Test]
    public function successful_rename_updates_username_and_audits(): void
    {
        $pdo = $this->sqliteUsers();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        updateAuthMe($pdo, ['user_id' => 1], [
            'username' => 'alice_ops',
            'full_name' => 'Alice Ops',
            'email' => 'a@example.com',
            'current_password' => 'secret-password',
        ]);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertTrue($body['success'] ?? false, json_encode($body));
        self::assertSame('alice_ops', $pdo->query('SELECT username FROM users WHERE user_id = 1')->fetchColumn());
        self::assertSame('Alice Ops', $pdo->query('SELECT full_name FROM users WHERE user_id = 1')->fetchColumn());

        $audit = $pdo->query(
            "SELECT after_value FROM audit_log WHERE table_name = 'users' AND record_id = 1 ORDER BY audit_id DESC LIMIT 1"
        )->fetch(PDO::FETCH_ASSOC);
        self::assertNotFalse($audit);
        $after = json_decode((string) $audit['after_value'], true);
        self::assertTrue($after['username_changed'] ?? false);
        self::assertSame('alice_ops', $after['username'] ?? null);
    }

    private function sqliteUsers(): ?PDO
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
                full_name TEXT,
                email TEXT,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                must_change_password INTEGER NOT NULL DEFAULT 0
            )'
        );
        $pdo->exec(
            'CREATE TABLE audit_log (
                audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action TEXT,
                table_name TEXT,
                record_id INTEGER,
                before_value TEXT,
                after_value TEXT,
                ip_address TEXT,
                user_agent TEXT
            )'
        );
        $hash = password_hash('secret-password', PASSWORD_DEFAULT);
        $stmt = $pdo->prepare(
            'INSERT INTO users (user_id, username, full_name, email, password_hash, role, is_active, must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, 1, 0)'
        );
        $stmt->execute([1, 'alice', 'Alice', null, $hash, 'operator']);
        $stmt->execute([2, 'bob', 'Bob', null, $hash, 'operator']);
        return $pdo;
    }
}
