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
 * T10/T6 — JWT guard: generate/validate + strict `now < claim` ทั้ง exp และ session_exp
 * (phpunit failOnWarning=true ทำให้ warning ใด ๆ ใน validateJWT กลายเป็น fail อัตโนมัติ)
 */
final class JwtValidationTest extends TestCase
{
    #[Test]
    public function fresh_token_validates_and_returns_user_data(): void
    {
        $issued = generateJWT(42, 'operator', time() + 3600);

        $data = validateJWT($issued['token']);

        self::assertSame(42, $data['user_id'] ?? null);
        self::assertSame('operator', $data['role'] ?? null);
    }

    #[Test]
    public function generateJWT_requires_session_deadline(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        generateJWT(1, 'admin');
    }

    #[Test]
    public function generateJWT_bounds_exp_at_session_deadline(): void
    {
        // session สิ้นสุดใน 30 วินาที → exp ต้องไม่เกิน deadline (ไม่ใช่ time()+3600)
        $deadline = time() + 30;
        $issued = generateJWT(7, 'viewer', $deadline);
        $payload = json_decode(base64url_decode(explode('.', $issued['token'])[1]), true);

        self::assertSame($deadline, $payload['session_exp']);
        self::assertLessThanOrEqual($deadline, $payload['exp']);
    }

    #[Test]
    public function expired_token_is_rejected(): void
    {
        $token = $this->craftToken([
            'exp' => time() - 10,
            'session_exp' => time() + 3600,
            'data' => ['user_id' => 1, 'role' => 'admin'],
        ]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function missing_exp_is_rejected_silently(): void
    {
        $token = $this->craftToken([
            'session_exp' => time() + 3600,
            'data' => ['user_id' => 1, 'role' => 'admin'],
        ]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function non_integer_exp_is_rejected_silently(): void
    {
        $token = $this->craftToken([
            'exp' => 'tomorrow',
            'session_exp' => time() + 3600,
            'data' => ['user_id' => 1, 'role' => 'admin'],
        ]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function exp_exactly_now_is_rejected(): void
    {
        // strict `now < exp` — หมดอายุตรงวินาที = หมดอายุ
        $token = $this->craftToken([
            'exp' => time(),
            'session_exp' => time() + 3600,
            'data' => ['user_id' => 1, 'role' => 'admin'],
        ]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function exp_one_second_in_future_is_accepted(): void
    {
        $token = $this->craftToken([
            'exp' => time() + 1,
            'session_exp' => time() + 3600,
            'data' => ['user_id' => 1, 'role' => 'admin'],
        ]);

        self::assertNotFalse(validateJWT($token));
    }

    #[Test]
    public function legacy_token_without_session_exp_is_rejected(): void
    {
        // JWT ก่อน D6 ไม่มี claim นี้ — ใช้ไม่ได้หลัง rollout (บังคับ re-login)
        $token = $this->craftToken([
            'exp' => time() + 3600,
            'data' => ['user_id' => 1, 'role' => 'admin'],
        ]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function non_integer_session_exp_is_rejected_silently(): void
    {
        $token = $this->craftToken([
            'exp' => time() + 3600,
            'session_exp' => 'soon',
            'data' => ['user_id' => 1, 'role' => 'admin'],
        ]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function session_exp_exactly_now_is_rejected(): void
    {
        $token = $this->craftToken([
            'exp' => time() + 60,
            'session_exp' => time(),
            'data' => ['user_id' => 1, 'role' => 'admin'],
        ]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function session_exp_in_the_past_is_rejected_even_with_valid_exp(): void
    {
        $token = $this->craftToken([
            'exp' => time() + 60,
            'session_exp' => time() - 1,
            'data' => ['user_id' => 1, 'role' => 'admin'],
        ]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function future_in_cap_session_exp_with_matching_exp_is_accepted(): void
    {
        $token = $this->craftToken([
            'exp' => time() + 60,
            'session_exp' => time() + 120,
            'data' => ['user_id' => 1, 'role' => 'admin'],
        ]);

        self::assertNotFalse(validateJWT($token));
    }

    #[Test]
    public function exp_beyond_session_deadline_is_rejected(): void
    {
        // exp ใหญ่กว่า session_exp = token อยู่พ้น session cap → ปฏิเสธ
        $token = $this->craftToken([
            'exp' => time() + 3600,
            'session_exp' => time() + 60,
            'data' => ['user_id' => 1, 'role' => 'admin'],
        ]);

        self::assertFalse(validateJWT($token));
    }

    #[Test]
    public function missing_data_is_rejected_silently(): void
    {
        $token = $this->craftToken([
            'exp' => time() + 3600,
            'session_exp' => time() + 7200,
        ]);

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
        $issued = generateJWT(7, 'viewer', time() + 3600);
        $parts = explode('.', $issued['token']);
        $parts[2] = strrev($parts[2]);

        self::assertFalse(validateJWT(implode('.', $parts)));
    }

    #[Test]
    public function non_hs256_alg_is_rejected(): void
    {
        $issued = generateJWT(7, 'viewer', time() + 3600);
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
