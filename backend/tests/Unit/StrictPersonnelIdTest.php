<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/diverse.php';
require_once __DIR__ . '/../../routes/supportive.php';

/**
 * U5 — strictPersonnelId: personnel_id จาก client ต้องเป็น int-like
 * (กัน array/bool/float ถูก intval กลบเงียบแล้ว bind ลง DB)
 */
final class StrictPersonnelIdTest extends TestCase
{
    #[Test]
    public function int_values_pass_through(): void
    {
        self::assertSame(1, strictPersonnelId(1));
        self::assertSame(0, strictPersonnelId(0));
        // ติดลบส่งผ่านให้ personnelExists ตอบ 404 ตามเดิม (ไม่เปลี่ยนเป็น 400)
        self::assertSame(-1, strictPersonnelId(-1));
    }

    #[Test]
    public function digit_strings_are_accepted(): void
    {
        self::assertSame(1, strictPersonnelId('1'));
        self::assertSame(7, strictPersonnelId('007'));
    }

    #[Test]
    public function non_int_like_values_are_rejected(): void
    {
        // ของเดิม intval กลบเงียบ: [1] → 1, true → 1, 1.9 → 1, ' 1' → 1
        self::assertNull(strictPersonnelId([1]));
        self::assertNull(strictPersonnelId([]));
        self::assertNull(strictPersonnelId(true));
        self::assertNull(strictPersonnelId(false));
        self::assertNull(strictPersonnelId(1.0));
        self::assertNull(strictPersonnelId(1.9));
        self::assertNull(strictPersonnelId('1.0'));
        self::assertNull(strictPersonnelId('-1'));
        self::assertNull(strictPersonnelId(' 1'));
        self::assertNull(strictPersonnelId('1 '));
        self::assertNull(strictPersonnelId('abc'));
        self::assertNull(strictPersonnelId(''));
        self::assertNull(strictPersonnelId(null));
    }

    #[Test]
    public function create_diverse_validates_personnel_id_before_insert(): void
    {
        $fn = self::functionSource(
            __DIR__ . '/../../routes/diverse.php',
            'function createDiverse',
            'function updateDiverse'
        );
        self::assertStringContainsString("strictPersonnelId(\$data['personnel_id'])", $fn);
        self::assertStringContainsString('personnelExists($pdo, $personnelId)', $fn);
        self::assertStringNotContainsString("intval(\$data['personnel_id'])", $fn);
    }

    #[Test]
    public function create_supportive_validates_personnel_id_before_insert(): void
    {
        $fn = self::functionSource(
            __DIR__ . '/../../routes/supportive.php',
            'function createSupportive',
            'function updateSupportive'
        );
        self::assertStringContainsString("strictPersonnelId(\$data['personnel_id'])", $fn);
        self::assertStringContainsString('personnelExists($pdo, $personnelId)', $fn);
        self::assertStringNotContainsString("intval(\$data['personnel_id'])", $fn);
    }

    private static function functionSource(string $file, string $startFn, string $endFn): string
    {
        $src = file_get_contents($file);
        self::assertIsString($src);
        $start = strpos($src, $startFn);
        self::assertNotFalse($start);
        $end = strpos($src, $endFn, $start);
        self::assertNotFalse($end);
        return substr($src, $start, $end - $start);
    }
}
