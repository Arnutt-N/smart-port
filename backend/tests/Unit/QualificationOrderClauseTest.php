<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * T5/T6 — anti-drift บนซอร์ส QualificationEngine (ไม่รัน SQL)
 */
final class QualificationOrderClauseTest extends TestCase
{
    private function computeForLevelSource(): string
    {
        $src = file_get_contents(__DIR__ . '/../../QualificationEngine.php');
        self::assertIsString($src);
        $start = strpos($src, 'function computeForLevel');
        self::assertNotFalse($start);
        $end = strpos($src, 'function computeDetail', $start);
        self::assertNotFalse($end);
        return substr($src, $start, $end - $start);
    }

    #[Test]
    public function compute_for_level_orders_null_remaining_days_last(): void
    {
        $fn = $this->computeForLevelSource();
        $nullPos = strpos($fn, '(remaining_days IS NULL)');
        $ascPos = strpos($fn, 'remaining_days ASC');
        self::assertNotFalse($nullPos);
        self::assertNotFalse($ascPos);
        self::assertLessThan($ascPos, $nullPos);
    }

    #[Test]
    public function ms_tenure_counts_inclusive_end_day(): void
    {
        $src = file_get_contents(__DIR__ . '/../../QualificationEngine.php');
        self::assertIsString($src);
        self::assertStringContainsString('DATEDIFF(end_date, effective_date) + 1', $src);
    }
}
