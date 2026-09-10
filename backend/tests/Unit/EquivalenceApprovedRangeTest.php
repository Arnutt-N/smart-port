<?php

declare(strict_types=1);

namespace Tests\Unit;

use InvalidArgumentException;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/equivalence.php';

final class EquivalenceApprovedRangeTest extends TestCase
{
    #[Test]
    public function inverted_range_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น');
        approvedRangeTotalDays('2026-12-31', '2026-01-01');
    }

    #[Test]
    public function inclusive_january_is_thirty_one_days(): void
    {
        self::assertSame(31, approvedRangeTotalDays('2026-01-01', '2026-01-31'));
    }

    #[Test]
    public function malformed_date_throws_invalid_format(): void
    {
        // U3: strict parse — วันที่หลวมต้อง 400 (InvalidArgumentException) ไม่ใช่ TypeError 500
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('รูปแบบวันที่ไม่ถูกต้อง');
        approvedRangeTotalDays('2026-1-15', '2026-01-31');
    }
}
