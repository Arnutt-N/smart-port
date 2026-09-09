<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../audit.php';

/**
 * N36 — logAudit ต้องไม่เขียน payload ว่างเงียบเมื่อ json_encode ล้ม (UTF-8 พัง)
 * เดิม json_encode คืน false → bind เป็น empty → audit row มี after_value ว่างโดยไม่มี error
 * ตอนนี้ JSON_THROW_ON_ERROR ทำให้เข้า catch → error_log + คืน false และไม่เขียน row
 */
final class AuditJsonEncodeTest extends TestCase
{
    #[Test]
    public function invalid_utf8_payload_returns_false_and_writes_no_row(): void
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        $pdo = new PDO('sqlite::memory:');
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

        // "\xC3\x28" เป็น invalid UTF-8 sequence — json_encode(THROW_ON_ERROR) ต้อง throw
        $ok = logAudit($pdo, 1, 'CREATE', 'personnel', 7, null, ['name' => "\xC3\x28"]);

        self::assertFalse($ok);
        self::assertSame(0, (int) $pdo->query('SELECT COUNT(*) FROM audit_log')->fetchColumn());
    }

    #[Test]
    public function valid_payload_still_writes_row(): void
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        $pdo = new PDO('sqlite::memory:');
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

        $ok = logAudit($pdo, 1, 'CREATE', 'personnel', 7, null, ['name' => 'สมชาย']);

        self::assertTrue($ok);
        self::assertSame(1, (int) $pdo->query('SELECT COUNT(*) FROM audit_log')->fetchColumn());
    }
}
