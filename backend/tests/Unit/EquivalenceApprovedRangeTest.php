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
}
