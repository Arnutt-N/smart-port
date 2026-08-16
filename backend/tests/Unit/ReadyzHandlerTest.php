<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/readyz.php';

/**
 * Issue #124 — readyz DB-down contract:
 * api.php ส่ง tryGetDB() (คืน null เมื่อต่อ DB ไม่ได้ แทนการ exit แบบ getDB())
 * handler ต้องคืน documented not_ready shape จริง — ไม่ใช่ dead code เหมือนก่อน
 */
final class ReadyzHandlerTest extends TestCase
{
    protected function tearDown(): void
    {
        // http_response_code() เป็น process-global — reset กัน test ถัดไป false-pass
        http_response_code(200);
    }

    public function test_null_pdo_emits_documented_not_ready_shape(): void
    {
        ob_start();
        try {
            handleReadyz(null, 'GET');
        } finally {
            $output = (string) ob_get_clean();
        }

        $this->assertSame(503, http_response_code());

        $json = json_decode($output, true);
        $this->assertIsArray($json);
        $this->assertSame('not_ready', $json['status']);
        $this->assertSame('unreachable', $json['db']);
        $this->assertArrayHasKey('release', $json);
        // minimal disclosure: มีแค่ 3 key สถานะ — ไม่มีชื่อตาราง/migration
        $this->assertSame(['status', 'release', 'db'], array_keys($json));
    }

    public function test_null_pdo_still_rejects_non_get_before_db_check(): void
    {
        ob_start();
        try {
            handleReadyz(null, 'POST');
        } finally {
            $output = (string) ob_get_clean();
        }

        $this->assertSame(405, http_response_code());
        $this->assertJson($output);
    }
}
