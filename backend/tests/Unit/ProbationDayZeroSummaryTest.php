<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * N25 — remaining_days === 0 คือ READY ไม่ใช่ overdue
 * summary ของ GET /probation และ /dashboard ต้องนับ overdue เป็น < 0 เท่านั้น
 */
final class ProbationDayZeroSummaryTest extends TestCase
{
    #[Test]
    public function list_summary_counts_overdue_as_strictly_negative(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/probation.php');
        self::assertIsString($src);
        $start = strpos($src, 'function getProbationList');
        self::assertNotFalse($start);
        $end = strpos($src, 'function getProbationDetail', $start);
        self::assertNotFalse($end);
        $fn = substr($src, $start, $end - $start);
        self::assertStringContainsString('DATEDIFF(end_date, CURDATE()) < 0', $fn);
        self::assertStringNotContainsString('DATEDIFF(end_date, CURDATE()) <= 0', $fn);
        self::assertStringContainsString('if ($rem < 0) $overdue++', $fn);
        self::assertStringNotContainsString('if ($rem <= 0) $overdue++', $fn);
    }

    #[Test]
    public function dashboard_overdue_matches_list_summary(): void
    {
        $src = file_get_contents(__DIR__ . '/../../api.php');
        self::assertIsString($src);
        self::assertStringContainsString('remaining_days < 0', $src);
        self::assertDoesNotMatchRegularExpression(
            '/remaining_days\s*<=\s*0/',
            $src
        );
    }
}
