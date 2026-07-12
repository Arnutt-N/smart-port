<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../middleware/rate_limit.php';

/**
 * Unit tests สำหรับ checkRateLimit() ใน backend/middleware/rate_limit.php
 * ครอบเฉพาะ path ที่ไม่ชน limit (ไม่เรียก exit()) — เขียนไฟล์จริงใต้ RATE_LIMIT_DIR
 * โดยใช้ userId/method สมมติที่ไม่ชนกับข้อมูลจริง แล้วลบไฟล์ทิ้งใน tearDown เสมอ
 */
final class RateLimitTest extends TestCase
{
    private const TEST_USER_ID = 999999001;

    private function fileFor(string $method): string
    {
        $key = 'user_' . self::TEST_USER_ID . '_' . $method;
        return RATE_LIMIT_DIR . md5($key) . '.json';
    }

    private function readHits(string $method): array
    {
        $file = $this->fileFor($method);
        if (!file_exists($file)) {
            return [];
        }
        $data = json_decode((string) file_get_contents($file), true) ?: [];
        return $data['hits'] ?? [];
    }

    protected function setUp(): void
    {
        $GLOBALS['_rate_limit_db_ready'] = false;
    }

    protected function tearDown(): void
    {
        $GLOBALS['_rate_limit_db_ready'] = null;

        foreach (['GET_COUNT', 'GET_WINDOW', 'GET_CONCURRENT'] as $method) {
            $file = $this->fileFor($method);
            if (file_exists($file)) {
                unlink($file);
            }
        }
    }

    #[Test]
    public function it_records_a_hit_on_first_call(): void
    {
        checkRateLimit(self::TEST_USER_ID, 'GET_COUNT', 5, 60);

        self::assertCount(1, $this->readHits('GET_COUNT'));
    }

    #[Test]
    public function it_accumulates_hits_across_calls_below_the_limit(): void
    {
        checkRateLimit(self::TEST_USER_ID, 'GET_COUNT', 5, 60);
        checkRateLimit(self::TEST_USER_ID, 'GET_COUNT', 5, 60);
        checkRateLimit(self::TEST_USER_ID, 'GET_COUNT', 5, 60);

        self::assertCount(3, $this->readHits('GET_COUNT'));
    }

    #[Test]
    public function it_purges_hits_older_than_the_window(): void
    {
        $file = $this->fileFor('GET_WINDOW');
        file_put_contents($file, json_encode([
            'hits' => [time() - 7200, time() - 7100],
        ]));

        checkRateLimit(self::TEST_USER_ID, 'GET_WINDOW', 5, 60);

        self::assertCount(1, $this->readHits('GET_WINDOW'));
    }

    #[Test]
    public function it_keeps_hits_still_inside_the_window(): void
    {
        $file = $this->fileFor('GET_WINDOW');
        file_put_contents($file, json_encode([
            'hits' => [time() - 10, time() - 5],
        ]));

        checkRateLimit(self::TEST_USER_ID, 'GET_WINDOW', 5, 60);

        self::assertCount(3, $this->readHits('GET_WINDOW'));
    }

    #[Test]
    public function it_isolates_counts_per_method(): void
    {
        checkRateLimit(self::TEST_USER_ID, 'GET_CONCURRENT', 5, 60);
        checkRateLimit(self::TEST_USER_ID, 'GET_CONCURRENT', 5, 60);

        self::assertCount(2, $this->readHits('GET_CONCURRENT'));
        self::assertCount(0, $this->readHits('GET_COUNT'));
    }
}
