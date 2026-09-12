<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/equivalence.php';

/**
 * U6 — equivalenceDateFieldError: ฟิลด์วันที่ที่ส่งมาและไม่ว่างต้อง parse เข้มผ่าน
 * (ปิดช่อง single-sided แบบเดียวกับ U1 ของ diverse)
 */
final class EquivalenceDateFieldTest extends TestCase
{
    #[Test]
    public function missing_or_empty_fields_are_allowed(): void
    {
        self::assertNull(equivalenceDateFieldError([], EQUIVALENCE_DATE_FIELDS));
        self::assertNull(equivalenceDateFieldError([
            'request_start_date' => '',
            'request_end_date' => null,
        ], EQUIVALENCE_DATE_FIELDS));
    }

    #[Test]
    public function valid_dates_are_allowed(): void
    {
        self::assertNull(equivalenceDateFieldError([
            'request_start_date' => '2020-01-01',
            'request_end_date' => '2020-12-31',
        ], EQUIVALENCE_DATE_FIELDS));
    }

    #[Test]
    public function single_sided_malformed_date_is_rejected(): void
    {
        self::assertSame(
            'รูปแบบวันที่ไม่ถูกต้อง',
            equivalenceDateFieldError(['request_start_date' => 'not-a-date'], EQUIVALENCE_DATE_FIELDS)
        );
        self::assertSame(
            'รูปแบบวันที่ไม่ถูกต้อง',
            equivalenceDateFieldError(['request_end_date' => '2026-13-99'], EQUIVALENCE_DATE_FIELDS)
        );
        self::assertSame(
            'รูปแบบวันที่ไม่ถูกต้อง',
            equivalenceDateFieldError(['request_start_date' => '2026-02-30'], EQUIVALENCE_DATE_FIELDS)
        );
        self::assertSame(
            'รูปแบบวันที่ไม่ถูกต้อง',
            equivalenceDateFieldError(['request_start_date' => '2026-1-15'], EQUIVALENCE_DATE_FIELDS)
        );
    }

    #[Test]
    public function non_string_date_is_rejected(): void
    {
        self::assertSame(
            'รูปแบบวันที่ไม่ถูกต้อง',
            equivalenceDateFieldError(['request_end_date' => ['x']], EQUIVALENCE_DATE_FIELDS)
        );
    }

    #[Test]
    public function non_array_body_is_rejected(): void
    {
        self::assertSame('รูปแบบข้อมูลไม่ถูกต้อง', equivalenceDateFieldError(null, EQUIVALENCE_DATE_FIELDS));
        self::assertSame('รูปแบบข้อมูลไม่ถูกต้อง', equivalenceDateFieldError('x', EQUIVALENCE_DATE_FIELDS));
    }

    #[Test]
    public function create_source_validates_dates_before_insert(): void
    {
        $fn = self::functionSource(
            __DIR__ . '/../../routes/equivalence.php',
            'function createEquivalence',
            'function updateEquivalence'
        );
        self::assertStringContainsString('equivalenceDateFieldError($data, EQUIVALENCE_DATE_FIELDS)', $fn);
    }

    #[Test]
    public function update_source_validates_dates_before_update(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/equivalence.php');
        self::assertIsString($src);
        $start = strpos($src, 'function updateEquivalence');
        self::assertNotFalse($start);
        $fn = substr($src, $start);
        self::assertStringContainsString('equivalenceDateFieldError($data, EQUIVALENCE_DATE_FIELDS)', $fn);
    }

    private static function functionSource(string $file, string $startFn, string $endFn): string
    {
        $src = file_get_contents($file);
        self::assertIsString($src);
        $start = strpos($src, $startFn);
        self::assertNotFalse($start);
        $end = strpos($src, $endFn, $start);
        self::assertNotFalse($end);
        return substr($src, $start, $end - $start);
    }
}
