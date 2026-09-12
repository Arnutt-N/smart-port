<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/diverse.php';

/**
 * U1 — diverseDateFieldError: ฟิลด์วันที่ที่ส่งมาและไม่ว่างต้อง parse เข้มผ่าน
 * (ปิดช่อง single-sided ที่ข้ามบล็อกคู่แล้ว bind ดิบ)
 */
final class DiverseDateFieldTest extends TestCase
{
    #[Test]
    public function missing_or_empty_fields_are_allowed(): void
    {
        self::assertNull(diverseDateFieldError([], DIVERSE_DATE_FIELDS));
        self::assertNull(diverseDateFieldError([
            'from_start_date' => '',
            'to_end_date' => null,
        ], DIVERSE_DATE_FIELDS));
    }

    #[Test]
    public function valid_dates_are_allowed(): void
    {
        self::assertNull(diverseDateFieldError([
            'from_start_date' => '2020-01-01',
            'from_end_date' => '2020-12-31',
            'to_start_date' => '2021-01-01',
            'to_end_date' => '2021-06-30',
        ], DIVERSE_DATE_FIELDS));
    }

    #[Test]
    public function single_sided_malformed_date_is_rejected(): void
    {
        // ช่องโหว่เดิม: ส่งข้างเดียว อีกข้างว่าง = ข้ามบล็อกคู่แล้ว bind ดิบ
        self::assertSame(
            'รูปแบบวันที่ไม่ถูกต้อง',
            diverseDateFieldError(['from_start_date' => 'not-a-date'], DIVERSE_DATE_FIELDS)
        );
        self::assertSame(
            'รูปแบบวันที่ไม่ถูกต้อง',
            diverseDateFieldError(['to_end_date' => '2026-02-30'], DIVERSE_DATE_FIELDS)
        );
        self::assertSame(
            'รูปแบบวันที่ไม่ถูกต้อง',
            diverseDateFieldError(['from_start_date' => '2026-1-15'], DIVERSE_DATE_FIELDS)
        );
    }

    #[Test]
    public function non_string_date_is_rejected(): void
    {
        self::assertSame(
            'รูปแบบวันที่ไม่ถูกต้อง',
            diverseDateFieldError(['from_start_date' => ['x']], DIVERSE_DATE_FIELDS)
        );
    }

    #[Test]
    public function non_array_body_is_rejected(): void
    {
        self::assertSame('รูปแบบข้อมูลไม่ถูกต้อง', diverseDateFieldError(null, DIVERSE_DATE_FIELDS));
        self::assertSame('รูปแบบข้อมูลไม่ถูกต้อง', diverseDateFieldError('x', DIVERSE_DATE_FIELDS));
    }

    #[Test]
    public function create_source_validates_dates_before_insert(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/diverse.php');
        self::assertIsString($src);
        $start = strpos($src, 'function createDiverse');
        self::assertNotFalse($start);
        $end = strpos($src, 'function updateDiverse', $start);
        $fn = substr($src, $start, $end - $start);
        self::assertStringContainsString('diverseDateFieldError($data, DIVERSE_DATE_FIELDS)', $fn);
    }

    #[Test]
    public function update_source_validates_dates_before_update(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/diverse.php');
        self::assertIsString($src);
        $start = strpos($src, 'function updateDiverse');
        self::assertNotFalse($start);
        $end = strpos($src, 'function deleteDiverse', $start);
        $fn = substr($src, $start, $end - $start);
        self::assertStringContainsString('diverseDateFieldError($data, DIVERSE_DATE_FIELDS)', $fn);
    }

    #[Test]
    public function empty_string_dates_normalize_to_null(): void
    {
        // R7: '' ต้องไม่ถูก bind ดิบลง DATE — normalize เป็น null ทั้ง create/update
        foreach (['function createDiverse', 'function updateDiverse'] as $fnName) {
            $src = file_get_contents(__DIR__ . '/../../routes/diverse.php');
            self::assertIsString($src);
            $start = strpos($src, $fnName);
            self::assertNotFalse($start, $fnName);
            $end = strpos($src, "\nfunction ", $start + 10);
            $fn = $end === false ? substr($src, $start) : substr($src, $start, $end - $start);
            self::assertStringContainsString('DIVERSE_DATE_FIELDS as $dateField', $fn, $fnName);
            self::assertStringContainsString("\$data[\$dateField] = null;", $fn, $fnName);
        }
    }
}
