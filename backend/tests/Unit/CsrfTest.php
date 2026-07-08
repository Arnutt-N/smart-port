<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../middleware/csrf.php';

/**
 * Unit tests สำหรับ generateCSRFToken()/validateCSRFToken() ใน backend/middleware/csrf.php
 * — pure functions, ไม่ต้อง DB/JWT (requireCSRFToken() ที่ exit() เมื่อไม่ผ่าน ไม่ครอบในไฟล์นี้
 * เพราะต้อง mock getAuthenticatedUser()/DB และ exit() ทำให้ทดสอบ control-flow ตรงๆ ไม่ได้)
 */
final class CsrfTest extends TestCase
{
    #[Test]
    public function generated_token_is_64_char_hex_string(): void
    {
        $token = generateCSRFToken();

        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $token);
    }

    #[Test]
    public function generated_tokens_are_not_predictable_or_repeated(): void
    {
        $tokens = array_map(fn() => generateCSRFToken(), range(1, 20));

        // สุ่มจาก random_bytes(32) — 20 ครั้งไม่ควรชนกันเลย
        self::assertCount(20, array_unique($tokens));
    }

    #[Test]
    public function matching_tokens_are_valid(): void
    {
        $token = generateCSRFToken();

        self::assertTrue(validateCSRFToken($token, $token));
    }

    #[Test]
    #[DataProvider('mismatchProvider')]
    public function mismatched_or_empty_tokens_are_invalid(string $token, string $expected): void
    {
        self::assertFalse(validateCSRFToken($token, $expected));
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function mismatchProvider(): array
    {
        $real = str_repeat('a', 64);

        return [
            'completely different token' => [str_repeat('b', 64), $real],
            'empty submitted token'      => ['', $real],
            'empty expected token'       => [$real, ''],
            'both empty'                 => ['', ''],
            'case mismatch'              => [strtoupper($real), $real],
            'truncated token'            => [substr($real, 0, 63), $real],
        ];
    }
}
