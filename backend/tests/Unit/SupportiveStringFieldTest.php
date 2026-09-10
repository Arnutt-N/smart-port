<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/supportive.php';

/**
 * U2 — supportiveStringFieldError: ฟิลด์ string ที่ส่งมาต้องเป็น string จริง
 * (กัน array จาก JSON ทำ TypeError 500 ใน computeSupportiveFields)
 */
final class SupportiveStringFieldTest extends TestCase
{
    private const FIELDS = ['start_date', 'end_date', 'job_series_name', 'primary_series_name'];

    #[Test]
    public function missing_or_null_fields_are_allowed(): void
    {
        self::assertNull(supportiveStringFieldError([], self::FIELDS));
        self::assertNull(supportiveStringFieldError(['primary_series_name' => null], self::FIELDS));
    }

    #[Test]
    public function valid_strings_are_allowed(): void
    {
        self::assertNull(supportiveStringFieldError([
            'start_date' => '2020-01-01',
            'end_date' => '2020-12-31',
            'job_series_name' => 'วิชาการ',
            'primary_series_name' => 'อำนวยการ',
        ], self::FIELDS));
    }

    #[Test]
    public function array_values_are_rejected(): void
    {
        self::assertSame(
            'รูปแบบข้อมูลไม่ถูกต้อง',
            supportiveStringFieldError(['start_date' => ['2020-01-01']], self::FIELDS)
        );
        self::assertSame(
            'รูปแบบข้อมูลไม่ถูกต้อง',
            supportiveStringFieldError(['job_series_name' => ['x']], self::FIELDS)
        );
    }

    #[Test]
    public function int_values_are_rejected(): void
    {
        self::assertSame(
            'รูปแบบข้อมูลไม่ถูกต้อง',
            supportiveStringFieldError(['end_date' => 20200101], self::FIELDS)
        );
    }

    #[Test]
    public function create_and_update_call_the_guard(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/supportive.php');
        self::assertIsString($src);

        $start = strpos($src, 'function createSupportive');
        self::assertNotFalse($start);
        $end = strpos($src, 'function updateSupportive', $start);
        self::assertNotFalse($end);
        self::assertStringContainsString(
            'supportiveStringFieldError(',
            substr($src, $start, $end - $start)
        );

        $start = $end;
        $end = strpos($src, "\nfunction ", $start + 10);
        $fn = $end === false ? substr($src, $start) : substr($src, $start, $end - $start);
        self::assertStringContainsString('supportiveStringFieldError(', $fn);
    }
}
