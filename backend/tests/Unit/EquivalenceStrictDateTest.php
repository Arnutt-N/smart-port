<?php

declare(strict_types=1);

namespace Tests\Unit;

use DateTime;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/equivalence.php';

/**
 * U3 — strictDate ต้องเข้มเท่า strictDate
 * (mirror DiverseStrictDateTest/SupportiveStrictDateTest)
 */
final class EquivalenceStrictDateTest extends TestCase
{
    #[Test]
    public function malformed_and_overflow_are_null(): void
    {
        self::assertNull(strictDate('abc'));
        self::assertNull(strictDate('2026-02-30'));
    }

    #[Test]
    public function valid_date_is_datetime(): void
    {
        $d = strictDate('2026-01-15');
        self::assertInstanceOf(DateTime::class, $d);
        self::assertSame('2026-01-15', $d->format('Y-m-d'));
    }

    #[Test]
    public function unpadded_dates_are_null(): void
    {
        self::assertNull(strictDate('2026-1-15'));
        self::assertNull(strictDate('2026-01-5'));
    }

    #[Test]
    public function datetime_suffix_is_null(): void
    {
        self::assertNull(strictDate('2026-01-15 00:00:00'));
    }
}
