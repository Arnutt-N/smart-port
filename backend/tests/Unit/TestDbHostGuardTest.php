<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * Unit tests สำหรับ assertLocalTestDbHost() ใน tests/bootstrap.php
 *
 * บั๊กที่เทสชุดนี้กันไม่ให้กลับมา (code review M-2): เทสใน tests/Integration/ เขียนข้อมูลจริง
 * และ testPdo() อ่าน MYSQL_HOST จาก env ตรง ๆ — env ที่ชี้ production ค้างอยู่ในเชลล์เดียวกัน
 * ทำให้ phpunit เขียนลง production ได้โดยไม่มีสัญญาณเตือน
 *
 * เทสอยู่ใน Unit suite เพราะ guard ต้องทำงานได้โดยไม่ต้องมี MySQL — และเพราะ Integration
 * suite ทั้งชุด skip ตัวเองเมื่อต่อ DB ไม่ได้ ซึ่งจะทำให้ guard ไม่เคยถูกตรวจในเครื่องที่ไม่มี DB
 */
final class TestDbHostGuardTest extends TestCase
{
    private ?string $savedAllowRemote = null;

    protected function setUp(): void
    {
        $value = getenv('ALLOW_REMOTE_TEST_DB');
        $this->savedAllowRemote = $value === false ? null : $value;
        putenv('ALLOW_REMOTE_TEST_DB');
    }

    protected function tearDown(): void
    {
        if ($this->savedAllowRemote === null) {
            putenv('ALLOW_REMOTE_TEST_DB');
        } else {
            putenv('ALLOW_REMOTE_TEST_DB=' . $this->savedAllowRemote);
        }
    }

    /** @return array<string, array{string}> */
    public static function localHostProvider(): array
    {
        return [
            'docker compose service'   => ['db'],
            'loopback name'            => ['localhost'],
            'loopback v4 (ci.yml)'     => ['127.0.0.1'],
            'loopback v6'              => ['::1'],
            'run.sh WSL fallback'      => ['host.docker.internal'],
            'ตัวพิมพ์ใหญ่ต้องผ่านด้วย' => ['LocalHost'],
            'ช่องว่างหัวท้ายต้องไม่ทำให้พลาด' => [' 127.0.0.1 '],
        ];
    }

    #[Test]
    #[\PHPUnit\Framework\Attributes\DataProvider('localHostProvider')]
    public function accepts_local_hosts(string $host): void
    {
        assertLocalTestDbHost($host);
        self::assertTrue(true, 'host ในเครื่องต้องผ่านโดยไม่ throw');
    }

    #[Test]
    public function rejects_remote_host(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/ปฏิเสธการต่อ MYSQL_HOST/');
        assertLocalTestDbHost('gateway01.ap-southeast-1.prod.aws.tidbcloud.com');
    }

    #[Test]
    public function rejects_host_that_merely_contains_a_local_name(): void
    {
        // เทียบตรงตัว ไม่ใช่ substring — `localhost.attacker.example` ไม่ใช่ของในเครื่อง
        $this->expectException(RuntimeException::class);
        assertLocalTestDbHost('localhost.attacker.example');
    }

    #[Test]
    public function allows_remote_host_only_with_explicit_opt_in(): void
    {
        putenv('ALLOW_REMOTE_TEST_DB=1');
        assertLocalTestDbHost('gateway01.ap-southeast-1.prod.aws.tidbcloud.com');
        self::assertTrue(true, 'ตั้ง ALLOW_REMOTE_TEST_DB=1 แล้วต้องผ่าน');
    }

    #[Test]
    public function opt_in_must_be_exactly_one(): void
    {
        // ค่าอื่นที่ "ดูเหมือนจริง" ต้องไม่ปลดล็อก — ไม่งั้น env ที่หลงเหลือจากงานอื่นจะเปิดช่องให้
        foreach (['true', 'yes', '0', ''] as $value) {
            putenv('ALLOW_REMOTE_TEST_DB=' . $value);
            try {
                assertLocalTestDbHost('db.production.example');
                self::fail("ALLOW_REMOTE_TEST_DB={$value} ต้องไม่ปลดล็อก");
            } catch (RuntimeException) {
                self::assertTrue(true);
            }
        }
    }
}
