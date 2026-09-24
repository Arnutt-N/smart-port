<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../auth.php';

/**
 * T-D2.1 — validatePasswordPolicy() (กฎเข้ม: ยาว >= 12, ครบ 4 กลุ่ม, จำ 5 รุ่น).
 */
final class PasswordPolicyTest extends TestCase
{
    private static function hash(string $pw): string
    {
        // cost ต่ำเพื่อความเร็วเทส — password_verify ตรวจได้ทุก cost
        return password_hash($pw, PASSWORD_BCRYPT, ['cost' => 4]);
    }

    #[Test]
    public function valid_password_passes(): void
    {
        self::assertNull(validatePasswordPolicy('Abcdef123!@#', []));
    }

    #[Test]
    public function boundary_11_fails_12_passes(): void
    {
        self::assertNotNull(validatePasswordPolicy('Abcde123!@#', []));
        self::assertNull(validatePasswordPolicy('Abcdef123!@#', []));
    }

    #[Test]
    public function missing_each_class_fails(): void
    {
        // ขาดพิมพ์ใหญ่ / พิมพ์เล็ก / ตัวเลข / อักขระพิเศษ — ตกทีละข้อ
        self::assertNotNull(validatePasswordPolicy('abcdef123!@#', []));
        self::assertNotNull(validatePasswordPolicy('ABCDEF123!@#', []));
        self::assertNotNull(validatePasswordPolicy('Abcdefgh!@#$', []));
        self::assertNotNull(validatePasswordPolicy('Abcdef123456', []));
    }

    #[Test]
    public function thai_digit_counts_as_number(): void
    {
        // ไม่มีเลขอารบิกเลย — เลขไทย ๑ ต้องนับเป็นตัวเลข
        self::assertNull(validatePasswordPolicy('AaPassword๑!', []));
    }

    #[Test]
    public function over_72_bytes_fails(): void
    {
        // 73 ตัวอักษร ผ่านกฎอื่นหมด — ต้องตกที่เพดาน bytes (กัน bcrypt ตัดเงียบ)
        self::assertNotNull(validatePasswordPolicy('Aa1!' . str_repeat('x', 69), []));
    }

    #[Test]
    public function reuse_within_5_generations_fails(): void
    {
        $history = [
            self::hash('First-gen-11!'),
            self::hash('Second-gen-22@'),
            self::hash('Third-gen-33#'),
            self::hash('Fourth-gen-44$'),
            self::hash('Fifth-gen-55%'),
        ];
        self::assertNotNull(validatePasswordPolicy('Third-gen-33#', $history));
    }

    #[Test]
    public function reuse_beyond_5_generations_passes(): void
    {
        // รุ่นที่ 6 หลุดจาก history ที่ส่งมา (5 รุ่นล่าสุด) — ใช้ซ้ำได้
        $history = [
            self::hash('Second-gen-22@'),
            self::hash('Third-gen-33#'),
            self::hash('Fourth-gen-44$'),
            self::hash('Fifth-gen-55%'),
            self::hash('Sixth-gen-66^'),
        ];
        self::assertNull(validatePasswordPolicy('First-gen-11!', $history));
    }

    #[Test]
    public function non_string_history_entries_are_ignored(): void
    {
        self::assertNull(validatePasswordPolicy('Abcdef123!@#', [null, 123, false]));
    }

    #[Test]
    public function error_messages_are_thai(): void
    {
        $msg = validatePasswordPolicy('short', []);
        self::assertIsString($msg);
        self::assertMatchesRegularExpression('/[\x{0E00}-\x{0E7F}]/u', $msg);
    }

    #[Test]
    public function prune_keeps_only_5_latest(): void
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            self::markTestSkipped('pdo_sqlite not available');
        }
        $pdo = new PDO('sqlite::memory:');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec(
            'CREATE TABLE password_history (
                history_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                password_hash TEXT NOT NULL
            )'
        );
        $ins = $pdo->prepare('INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)');
        for ($i = 1; $i <= 7; $i++) {
            $ins->execute([1, "hash-{$i}"]);
        }

        prunePasswordHistory($pdo, 1);

        $kept = $pdo->query('SELECT password_hash FROM password_history ORDER BY history_id')->fetchAll(PDO::FETCH_COLUMN);
        self::assertSame(['hash-3', 'hash-4', 'hash-5', 'hash-6', 'hash-7'], $kept);
    }
}
