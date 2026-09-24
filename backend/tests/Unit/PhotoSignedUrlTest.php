<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

// ตั้ง JWT_SECRET ก่อน require config.php (pattern เดียวกับ JwtValidationTest)
putenv('JWT_SECRET=d1-photo-sign-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/photos.php';

/**
 * T-D1.1 — sign/verify signed URL รูป (pure function + handler, ไม่แตะ DB).
 */
final class PhotoSignedUrlTest extends TestCase
{
    protected function tearDown(): void
    {
        http_response_code(200);
    }

    #[Test]
    public function sign_returns_url_with_exp_and_sig(): void
    {
        $now = time();
        $url = signPhotoUrl('photo_abc123.jpg', $now);

        self::assertStringStartsWith('/uploads/photo_abc123.jpg?exp=', $url);
        parse_str((string) parse_url($url, PHP_URL_QUERY), $qs);
        self::assertSame($now + PHOTO_URL_TTL_SECONDS, (int) $qs['exp']);
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', (string) $qs['sig']);
    }

    #[Test]
    public function verify_accepts_fresh_signature(): void
    {
        $now = time();
        $url = signPhotoUrl('photo_abc123.jpg', $now);
        parse_str((string) parse_url($url, PHP_URL_QUERY), $qs);

        self::assertTrue(verifyPhotoUrl('photo_abc123.jpg', (string) $qs['exp'], (string) $qs['sig'], $now));
    }

    #[Test]
    public function verify_rejects_expired_tampered_and_malformed(): void
    {
        $now = time();
        $url = signPhotoUrl('photo_abc123.jpg', $now - PHOTO_URL_TTL_SECONDS - 1);
        parse_str((string) parse_url($url, PHP_URL_QUERY), $old);
        self::assertFalse(verifyPhotoUrl('photo_abc123.jpg', (string) $old['exp'], (string) $old['sig'], $now));

        $fresh = signPhotoUrl('photo_abc123.jpg', $now);
        parse_str((string) parse_url($fresh, PHP_URL_QUERY), $qs);
        // สลับไฟล์ / แก้ sig / exp ไม่ใช่ตัวเลข / ค่าว่าง — ตกหมด
        self::assertFalse(verifyPhotoUrl('photo_other.jpg', (string) $qs['exp'], (string) $qs['sig'], $now));
        self::assertFalse(verifyPhotoUrl('photo_abc123.jpg', (string) $qs['exp'], str_repeat('0', 64), $now));
        self::assertFalse(verifyPhotoUrl('photo_abc123.jpg', 'not-a-number', (string) $qs['sig'], $now));
        self::assertFalse(verifyPhotoUrl('photo_abc123.jpg', '', '', $now));
    }

    #[Test]
    public function handler_returns_signed_url_for_valid_name(): void
    {
        http_response_code(200);
        ob_start();
        handlePhotoSign(['file' => 'photo_abc123.jpg']);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(200, http_response_code());
        self::assertStringStartsWith('/uploads/photo_abc123.jpg?exp=', (string) ($body['url'] ?? ''));
    }

    #[Test]
    public function handler_rejects_bad_name_with_404(): void
    {
        http_response_code(200);
        ob_start();
        handlePhotoSign(['file' => '../../etc/passwd']);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(404, http_response_code());
        self::assertSame('Not found', $body['error'] ?? null);
    }
}
