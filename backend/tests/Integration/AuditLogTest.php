<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../audit.php';

/**
 * Integration tests สำหรับ logAudit() ใน backend/audit.php — เขียนลงตาราง audit_log จริง
 * (migrations/03-audit-log.sql) แล้วอ่านกลับมาตรวจ sanitization + JSON encode/decode
 *
 * ใช้ user_id ที่มีอยู่จริงใน seed (ไม่ hardcode) เพราะ audit_log.user_id มี FK ไป users(user_id)
 */
final class AuditLogTest extends TestCase
{
    private static ?PDO $pdo = null;
    private static int $seedUserId = 0;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }

        $exists = self::$pdo->query("SHOW TABLES LIKE 'audit_log'")->fetchColumn();
        if (!$exists) {
            self::markTestSkipped('ไม่พบตาราง audit_log — รัน migrations/03-audit-log.sql ก่อน');
        }

        $userId = self::$pdo->query('SELECT user_id FROM users LIMIT 1')->fetchColumn();
        if (!$userId) {
            self::markTestSkipped('ไม่พบ seed user ในตาราง users — ต้องมีอย่างน้อย 1 แถวเพื่อผ่าน FK ของ audit_log');
        }
        self::$seedUserId = (int) $userId;
    }

    private function deleteAuditRow(int $auditId): void
    {
        self::$pdo->prepare('DELETE FROM audit_log WHERE audit_id = ?')->execute([$auditId]);
    }

    #[Test]
    public function it_persists_a_create_action_with_after_value_only(): void
    {
        $ok = logAudit(
            self::$pdo,
            self::$seedUserId,
            'CREATE',
            'TEST_AUDIT_TABLE',
            999001,
            null,
            ['field' => 'new-value']
        );
        self::assertTrue($ok);

        $auditId = (int) self::$pdo->lastInsertId();
        try {
            $row = self::$pdo->prepare('SELECT * FROM audit_log WHERE audit_id = ?');
            $row->execute([$auditId]);
            $data = $row->fetch(PDO::FETCH_ASSOC);

            self::assertSame(self::$seedUserId, (int) $data['user_id']);
            self::assertSame('CREATE', $data['action']);
            self::assertSame('TEST_AUDIT_TABLE', $data['table_name']);
            self::assertSame(999001, (int) $data['record_id']);
            self::assertNull($data['before_value']);
            self::assertSame(['field' => 'new-value'], json_decode($data['after_value'], true));
        } finally {
            $this->deleteAuditRow($auditId);
        }
    }

    #[Test]
    public function it_persists_before_and_after_values_for_update_action(): void
    {
        logAudit(
            self::$pdo,
            self::$seedUserId,
            'UPDATE',
            'TEST_AUDIT_TABLE',
            999002,
            ['is_active' => 1],
            ['is_active' => 0]
        );

        $auditId = (int) self::$pdo->lastInsertId();
        try {
            $stmt = self::$pdo->prepare('SELECT before_value, after_value FROM audit_log WHERE audit_id = ?');
            $stmt->execute([$auditId]);
            $data = $stmt->fetch(PDO::FETCH_ASSOC);

            self::assertSame(['is_active' => 1], json_decode($data['before_value'], true));
            self::assertSame(['is_active' => 0], json_decode($data['after_value'], true));
        } finally {
            $this->deleteAuditRow($auditId);
        }
    }

    #[Test]
    public function it_redacts_sensitive_fields_before_persisting(): void
    {
        logAudit(
            self::$pdo,
            self::$seedUserId,
            'UPDATE',
            'TEST_AUDIT_TABLE',
            999003,
            ['password_hash' => 'old-hash-should-not-leak'],
            ['password_hash' => 'new-hash-should-not-leak']
        );

        $auditId = (int) self::$pdo->lastInsertId();
        try {
            $stmt = self::$pdo->prepare('SELECT before_value, after_value FROM audit_log WHERE audit_id = ?');
            $stmt->execute([$auditId]);
            $data = $stmt->fetch(PDO::FETCH_ASSOC);

            $before = json_decode($data['before_value'], true);
            $after = json_decode($data['after_value'], true);

            self::assertSame('[REDACTED]', $before['password_hash']);
            self::assertSame('[REDACTED]', $after['password_hash']);
            self::assertStringNotContainsString('old-hash-should-not-leak', $data['before_value']);
            self::assertStringNotContainsString('new-hash-should-not-leak', $data['after_value']);
        } finally {
            $this->deleteAuditRow($auditId);
        }
    }

    #[Test]
    public function it_persists_thai_text_without_mangling_via_unescaped_unicode(): void
    {
        logAudit(
            self::$pdo,
            self::$seedUserId,
            'CREATE',
            'TEST_AUDIT_TABLE',
            999004,
            null,
            ['full_name' => 'ทดสอบ ภาษาไทย']
        );

        $auditId = (int) self::$pdo->lastInsertId();
        try {
            $stmt = self::$pdo->prepare('SELECT after_value FROM audit_log WHERE audit_id = ?');
            $stmt->execute([$auditId]);
            $afterValue = $stmt->fetchColumn();

            // JSON_UNESCAPED_UNICODE — ต้องเก็บเป็นตัวอักษรไทยจริง ไม่ใช่ \uXXXX escape
            self::assertStringContainsString('ทดสอบ ภาษาไทย', $afterValue);
            self::assertSame(['full_name' => 'ทดสอบ ภาษาไทย'], json_decode($afterValue, true));
        } finally {
            $this->deleteAuditRow($auditId);
        }
    }

    #[Test]
    public function it_stores_null_for_both_values_when_omitted(): void
    {
        logAudit(self::$pdo, self::$seedUserId, 'DELETE', 'TEST_AUDIT_TABLE', 999005);

        $auditId = (int) self::$pdo->lastInsertId();
        try {
            $stmt = self::$pdo->prepare('SELECT before_value, after_value FROM audit_log WHERE audit_id = ?');
            $stmt->execute([$auditId]);
            $data = $stmt->fetch(PDO::FETCH_ASSOC);

            self::assertNull($data['before_value']);
            self::assertNull($data['after_value']);
        } finally {
            $this->deleteAuditRow($auditId);
        }
    }
}
