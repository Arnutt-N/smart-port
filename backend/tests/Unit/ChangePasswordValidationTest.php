<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/auth.php';

/**
 * T11-H2 — changePassword input validation (offline ผ่าน sqlite):
 * นับขั้นต่ำเป็นตัวอักษร (mb_strlen) และกัน bcrypt ตัดรหัสยาวเกิน 72 bytes เงียบ ๆ
 */
final class ChangePasswordValidationTest extends TestCase
{
    protected function tearDown(): void
    {
        http_response_code(200);
    }

    #[Test]
    public function short_ascii_password_is_rejected(): void
    {
        $pdo = $this->sqliteAuth();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        $body = $this->change($pdo, 'Old-password-1', 'short');

        self::assertSame(400, http_response_code());
        self::assertStringContainsString('อย่างน้อย', (string) ($body['error'] ?? ''));
        self::assertTrue(password_verify(
            'Old-password-1',
            (string) $pdo->query('SELECT password_hash FROM users WHERE user_id = 1')->fetchColumn()
        ));
    }

    #[Test]
    public function thai_char_count_is_enforced_not_bytes(): void
    {
        $pdo = $this->sqliteAuth();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        // 7 ตัวอักษรไทย = 21 bytes — strlen เดิมปล่อยผ่าน แต่ข้อความบอกว่า "ตัวอักษร"
        $body = $this->change($pdo, 'Old-password-1', str_repeat('ก', 7));

        self::assertSame(400, http_response_code());
        self::assertStringContainsString('อย่างน้อย', (string) ($body['error'] ?? ''));
    }

    #[Test]
    public function overlong_password_is_rejected_before_bcrypt_truncation(): void
    {
        $pdo = $this->sqliteAuth();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        $body = $this->change($pdo, 'Old-password-1', str_repeat('a', 73));

        self::assertSame(400, http_response_code());
        self::assertStringContainsString('ไม่เกิน', (string) ($body['error'] ?? ''));
    }

    #[Test]
    public function boundary_lengths_are_accepted(): void
    {
        $pdo = $this->sqliteAuth();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        // 72 ASCII bytes = พอดี bcrypt (ครบ 4 กลุ่มตาม policy ใหม่) — ต้องผ่าน
        $body = $this->change($pdo, 'Old-password-1', 'Aa1!' . str_repeat('b', 68));
        self::assertTrue($body['success'] ?? false, json_encode($body));

        // 12 ตัวอักษร (8 ไทย + Aa1!) = พอดีขั้นต่ำแบบนับตัวอักษร — ต้องผ่าน
        $pdo2 = $this->sqliteAuth();
        if ($pdo2 === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }
        $body2 = $this->change($pdo2, 'Old-password-1', str_repeat('ข', 8) . 'Aa1!');
        self::assertTrue($body2['success'] ?? false, json_encode($body2));
    }

    #[Test]
    public function valid_change_updates_hash_and_clears_flag(): void
    {
        $pdo = $this->sqliteAuth();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        $body = $this->change($pdo, 'Old-password-1', 'New-password-2');

        self::assertTrue($body['success'] ?? false, json_encode($body));
        $row = $pdo->query('SELECT password_hash, must_change_password FROM users WHERE user_id = 1')
            ->fetch(PDO::FETCH_ASSOC);
        self::assertTrue(password_verify('New-password-2', (string) $row['password_hash']));
        self::assertSame(0, (int) $row['must_change_password']);
    }

    #[Test]
    public function weak_but_long_password_is_rejected(): void
    {
        $pdo = $this->sqliteAuth();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        // 16 ตัวอักษรแต่พิมพ์เล็กล้วน — ผ่านกฎเก่า (>= 8) แต่ต้องตกกฎเข้ม
        $body = $this->change($pdo, 'Old-password-1', 'passwordpassword');

        self::assertSame(400, http_response_code());
        self::assertStringContainsString('รหัสผ่าน', (string) ($body['error'] ?? ''));
    }

    #[Test]
    public function history_written_and_reuse_blocked(): void
    {
        $pdo = $this->sqliteAuth();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        $first = $this->change($pdo, 'Old-password-1', 'First-new-11!');
        self::assertTrue($first['success'] ?? false, json_encode($first));
        $second = $this->change($pdo, 'First-new-11!', 'Second-new-22!');
        self::assertTrue($second['success'] ?? false, json_encode($second));

        self::assertSame(2, (int) $pdo->query('SELECT COUNT(*) FROM password_history')->fetchColumn());

        // ใช้รหัสที่เพิ่งใช้ไปซ้ำ → ต้องถูกปฏิเสธ
        $body = $this->change($pdo, 'Second-new-22!', 'First-new-11!');
        self::assertSame(400, http_response_code());
        self::assertStringContainsString('ซ้ำ', (string) ($body['error'] ?? ''));
    }

    /**
     * @return array<string,mixed>
     */
    private function change(PDO $pdo, string $current, string $new): array
    {
        http_response_code(200);
        ob_start();
        try {
            changePassword($pdo, ['user_id' => 1], [
                'current_password' => $current,
                'new_password' => $new,
            ]);
        } finally {
            $raw = (string) ob_get_clean();
        }
        return json_decode($raw, true) ?? [];
    }

    private function sqliteAuth(): ?PDO
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
            'CREATE TABLE refresh_tokens (
                token_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                revoked_at TEXT
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
        $pdo->exec(
            'CREATE TABLE password_history (
                history_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )'
        );
        $stmt = $pdo->prepare(
            'INSERT INTO users (user_id, username, full_name, password_hash, role, is_active, must_change_password)
             VALUES (1, ?, ?, ?, ?, 1, 1)'
        );
        $stmt->execute(['carol', 'Carol', password_hash('Old-password-1', PASSWORD_DEFAULT), 'operator']);
        return $pdo;
    }
}
