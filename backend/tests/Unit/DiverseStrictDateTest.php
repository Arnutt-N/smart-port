<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

final class DiverseStrictDateTest extends TestCase
{
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
