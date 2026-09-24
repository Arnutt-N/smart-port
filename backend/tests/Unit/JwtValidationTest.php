<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

// ตั้ง JWT_SECRET ก่อน require config.php (≥32 ตัวอักษร — กันเคสไฟล์นี้โหลดก่อน)
// หมายเหตุ: sign ด้วย JWT_SECRET (const จริง) ไม่ใช่ค่านี้ — ยอมรับได้ทุก load order
putenv('JWT_SECRET=t10-jwt-guard-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../auth.php';

/**
 * T10 — JWT exp guard: generate/validate + เส้นทางปฏิเสธต้องเงียบ
 * (phpunit failOnWarning=true ทำให้ warning ใด ๆ ใน validateJWT กลายเป็น fail อัตโนมัติ)
 */
final class JwtValidationTest extends TestCase
{
    #[Test]
    public function fresh_token_validates_and_returns_user_data(): void
    {
        $issued = generateJWT(42, 'operator');

        $data = validateJWT($issued['token']);

        self::assertSame(42, $data['user_id'] ?? null);
        self::assertSame('operator', $data['role'] ?? null);
    }

    #[Test]
    public function expired_token_is_rejected(): void
    {
        $token = $this->craftToken(['exp' => time() - 10, 'data' => ['user_id' => 1, 'role' => 'admin']]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function missing_exp_is_rejected_silently(): void
    {
        $token = $this->craftToken(['data' => ['user_id' => 1, 'role' => 'admin']]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function non_numeric_exp_is_rejected_silently(): void
    {
        $token = $this->craftToken(['exp' => 'tomorrow', 'data' => ['user_id' => 1]]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function missing_data_is_rejected_silently(): void
    {
        $token = $this->craftToken(['exp' => time() + 3600]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function malformed_tokens_are_rejected_silently(): void
    {
        self::assertFalse(validateJWT('not-a-jwt'));
        self::assertFalse(validateJWT('a.b'));
        self::assertFalse(validateJWT(''));
        self::assertFalse(validateJWT(null));
        // payload ไม่ใช่ JSON — เดิม warning "array offset on null" (500 ใน api.php)
        $unsigned = base64url_encode((string) json_encode(['typ' => 'JWT', 'alg' => 'HS256']))
            . '.' . base64url_encode('%%%not-json%%%');
        $sig = base64url_encode(hash_hmac('sha256', $unsigned, JWT_SECRET, true));
        self::assertFalse(validateJWT($unsigned . '.' . $sig));
    }

    #[Test]
    public function tampered_signature_is_rejected(): void
    {
        $issued = generateJWT(7, 'viewer');
        $parts = explode('.', $issued['token']);
        $parts[2] = strrev($parts[2]);

        self::assertFalse(validateJWT(implode('.', $parts)));
    }

    #[Test]
    public function non_hs256_alg_is_rejected(): void
    {
        $issued = generateJWT(7, 'viewer');
        $parts = explode('.', $issued['token']);
        $header = json_decode(base64url_decode($parts[0]), true);
        $header['alg'] = 'none';
        $parts[0] = base64url_encode((string) json_encode($header));

        self::assertFalse(validateJWT(implode('.', $parts)));
    }

    /**
     * @param array<string,mixed> $payload
     */
    private function craftToken(array $payload): string
    {
        $head = base64url_encode((string) json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
        $body = base64url_encode((string) json_encode($payload));
        $sig = base64url_encode(hash_hmac('sha256', $head . '.' . $body, JWT_SECRET, true));
        return $head . '.' . $body . '.' . $sig;
    }
}
