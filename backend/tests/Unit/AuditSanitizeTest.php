<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../audit.php';

/**
 * Unit tests สำหรับ sanitizeAuditData() ใน backend/audit.php — pure function, ไม่ใช้ DB
 * ต้องปิดบังค่า sensitive ก่อนถูก log ลง audit_log (กัน password/token หลุดใน before/after JSON)
 */
final class AuditSanitizeTest extends TestCase
{
    #[Test]
    public function it_redacts_all_known_sensitive_keys(): void
    {
        $data = [
            'password'      => 'plain-text-pw',
            'password_hash' => '$2y$10$abc',
            'token'         => 'raw-token',
            'access_token'  => 'raw-access',
            'refresh_token' => 'raw-refresh',
            'secret'        => 'shh',
            'api_key'       => 'sk-xxx',
        ];

        $result = sanitizeAuditData($data);

        foreach (array_keys($data) as $key) {
            self::assertSame('[REDACTED]', $result[$key], "key '{$key}' ต้องถูกปิดบัง");
        }
    }

    #[Test]
    public function it_leaves_non_sensitive_keys_untouched(): void
    {
        $data = [
            'username'  => 'admin',
            'full_name' => 'ผู้ดูแลระบบ',
            'is_active' => 1,
        ];

        self::assertSame($data, sanitizeAuditData($data));
    }

    #[Test]
    public function it_only_redacts_keys_that_are_actually_present(): void
    {
        // ไม่มี key 'secret'/'api_key' ใน input — ต้องไม่ถูกเติมเข้ามาเอง
        $data = ['username' => 'admin', 'password' => 'x'];

        $result = sanitizeAuditData($data);

        self::assertArrayNotHasKey('secret', $result);
        self::assertArrayNotHasKey('api_key', $result);
        self::assertSame('[REDACTED]', $result['password']);
        self::assertSame('admin', $result['username']);
    }

    #[Test]
    public function it_returns_empty_array_for_empty_input(): void
    {
        self::assertSame([], sanitizeAuditData([]));
    }

    #[Test]
    public function it_preserves_key_order_and_other_values_for_mixed_data(): void
    {
        $data = [
            'personnel_id' => 42,
            'password'     => 'leaked',
            'start_date'   => '2026-01-01',
        ];

        $result = sanitizeAuditData($data);

        self::assertSame(['personnel_id', 'password', 'start_date'], array_keys($result));
        self::assertSame(42, $result['personnel_id']);
        self::assertSame('2026-01-01', $result['start_date']);
        self::assertSame('[REDACTED]', $result['password']);
    }
}
