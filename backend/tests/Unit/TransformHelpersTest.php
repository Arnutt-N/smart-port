<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TransformHelpers;

require_once __DIR__ . '/../../sync/TransformHelpers.php';

final class TransformHelpersTest extends TestCase
{
    #[Test]
    #[DataProvider('beDateProvider')]
    public function it_converts_be_date_to_ce(?string $input, ?string $expected): void
    {
        self::assertSame($expected, TransformHelpers::beDateToCe($input));
    }

    public static function beDateProvider(): array
    {
        return [
            'standard BE datetime' => ['2565-03-15 00:00:00', '2022-03-15'],
            'BE date with time' => ['2566-12-01 14:30:00', '2023-12-01'],
            'CE date passthrough' => ['2022-03-15 00:00:00', '2022-03-15'],
            'boundary 2401 is BE' => ['2401-01-01 00:00:00', '1858-01-01'],
            'boundary 2400 is CE' => ['2400-06-15 00:00:00', '2400-06-15'],
            'null input' => [null, null],
            'empty string' => ['', null],
            'whitespace only' => ['   ', null],
            'date only 10 chars' => ['2565-03-15', '2022-03-15'],
            'invalid month' => ['2565-13-01 00:00:00', null],
            'invalid day' => ['2565-01-32 00:00:00', null],
            'garbage' => ['not-a-date', null],
        ];
    }

    #[Test]
    #[DataProvider('beYearProvider')]
    public function it_converts_be_year_to_ce(?string $input, ?int $expected): void
    {
        self::assertSame($expected, TransformHelpers::beYearToCe($input));
    }

    public static function beYearProvider(): array
    {
        return [
            'standard BE year' => ['2565', 2022],
            'BE year 2566' => ['2566', 2023],
            'CE year passthrough' => ['2022', 2022],
            'boundary 2401' => ['2401', 1858],
            'boundary 2400' => ['2400', 2400],
            'null' => [null, null],
            'empty' => ['', null],
            'zero' => ['0', null],
            'with spaces' => [' 2565 ', 2022],
        ];
    }

    #[Test]
    #[DataProvider('levelProvider')]
    public function it_crosswalks_level_codes(?string $input, ?string $expected): void
    {
        self::assertSame($expected, TransformHelpers::levelCrosswalk($input));
    }

    public static function levelProvider(): array
    {
        return [
            'K1' => ['01', 'K1'],
            'K2' => ['02', 'K2'],
            'K3' => ['03', 'K3'],
            'K4' => ['04', 'K4'],
            'K5' => ['05', 'K5'],
            'M1' => ['06', 'M1'],
            'M2' => ['07', 'M2'],
            'S1' => ['08', 'S1'],
            'S2' => ['09', 'S2'],
            'O1' => ['10', 'O1'],
            'O2' => ['11', 'O2'],
            'O3' => ['12', 'O3'],
            'single digit padded' => ['1', 'K1'],
            'null' => [null, null],
            'empty' => ['', null],
            'unknown code' => ['99', null],
            'alpha' => ['AB', null],
        ];
    }

    #[Test]
    #[DataProvider('trimProvider')]
    public function it_trims_or_returns_null(?string $input, ?string $expected): void
    {
        self::assertSame($expected, TransformHelpers::trimOrNull($input));
    }

    public static function trimProvider(): array
    {
        return [
            'normal' => ['hello', 'hello'],
            'padded' => ['  hello  ', 'hello'],
            'null' => [null, null],
            'empty' => ['', null],
            'whitespace' => ['   ', null],
        ];
    }

    #[Test]
    public function it_converts_be_datetime_with_time_component(): void
    {
        self::assertSame('2022-03-15 14:30:00', TransformHelpers::beDatetimeToCe('2565-03-15 14:30:00'));
    }

    #[Test]
    public function it_converts_be_datetime_date_only(): void
    {
        self::assertSame('2022-03-15', TransformHelpers::beDatetimeToCe('2565-03-15'));
    }

    #[Test]
    public function it_returns_null_datetime_for_null(): void
    {
        self::assertNull(TransformHelpers::beDatetimeToCe(null));
    }
}
