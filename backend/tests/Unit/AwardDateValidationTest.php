<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/awards.php';

/** N17 — awarded_date ที่ส่งมาต้องเป็น Y-m-d เข้ม หรือว่าง (null) */
final class AwardDateValidationTest extends TestCase
{
    #[Test]
    public function malformed_awarded_date_is_rejected(): void
    {
        [, $err] = validateAwardPayload([
            'servant_id' => 1,
            'award_name' => 'x',
            'awarded_date' => 'not-a-date',
        ], true);
        self::assertSame('รูปแบบวันที่ไม่ถูกต้อง', $err);
    }

    #[Test]
    public function overflow_awarded_date_is_rejected(): void
    {
        [, $err] = validateAwardPayload([
            'servant_id' => 1,
            'award_name' => 'x',
            'awarded_date' => '2026-02-30',
        ], true);
        self::assertSame('รูปแบบวันที่ไม่ถูกต้อง', $err);
    }

    #[Test]
    public function blank_awarded_date_is_allowed(): void
    {
        [, $err] = validateAwardPayload([
            'servant_id' => 1,
            'award_name' => 'x',
            'awarded_date' => '',
        ], true);
        self::assertNull($err);
    }

    #[Test]
    public function canonical_awarded_date_is_allowed(): void
    {
        [, $err] = validateAwardPayload([
            'servant_id' => 1,
            'award_name' => 'x',
            'awarded_date' => '2024-06-01',
        ], true);
        self::assertNull($err);
    }
}
