<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/multiplier.php';

/**
 * Unit tests สำหรับ validateAreaInput() — pure function, ไม่ใช้ DB
 * กติกา: ratio 100–999.99, วันที่ Y-m-d เข้มงวด (ไม่รับ overflow เช่น เดือน 13),
 * end >= start, district ว่าง = ทั้งจังหวัด (null)
 */
final class MultiplierAreaValidationTest extends TestCase
{
    private static function validInput(): array
    {
        return [
            'province' => ' สตูล ',
            'district' => 'ควนโดน',
            'basis_type' => 'MARTIAL_LAW',
            'multiplier_ratio' => '150',
            'effective_start_date' => '2004-01-26',
            'effective_end_date' => '2004-09-30',
            'legal_reference' => 'ประกาศ กห. ลง 26 ม.ค. 2547',
            'source_reference' => 'หนังสือเวียน xyz',
        ];
    }

    #[Test]
    public function it_accepts_valid_input_and_normalizes_values(): void
    {
        $result = validateAreaInput(self::validInput());

        self::assertNull($result['error']);
        self::assertSame('สตูล', $result['values']['province']); // trim แล้ว
        self::assertSame('ควนโดน', $result['values']['district']);
        self::assertSame(150.0, $result['values']['multiplier_ratio']);
        self::assertSame('2004-01-26', $result['values']['effective_start_date']);
        self::assertSame('2004-09-30', $result['values']['effective_end_date']);
    }

    #[Test]
    public function it_converts_blank_district_and_optional_fields_to_null(): void
    {
        $input = self::validInput();
        $input['district'] = '  ';
        unset($input['effective_end_date'], $input['legal_reference'], $input['source_reference']);

        $result = validateAreaInput($input);

        self::assertNull($result['error']);
        self::assertNull($result['values']['district']);
        self::assertNull($result['values']['effective_end_date']);
        self::assertNull($result['values']['legal_reference']);
        self::assertNull($result['values']['source_reference']);
    }

    /**
     * @return array<string, array{mixed, bool}>  [ratio, ควรผ่านไหม]
     */
    public static function ratioProvider(): array
    {
        return [
            'ต่ำกว่า 100 (80)'        => [80, false],
            'ต่ำกว่า 100 (99.99)'     => ['99.99', false],
            'ขอบล่างพอดี (100)'       => [100, true],
            'ทศนิยม (150.5)'          => [150.5, true],
            'ขอบบนพอดี (999.99)'      => ['999.99', true],
            'เกินเพดาน DECIMAL (1000)' => [1000, false],
            'ไม่ใช่ตัวเลข'             => ['สองเท่า', false],
        ];
    }

    #[Test]
    #[DataProvider('ratioProvider')]
    public function it_enforces_ratio_bounds(mixed $ratio, bool $shouldPass): void
    {
        $input = self::validInput();
        $input['multiplier_ratio'] = $ratio;

        $result = validateAreaInput($input);

        if ($shouldPass) {
            self::assertNull($result['error']);
        } else {
            self::assertNotNull($result['error']);
            self::assertNull($result['values']);
        }
    }

    #[Test]
    public function it_rejects_missing_province(): void
    {
        $input = self::validInput();
        $input['province'] = '';

        self::assertNotNull(validateAreaInput($input)['error']);
    }

    #[Test]
    public function it_rejects_missing_basis_type(): void
    {
        $input = self::validInput();
        unset($input['basis_type']);

        self::assertNotNull(validateAreaInput($input)['error']);
    }

    #[Test]
    public function it_rejects_end_date_before_start_date(): void
    {
        $input = self::validInput();
        $input['effective_end_date'] = '2004-01-25';

        self::assertNotNull(validateAreaInput($input)['error']);
    }

    #[Test]
    public function it_rejects_overflow_date_like_month_13(): void
    {
        $input = self::validInput();
        $input['effective_start_date'] = '2004-13-45'; // createFromFormat จะ overflow เป็น 2005-02-14 ถ้าไม่เช็ค warning

        self::assertNotNull(validateAreaInput($input)['error']);
    }
}
