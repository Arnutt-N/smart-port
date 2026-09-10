<?php

declare(strict_types=1);

namespace Tests\Unit;

use DateTime;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/diverse.php';

final class DiverseStrictDateTest extends TestCase
{
    #[Test]
    public function malformed_and_overflow_are_null(): void
    {
        self::assertNull(diverseStrictDate('abc'));
        self::assertNull(diverseStrictDate('2026-02-30'));
    }

    #[Test]
    public function valid_date_is_datetime(): void
    {
        $d = diverseStrictDate('2026-01-15');
        self::assertInstanceOf(DateTime::class, $d);
        self::assertSame('2026-01-15', $d->format('Y-m-d'));
    }

    #[Test]
    public function unpadded_dates_are_null(): void
    {
        // F1: ต้องเข้มเท่า probationStrictDate — ไม่มี zero-pad = format ผิด
        self::assertNull(diverseStrictDate('2026-1-15'));
        self::assertNull(diverseStrictDate('2026-01-5'));
    }

    #[Test]
    public function datetime_suffix_is_null(): void
    {
        self::assertNull(diverseStrictDate('2026-01-15 00:00:00'));
    }

    #[Test]
    public function create_and_update_do_not_use_loose_datetime(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/diverse.php');
        self::assertIsString($src);
        self::assertDoesNotMatchRegularExpression('/new DateTime\s*\(/', $src);
        self::assertStringContainsString('$fromEnd < $fromStart', $src);
        self::assertStringContainsString('$toEnd < $toStart', $src);
    }
}
