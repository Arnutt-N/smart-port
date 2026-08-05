<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/users.php';

final class UserManagementGuardTest extends TestCase
{
    #[Test]
    #[DataProvider('usernameProvider')]
    public function username_validation(string $username, bool $ok): void
    {
        self::assertSame($ok, isValidUsername($username));
    }

    /**
     * @return list<array{0:string,1:bool}>
     */
    public static function usernameProvider(): array
    {
        return [
            ['ab', false],
            ['abc', true],
            ['alice.ops', true],
            ['alice_ops-1', true],
            ['bad name', false],
            ['bad@name', false],
            [str_repeat('a', 64), true],
            [str_repeat('a', 65), false],
        ];
    }

    #[Test]
    public function admin_cannot_assign_superadmin(): void
    {
        self::assertNotContains('superadmin', assignableRolesFor(['role' => 'admin']));
        self::assertContains('superadmin', assignableRolesFor(['role' => 'superadmin']));
    }

    #[Test]
    public function last_active_superadmin_cannot_be_demoted(): void
    {
        $pdo = $this->sqliteUsers();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        $pdo->exec(
            "INSERT INTO users (user_id, username, full_name, email, role, is_active, must_change_password)
             VALUES (1, 'solo', 'Solo', null, 'superadmin', 1, 0)"
        );

        http_response_code(200);
        ob_start();
        updateUser($pdo, 1, ['user_id' => 99, 'role' => 'superadmin'], ['role' => 'admin']);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(400, http_response_code());
        self::assertSame('ต้องมีซูเปอร์แอดมินที่ใช้งานได้อย่างน้อย 1 คน', $body['error'] ?? null);
        self::assertSame('superadmin', $pdo->query('SELECT role FROM users WHERE user_id = 1')->fetchColumn());
    }

    #[Test]
    public function last_active_superadmin_cannot_be_deactivated(): void
    {
        $pdo = $this->sqliteUsers();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        $pdo->exec(
            "INSERT INTO users (user_id, username, full_name, email, role, is_active, must_change_password)
             VALUES (1, 'solo', 'Solo', null, 'superadmin', 1, 0)"
        );

        http_response_code(200);
        ob_start();
        updateUser($pdo, 1, ['user_id' => 99, 'role' => 'superadmin'], ['is_active' => 0]);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(400, http_response_code());
        self::assertSame('ต้องมีซูเปอร์แอดมินที่ใช้งานได้อย่างน้อย 1 คน', $body['error'] ?? null);
        self::assertSame(1, (int) $pdo->query('SELECT is_active FROM users WHERE user_id = 1')->fetchColumn());
    }

    #[Test]
    public function second_superadmin_can_be_demoted(): void
    {
        $pdo = $this->sqliteUsers();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        $pdo->exec(
            "INSERT INTO users (user_id, username, full_name, email, role, is_active, must_change_password) VALUES
             (1, 'sa1', 'One', null, 'superadmin', 1, 0),
             (2, 'sa2', 'Two', null, 'superadmin', 1, 0)"
        );

        http_response_code(200);
        ob_start();
        updateUser($pdo, 2, ['user_id' => 1, 'role' => 'superadmin'], ['role' => 'admin']);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertTrue($body['success'] ?? false, json_encode($body));
        self::assertSame('admin', $pdo->query('SELECT role FROM users WHERE user_id = 2')->fetchColumn());
    }

    private function sqliteUsers(): ?PDO
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            return null;
        }

        $pdo = new PDO('sqlite::memory:');
        $pdo->exec(
            'CREATE TABLE users (
                user_id INTEGER PRIMARY KEY,
                username TEXT NOT NULL,
                full_name TEXT,
                email TEXT,
                role TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                must_change_password INTEGER NOT NULL DEFAULT 0,
                last_login_at TEXT,
                created_at TEXT
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
        return $pdo;
    }
}
