<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests สำหรับ helpers.php — pure functions ไม่ต้องใช้ database
 * ครอบ formatThaiDate (พ.ศ. conversion + edge cases) และ getLevelName (mapping + fallback)
 */
final class HelpersTest extends TestCase
{
    // ------------------------------------------------------------------
    // formatThaiDate
    // ------------------------------------------------------------------

    #[Test]
    public function it_converts_gregorian_year_to_buddhist_era(): void
    {
        // 2026 + 543 = 2569
        self::assertSame('22 มี.ค. 2569', formatThaiDate('2026-03-22'));
    }

    #[Test]
    public function it_does_not_zero_pad_single_digit_day(): void
    {
        // date('j') = วันที่ไม่เติมศูนย์นำหน้า
        self::assertSame('5 มี.ค. 2569', formatThaiDate('2026-03-05'));
    }

    #[Test]
    #[DataProvider('monthAbbreviationProvider')]
    public function it_maps_each_month_to_thai_abbreviation(string $date, string $expected): void
    {
        self::assertSame($expected, formatThaiDate($date));
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function monthAbbreviationProvider(): array
    {
        // ดัชนีเดือนเริ่มที่ 1 (ช่อง 0 ใน array เป็น placeholder '') — เทสต์ทั้ง 12 เดือน
        return [
            'ม.ค.'  => ['2024-01-15', '15 ม.ค. 2567'],
            'ก.พ.'  => ['2024-02-15', '15 ก.พ. 2567'],
            'มี.ค.' => ['2024-03-15', '15 มี.ค. 2567'],
            'เม.ย.' => ['2024-04-15', '15 เม.ย. 2567'],
            'พ.ค.'  => ['2024-05-15', '15 พ.ค. 2567'],
            'มิ.ย.' => ['2024-06-15', '15 มิ.ย. 2567'],
            'ก.ค.'  => ['2024-07-15', '15 ก.ค. 2567'],
            'ส.ค.'  => ['2024-08-15', '15 ส.ค. 2567'],
            'ก.ย.'  => ['2024-09-15', '15 ก.ย. 2567'],
            'ต.ค.'  => ['2024-10-15', '15 ต.ค. 2567'],
            'พ.ย.'  => ['2024-11-15', '15 พ.ย. 2567'],
            'ธ.ค.'  => ['2024-12-15', '15 ธ.ค. 2567'],
        ];
    }

    #[Test]
    public function it_returns_null_for_null_input(): void
    {
        self::assertNull(formatThaiDate(null));
    }

    #[Test]
    public function it_returns_null_for_empty_string(): void
    {
        self::assertNull(formatThaiDate(''));
    }

    #[Test]
    public function it_returns_null_for_unparseable_date(): void
    {
        // strtotime คืน false → ฟังก์ชันต้อง guard เป็น null ไม่ใช่ปี 1970
        self::assertNull(formatThaiDate('ไม่ใช่วันที่'));
    }

    // ------------------------------------------------------------------
    // getLevelName
    // ------------------------------------------------------------------

    #[Test]
    #[DataProvider('levelNameProvider')]
    public function it_maps_level_code_to_thai_name(string $code, string $expected): void
    {
        self::assertSame($expected, getLevelName($code));
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function levelNameProvider(): array
    {
        return [
            // วิชาการ (K)
            'K1' => ['K1', 'ปฏิบัติการ'],
            'K3' => ['K3', 'ชำนาญการพิเศษ'],
            'K4' => ['K4', 'เชี่ยวชาญ'],
            // ทั่วไป (O)
            'O1' => ['O1', 'ปฏิบัติงาน'],
            'O3' => ['O3', 'อาวุโส'],
            // อำนวยการ (M) / บริหาร (S)
            'M1' => ['M1', 'อำนวยการ ต้น'],
            'M2' => ['M2', 'อำนวยการ สูง'],
            'S1' => ['S1', 'บริหาร ต้น'],
            'S2' => ['S2', 'บริหาร สูง'],
        ];
    }

    #[Test]
    public function it_falls_back_to_the_code_when_level_is_unknown(): void
    {
        // รหัสที่ไม่อยู่ใน map → คืนรหัสเดิม (ไม่ throw, ไม่คืนค่าว่าง)
        self::assertSame('X9', getLevelName('X9'));
    }

    #[Test]
    public function it_falls_back_to_empty_string_for_empty_code(): void
    {
        self::assertSame('', getLevelName(''));
    }
}
