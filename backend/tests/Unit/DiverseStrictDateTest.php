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
    public function create_and_update_do_not_use_loose_datetime(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/diverse.php');
        self::assertIsString($src);
        self::assertDoesNotMatchRegularExpression('/new DateTime\s*\(/', $src);
        self::assertStringContainsString('$fromEnd < $fromStart', $src);
        self::assertStringContainsString('$toEnd < $toStart', $src);
    }
}
