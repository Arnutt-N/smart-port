<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/probation.php';

/** N17 — POST /probation ต้อง parse Y-m-d เข้ม ไม่เทียบ string หลวม */
final class ProbationCreateDateTest extends TestCase
{
    #[Test]
    public function inverted_range_is_rejected(): void
    {
        self::assertSame(
            'end_date must be greater than or equal to start_date',
            probationCreateDateError('2026-12-31', '2026-01-01')
        );
    }

    #[Test]
    public function unpadded_start_is_rejected(): void
    {
        self::assertSame('Invalid date format', probationCreateDateError('2026-1-5', '2026-07-01'));
    }

    #[Test]
    public function overflow_end_is_rejected(): void
    {
        self::assertSame('Invalid date format', probationCreateDateError('2026-01-01', '2026-02-30'));
    }

    #[Test]
    public function valid_range_has_no_error(): void
    {
        self::assertNull(probationCreateDateError('2026-01-01', '2026-07-01'));
    }

    #[Test]
    public function create_source_uses_helper(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/probation.php');
        self::assertIsString($src);
        $start = strpos($src, 'function createProbationEnrollment');
        self::assertNotFalse($start);
        $end = strpos($src, 'function updateProbationEnrollment', $start);
        self::assertNotFalse($end);
        $fn = substr($src, $start, $end - $start);
        self::assertStringContainsString('probationCreateDateError(', $fn);
        self::assertStringNotContainsString('$data[\'end_date\'] < $data[\'start_date\']', $fn);
    }
}
