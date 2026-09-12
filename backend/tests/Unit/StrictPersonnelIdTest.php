<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/diverse.php';
require_once __DIR__ . '/../../routes/supportive.php';
require_once __DIR__ . '/../../routes/equivalence.php';
require_once __DIR__ . '/../../routes/multiplier.php';
require_once __DIR__ . '/../../routes/probation.php';
require_once __DIR__ . '/../../routes/awards.php';
require_once __DIR__ . '/../../routes/decorations.php';

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

    // ------------------------------------------------------------------
    // U5 follow-up: routes ที่เหลือ (equivalence/multiplier/probation/awards/decorations)
    // ------------------------------------------------------------------

    #[Test]
    public function award_payload_normalizes_personnel_id(): void
    {
        [$valid, $err] = validateAwardPayload(['personnel_id' => [1], 'award_name' => 'x'], true);
        self::assertNull($valid);
        self::assertSame('รูปแบบข้อมูลไม่ถูกต้อง', $err);

        [$valid, $err] = validateAwardPayload(['personnel_id' => '7', 'award_name' => 'x'], true);
        self::assertNull($err);
        self::assertSame(7, $valid['personnel_id']);

        // ไม่ส่งมา (update) → ไม่แตะ
        [$valid, $err] = validateAwardPayload(['award_name' => 'x'], false);
        self::assertNull($err);
        self::assertArrayNotHasKey('personnel_id', $valid);
    }

    #[Test]
    public function decoration_payload_normalizes_personnel_id(): void
    {
        [$valid, $err] = validateDecorationPayload(['personnel_id' => true, 'decoration_name' => 'x'], true);
        self::assertNull($valid);
        self::assertSame('รูปแบบข้อมูลไม่ถูกต้อง', $err);

        [$valid, $err] = validateDecorationPayload(
            ['personnel_id' => 3, 'decoration_name' => 'x', 'received_year' => 2565],
            true
        );
        self::assertNull($err);
        self::assertSame(3, $valid['personnel_id']);
    }

    #[Test]
    public function remaining_creates_validate_personnel_id_before_insert(): void
    {
        $cases = [
            [__DIR__ . '/../../routes/equivalence.php', 'function createEquivalence', 'function updateEquivalence'],
            [__DIR__ . '/../../routes/multiplier.php', 'function createMultiplier', 'function updateMultiplier'],
            [__DIR__ . '/../../routes/probation.php', 'function createProbationEnrollment', "\nfunction "],
        ];
        foreach ($cases as [$file, $startFn, $endFn]) {
            $src = file_get_contents($file);
            self::assertIsString($src);
            $start = strpos($src, $startFn);
            self::assertNotFalse($start, $file);
            if (str_starts_with($endFn, "\n")) {
                $end = strpos($src, $endFn, $start + 10);
            } else {
                $end = strpos($src, $endFn, $start);
            }
            self::assertNotFalse($end, $file);
            $fn = substr($src, $start, $end - $start);
            self::assertStringContainsString('strictPersonnelId(', $fn, $file);
            self::assertStringNotContainsString("intval(\$data['personnel_id'])", $fn, $file);
        }
    }

    #[Test]
    public function update_multiplier_validates_personnel_id_override(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/multiplier.php');
        self::assertIsString($src);
        $start = strpos($src, 'function updateMultiplier');
        self::assertNotFalse($start);
        $end = strpos($src, "\nfunction ", $start + 10);
        $fn = $end === false ? substr($src, $start) : substr($src, $start, $end - $start);
        self::assertStringContainsString('strictPersonnelId($data', $fn);
    }

    #[Test]
    public function award_and_decoration_creates_use_validated_id(): void
    {
        foreach (['awards', 'decorations'] as $route) {
            $src = file_get_contents(__DIR__ . "/../../routes/{$route}.php");
            self::assertIsString($src);
            self::assertStringContainsString('strictPersonnelId($data', $src, $route);
            $start = strpos($src, 'function create');
            self::assertNotFalse($start, $route);
            $end = strpos($src, 'function update', $start);
            self::assertNotFalse($end, $route);
            $fn = substr($src, $start, $end - $start);
            self::assertStringNotContainsString("intval(\$valid['personnel_id'])", $fn, $route);
        }
    }

    #[Test]
    public function area_id_uses_same_int_like_contract(): void
    {
        // R4: area_multiplier_id ใช้ strictPersonnelId ตัวเดิม (ไม่สร้าง helper ใหม่)
        self::assertNull(strictPersonnelId([2]));
        self::assertNull(strictPersonnelId(2.5));
        self::assertNull(strictPersonnelId(true));
        self::assertSame(3, strictPersonnelId('3'));
        self::assertSame(3, strictPersonnelId(3));
    }

    #[Test]
    public function multiplier_validates_area_id_before_compute(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/multiplier.php');
        self::assertIsString($src);

        $start = strpos($src, 'function createMultiplier');
        self::assertNotFalse($start);
        $end = strpos($src, 'function updateMultiplier', $start);
        self::assertNotFalse($end);
        $create = substr($src, $start, $end - $start);
        self::assertStringContainsString("strictPersonnelId(\$data['area_multiplier_id'])", $create);
        self::assertStringNotContainsString("intval(\$data['area_multiplier_id'])", $create);

        $update = substr($src, $end);
        self::assertStringContainsString("strictPersonnelId(\$data['area_multiplier_id']", $update);
        self::assertStringNotContainsString("intval(\$data['area_multiplier_id'])", $update);
    }

    #[Test]
    public function photos_upload_validates_personnel_id(): void
    {
        $src = file_get_contents(__DIR__ . '/../../api.php');
        self::assertIsString($src);
        $start = strpos($src, "case 'photos':");
        self::assertNotFalse($start);
        $end = strpos($src, 'function ', $start);
        $fn = $end === false ? substr($src, $start) : substr($src, $start, $end - $start);
        self::assertStringContainsString('strictPersonnelId($_POST', $fn);
        self::assertStringNotContainsString("intval(\$_POST['personnel_id'])", $fn);
    }
}
