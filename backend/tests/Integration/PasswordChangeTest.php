<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/auth.php';

final class PasswordChangeTest extends TestCase
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

        foreach (['users', 'audit_log'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table}");
            }
        }

        $username = 'password-change-' . bin2hex(random_bytes(5));
        self::$pdo->prepare(
            'INSERT INTO users
                (username, password_hash, full_name, role, is_active, must_change_password)
             VALUES (?, ?, ?, ?, 1, 1)'
        )->execute([
            $username,
            password_hash('temporary-password', PASSWORD_DEFAULT),
            'Password Change Test',
            'operator',
        ]);
        $this->userId = (int) self::$pdo->lastInsertId();
    }

    protected function tearDown(): void
    {
        if (self::$pdo === null || $this->userId === 0) {
            return;
        }
        self::$pdo->prepare("DELETE FROM audit_log WHERE table_name = 'users' AND record_id = ?")
            ->execute([$this->userId]);
        self::$pdo->prepare('DELETE FROM users WHERE user_id = ?')->execute([$this->userId]);
    }

    #[Test]
    public function required_user_can_change_password_and_clear_the_gate(): void
    {
        ob_start();
        changePassword(self::$pdo, ['user_id' => $this->userId], [
            'current_password' => 'temporary-password',
            'new_password' => 'new-secure-password',
        ]);
        $response = json_decode((string) ob_get_clean(), true);

        self::assertTrue($response['success'] ?? false);

        $stmt = self::$pdo->prepare(
            'SELECT password_hash, must_change_password FROM users WHERE user_id = ?'
        );
        $stmt->execute([$this->userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        self::assertSame(0, (int) $user['must_change_password']);
        self::assertTrue(password_verify('new-secure-password', $user['password_hash']));
        self::assertFalse(password_verify('temporary-password', $user['password_hash']));

        $audit = self::$pdo->prepare(
            "SELECT before_value, after_value
             FROM audit_log
             WHERE table_name = 'users' AND record_id = ? AND action = 'UPDATE'
             ORDER BY audit_id DESC LIMIT 1"
        );
        $audit->execute([$this->userId]);
        $row = $audit->fetch(PDO::FETCH_ASSOC);
        self::assertNotFalse($row);
        self::assertStringNotContainsString('temporary-password', (string) $row['before_value']);
        self::assertStringNotContainsString('new-secure-password', (string) $row['after_value']);
        self::assertSame(
            ['must_change_password' => false],
            json_decode($row['after_value'], true)
        );
    }

    #[Test]
    public function incorrect_current_password_does_not_change_account(): void
    {
        http_response_code(200);
        ob_start();
        changePassword(self::$pdo, ['user_id' => $this->userId], [
            'current_password' => 'wrong-password',
            'new_password' => 'new-secure-password',
        ]);
        $response = json_decode((string) ob_get_clean(), true);

        self::assertSame(400, http_response_code());
        self::assertSame('รหัสผ่านเดิมไม่ถูกต้อง', $response['error'] ?? null);

        $stmt = self::$pdo->prepare('SELECT must_change_password FROM users WHERE user_id = ?');
        $stmt->execute([$this->userId]);
        self::assertSame(1, (int) $stmt->fetchColumn());
    }
}
