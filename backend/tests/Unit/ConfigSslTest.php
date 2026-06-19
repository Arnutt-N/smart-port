<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use RuntimeException;

// ตั้ง JWT_SECRET ก่อน require config.php เพื่อกัน exit() side-effect
// (config.php เช็ค JWT_SECRET ว่างแล้ว exit ทันที)
putenv('JWT_SECRET=test-secret');

// โหลด config.php เพื่อเข้าถึง buildSslOptions() — define() ซ้ำก็ไม่เป็นไร
// เพราะ bootstrap.php ไม่ได้ require config.php
if (!defined('JWT_SECRET')) {
    require_once __DIR__ . '/../../config.php';
}

/**
 * Unit tests สำหรับ buildSslOptions() — ตรวจพฤติกรรม fail-closed ของ SSL CA
 *
 * SSL disabled  → คืน []
 * SSL enabled + CA อ่านได้ → คืน array ครบ + verify_server_cert = true
 * SSL enabled + CA ว่าง/อ่านไม่ได้ → throw RuntimeException (fail-closed)
 */
final class ConfigSslTest extends TestCase
{
    #[Test]
    public function ssl_disabled_returns_empty_for_blank(): void
    {
        self::assertSame([], buildSslOptions('', '/any/path'));
    }

    #[Test]
    public function ssl_disabled_returns_empty_for_false_string(): void
    {
        self::assertSame([], buildSslOptions('false', '/any/path'));
    }

    #[Test]
    public function ssl_enabled_with_readable_ca_returns_verify_true(): void
    {
        // __FILE__ เป็น path ที่อ่านได้แน่นอน (ไฟล์นี้เอง)
        $opts = buildSslOptions('true', __FILE__);
        self::assertSame(__FILE__, $opts[PDO::MYSQL_ATTR_SSL_CA]);
        self::assertTrue($opts[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT]);
    }

    #[Test]
    public function ssl_enabled_with_digit_1_also_works(): void
    {
        $opts = buildSslOptions('1', __FILE__);
        self::assertSame(__FILE__, $opts[PDO::MYSQL_ATTR_SSL_CA]);
        self::assertTrue($opts[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT]);
    }

    #[Test]
    public function ssl_enabled_without_ca_throws_runtime_exception(): void
    {
        $this->expectException(RuntimeException::class);
        buildSslOptions('true', '');
    }

    #[Test]
    public function ssl_enabled_with_nonexistent_ca_throws_runtime_exception(): void
    {
        $this->expectException(RuntimeException::class);
        buildSslOptions('true', '/path/that/does/not/exist/ca.pem');
    }
}
