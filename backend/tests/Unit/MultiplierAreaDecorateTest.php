<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/multiplier.php';

/**
 * Unit tests สำหรับ decorateAreaRow() — pure function, ไม่ใช้ DB
 * โฟกัส source_pending: "รอเอกสาร" ต้องครอบคลุมทั้ง marker SOURCE_PENDING
 * และกรณีไม่มี legal_reference เลย (NULL/ว่าง) ตามที่ฟอร์มสัญญาไว้ว่า
 * "เว้นว่างจะติดสถานะรอเอกสาร"
 */
final class MultiplierAreaDecorateTest extends TestCase
{
    private static function baseRow(): array
    {
        return [
            'area_multiplier_id' => '16',
            'province' => 'ทดสอบ-เชียงใหม่',
            'district' => null,
            'basis_type' => 'TEST_BROWSER',
            'multiplier_ratio' => '300.00',
            'effective_start_date' => '2004-01-26',
            'effective_end_date' => null,
            'legal_reference' => null,
            'source_reference' => null,
            'is_active' => '1',
        ];
    }

    /**
     * @return array<string, array{mixed, bool}>  [legal_reference, source_pending ที่คาดหวัง]
     */
    public static function legalReferenceProvider(): array
    {
        return [
            'NULL = ไม่มีเอกสาร → รอเอกสาร'            => [null, true],
            'สตริงว่าง → รอเอกสาร'                     => ['', true],
            'ช่องว่างล้วน → รอเอกสาร'                  => ['   ', true],
            'marker SOURCE_PENDING → รอเอกสาร'         => ['SOURCE_PENDING: user-approved development seed', true],
            'มีเอกสารจริง → ยืนยันแล้ว'                => ['ประกาศ กห. ลง 26 ม.ค. 2547', false],
        ];
    }

    #[Test]
    #[DataProvider('legalReferenceProvider')]
    public function it_flags_source_pending_from_legal_reference(mixed $legalReference, bool $expectedPending): void
    {
        $row = self::baseRow();
        $row['legal_reference'] = $legalReference;

        decorateAreaRow($row);

        self::assertSame($expectedPending, $row['source_pending']);
    }

    #[Test]
    public function it_labels_whole_province_when_district_is_null(): void
    {
        $row = self::baseRow();

        decorateAreaRow($row);

        self::assertSame('ทดสอบ-เชียงใหม่ / ทั้งจังหวัด', $row['area_label']);
        self::assertSame(300.0, $row['multiplier_ratio']);
        self::assertSame(1, $row['is_active']);
        self::assertNull($row['effective_end_date_thai']);
    }
}
