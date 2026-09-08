<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/multiplier.php';

/**
 * N10 — เขียนพื้นที่พิเศษต้องเป็น admin/superadmin (UI requiresAdmin)
 * operator มี create:multiplier สำหรับรายการทวีคูณ แต่ไม่ใช่ master พื้นที่
 */
final class MultiplierAreaWriteAuthzTest extends TestCase
{
    /** @return array<string, array{string, bool}> */
    public static function roleProvider(): array
    {
        return [
            'admin' => ['admin', true],
            'superadmin' => ['superadmin', true],
            'operator' => ['operator', false],
            'viewer' => ['viewer', false],
            'empty' => ['', false],
        ];
    }

    #[Test]
    #[DataProvider('roleProvider')]
    public function write_allowed_only_for_admin_roles(string $role, bool $allowed): void
    {
        self::assertSame($allowed, multiplierAreaWriteAllowed(['role' => $role]));
    }

    #[Test]
    public function null_user_is_denied(): void
    {
        self::assertFalse(multiplierAreaWriteAllowed(null));
    }

    #[Test]
    public function handle_multiplier_gates_area_writes(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/multiplier.php');
        self::assertIsString($src);
        $start = strpos($src, 'function handleMultiplier');
        self::assertNotFalse($start);
        $end = strpos($src, 'function getMultiplierAreas', $start);
        self::assertNotFalse($end);
        $fn = substr($src, $start, $end - $start);
        self::assertStringContainsString('multiplierAreaWriteAllowed(', $fn);
        self::assertLessThan(
            strpos($fn, 'createMultiplierArea('),
            strpos($fn, 'multiplierAreaWriteAllowed(')
        );
        self::assertLessThan(
            strpos($fn, 'setMultiplierAreaStatus('),
            strpos($fn, 'multiplierAreaWriteAllowed(')
        );
    }
}
