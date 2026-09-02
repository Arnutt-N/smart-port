<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../middleware/rate_limit.php';

/**
 * Issue #122: unit tests สำหรับ public endpoint rate limiter
 * (publicClientIp / publicRateLimitWithin) และ sanitizeLogValue
 * เขียนไฟล์จริงใต้ RATE_LIMIT_DIR ด้วย IP/bucket ทดสอบ แล้วลบไฟล์ทิ้งใน tearDown เสมอ
 */
final class PublicRateLimitTest extends TestCase
{
    private const TEST_IP = '203.0.113.122';
    private const BUCKET = 't122_bucket';

    private function fileFor(): string
    {
        return RATE_LIMIT_DIR . md5('public_' . self::TEST_IP . '_' . self::BUCKET) . '.json';
    }

    protected function tearDown(): void
    {
        $file = $this->fileFor();
        if (file_exists($file)) {
            unlink($file);
        }
        unset($_SERVER['HTTP_X_FORWARDED_FOR'], $_SERVER['REMOTE_ADDR']);
    }

    #[Test]
    public function it_allows_requests_below_the_limit_and_blocks_over_it(): void
    {
        for ($i = 0; $i < 3; $i++) {
            self::assertTrue(publicRateLimitWithin(self::BUCKET, 3, 60, self::TEST_IP));
        }

        self::assertFalse(publicRateLimitWithin(self::BUCKET, 3, 60, self::TEST_IP));
    }

    #[Test]
    public function it_recovers_when_window_hits_expire(): void
    {
        file_put_contents($this->fileFor(), json_encode([
            'hits' => [time() - 120, time() - 110],
        ]));

        self::assertTrue(publicRateLimitWithin(self::BUCKET, 2, 60, self::TEST_IP));
    }

    #[Test]
    public function it_uses_last_hop_of_forwarded_for(): void
    {
        // Render proxy chain append IP จริงต่อท้าย XFF — hop ท้ายสุดเชื่อถือได้
        // hop แรกคือค่าที่ client ตั้งเองได้ (ปลอมได้) จึงต้องไม่ถูกใช้
        $_SERVER['HTTP_X_FORWARDED_FOR'] = '198.51.100.7, 10.0.0.1';

        self::assertSame('10.0.0.1', publicClientIp());
    }

    #[Test]
    public function it_uses_the_only_hop_when_forwarded_for_is_single_hop(): void
    {
        $_SERVER['HTTP_X_FORWARDED_FOR'] = '198.51.100.7';

        self::assertSame('198.51.100.7', publicClientIp());
    }

    #[Test]
    public function it_falls_back_to_remote_addr_on_garbage_forwarded_for(): void
    {
        $_SERVER['HTTP_X_FORWARDED_FOR'] = "evil\r\nX-Injected: 1";
        $_SERVER['REMOTE_ADDR'] = '192.0.2.9';

        self::assertSame('192.0.2.9', publicClientIp());
    }

    #[Test]
    public function it_falls_back_to_remote_addr_when_no_forwarded_for(): void
    {
        $_SERVER['REMOTE_ADDR'] = '192.0.2.55';

        self::assertSame('192.0.2.55', publicClientIp());
    }

    #[Test]
    public function sanitize_log_value_strips_control_chars_and_truncates(): void
    {
        self::assertSame(
            'script-srcX-Fake: 1self',
            sanitizeLogValue("script-src\r\nX-Fake: 1\rself")
        );
        self::assertSame(str_repeat('a', 100), sanitizeLogValue(str_repeat('a', 500)));
        self::assertSame('', sanitizeLogValue(null));
    }
}
