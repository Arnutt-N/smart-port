<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/supportive.php';

/** N15 — ratio_percent เป็น DECIMAL(5,2) ห้ามตัดทศนิยมด้วย intval */
final class SupportiveRatioPercentTest extends TestCase
{
    #[Test]
    public function decimal_ratio_keeps_fraction(): void
    {
        self::assertSame(150.5, supportiveRatioPercent('150.50'));
        self::assertSame(100.0, supportiveRatioPercent('100'));
        self::assertSame(87.25, supportiveRatioPercent(87.25));
    }

    #[Test]
    public function compute_source_does_not_intval_ratio(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/supportive.php');
        self::assertIsString($src);
        $start = strpos($src, 'function computeSupportiveFields');
        self::assertNotFalse($start);
        $end = strpos($src, 'function createSupportive', $start);
        self::assertNotFalse($end);
        $fn = substr($src, $start, $end - $start);
        self::assertStringNotContainsString('intval($ratioRow', $fn);
        self::assertStringContainsString('supportiveRatioPercent(', $fn);
    }
}
