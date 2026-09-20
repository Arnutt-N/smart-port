<?php

declare(strict_types=1);

namespace Tests\Unit;

use DateTime;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests สำหรับ helpers.php — pure functions ไม่ต้องใช้ database
 * ครอบ formatThaiDate (พ.ศ. conversion + edge cases), getLevelName (mapping + fallback)
 * และ photoWebPath (แปลง path ที่เก็บใน DB เป็น path สำหรับเสิร์ฟผ่านเว็บ)
 */
final class HelpersTest extends TestCase
{
    // ------------------------------------------------------------------
    // photoWebPath
    // ------------------------------------------------------------------

    #[Test]
    public function it_returns_relative_web_path_for_a_stored_file_name(): void
    {
        self::assertSame('uploads/photo_abc.jpg', photoWebPath('photo_abc.jpg'));
    }

    #[Test]
    public function it_keeps_an_already_relative_path_unchanged(): void
    {
        self::assertSame('uploads/photo_abc.jpg', photoWebPath('uploads/photo_abc.jpg'));
    }

    #[Test]
    public function it_rewrites_legacy_absolute_filesystem_paths(): void
    {
        // แถวเก่าเคยเก็บ path ของ container ทั้งเส้น ทำให้ <img src> ยิงออกนอกโดเมน API
        self::assertSame(
            'uploads/photo_abc.jpg',
            photoWebPath('/var/www/html/uploads/photo_abc.jpg')
        );
    }

    #[Test]
    public function it_rewrites_legacy_windows_style_paths(): void
    {
        self::assertSame(
            'uploads/photo_abc.jpg',
            photoWebPath('C:\\xampp\\htdocs\\uploads\\photo_abc.jpg')
        );
    }

    #[Test]
    public function it_returns_null_for_missing_photo(): void
    {
        self::assertNull(photoWebPath(null));
        self::assertNull(photoWebPath(''));
    }

    #[Test]
    public function it_strips_traversal_segments(): void
    {
        self::assertSame('uploads/photo_abc.jpg', photoWebPath('../../etc/photo_abc.jpg'));
    }

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

    // ------------------------------------------------------------------
    // strictDate
    // ------------------------------------------------------------------

    #[Test]
    #[DataProvider('strictDateValidProvider')]
    public function it_parses_a_valid_date_to_midnight(string $input, string $expected): void
    {
        $d = strictDate($input);
        self::assertInstanceOf(DateTime::class, $d);
        self::assertSame($expected, $d->format('Y-m-d H:i:s'));
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function strictDateValidProvider(): array
    {
        return [
            // valid case preserved from legacy Supportive/Equivalence/Diverse StrictDateTests
            'legacy valid' => ['2026-01-15', '2026-01-15 00:00:00'],
            'T3.5 valid' => ['2026-03-15', '2026-03-15 00:00:00'],
        ];
    }

    #[Test]
    #[DataProvider('strictDateNullProvider')]
    public function it_returns_null_for_non_strict_date(mixed $input): void
    {
        self::assertNull(strictDate($input));
    }

    /**
     * @return array<string, array{mixed}>
     */
    public static function strictDateNullProvider(): array
    {
        return [
            'unpadded month' => ['2026-1-15'],
            'unpadded day' => ['2026-01-5'],
            'overflow day' => ['2026-02-30'],
            'overflow month' => ['2026-13-01'],
            'not a date' => ['not-a-date'],
            'short garbage' => ['abc'],
            'empty string' => [''],
            'datetime suffix' => ['2026-01-15 00:00:00'],
            'null' => [null],
            'array' => [['x']],
            'int' => [123],
        ];
    }

    // ------------------------------------------------------------------
    // dateFieldError
    // ------------------------------------------------------------------

    #[Test]
    #[DataProvider('dateFieldErrorProvider')]
    public function it_validates_date_fields(mixed $data, array $fields, ?string $expected): void
    {
        self::assertSame($expected, dateFieldError($data, $fields));
    }

    /**
     * @return array<string, array{mixed, list<string>, ?string}>
     */
    public static function dateFieldErrorProvider(): array
    {
        return [
            'overflow date' => [['start_date' => '2026-02-30'], ['start_date'], 'รูปแบบวันที่ไม่ถูกต้อง'],
            'valid date' => [['start_date' => '2026-03-01'], ['start_date'], null],
            'empty skipped' => [['start_date' => ''], ['start_date'], null],
            'null data' => [null, ['start_date'], 'รูปแบบข้อมูลไม่ถูกต้อง'],
            'string data' => ['x', ['start_date'], 'รูปแบบข้อมูลไม่ถูกต้อง'],
        ];
    }
}
