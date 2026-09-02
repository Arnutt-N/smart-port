<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

// ตั้ง JWT_SECRET ก่อน require config.php (≥32 ตัวอักษร — config.php ปฏิเสธค่าที่สั้นกว่า)
putenv('JWT_SECRET=login-lockout-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../middleware/rate_limit.php';
require_once __DIR__ . '/../../routes/auth.php';

/**
 * F3/F4: lockout ต่อ IP (รวมทุก username) + prune refresh token หลัง login สำเร็จ
 *
 * **test isolation (บังคับ)**: ตั้ง XFF/REMOTE_ADDR เฉพาะตัวต่อเคส (จัดการ $_SERVER
 * ตรง ๆ ตาม pattern ของ PublicRateLimitTest แล้ว unset ใน tearDown) และ
 * DELETE FROM login_attempts ใน setUp — ไม่งั้นทุกเคสแชร์ IP เดียวบน DB ถาวร
 * และ rerun ภายใน 15 นาทีจะเริ่มที่ counter ค้าง ทำให้ assertion เอง flaky
 *
 * ต้องมี MySQL (skip เมื่อต่อไม่ได้ เหมือน integration suite) เพราะ lockout นับจากตารางจริง
 */
final class LoginLockoutTest extends TestCase
{
    private const TEST_IP = '203.0.113.77';

    private static ?PDO $pdo = null;
    private int $userId = 0;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }

        foreach (['users', 'login_attempts', 'refresh_tokens'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table} — รัน migration ก่อน");
            }
        }

        // isolation: เคลียร์ counter แล้วตั้ง IP ของเคสนี้ (publicClientIp อ่าน last hop ของ XFF)
        self::$pdo->exec('DELETE FROM login_attempts');
        $_SERVER['REMOTE_ADDR'] = '10.9.9.9';
        $_SERVER['HTTP_X_FORWARDED_FOR'] = '198.51.100.1, ' . self::TEST_IP;
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        if (self::$pdo !== null) {
            self::$pdo->prepare('DELETE FROM login_attempts WHERE ip_address = ?')
                ->execute([self::TEST_IP]);
            if ($this->userId !== 0) {
                self::$pdo->prepare('DELETE FROM refresh_tokens WHERE user_id = ?')->execute([$this->userId]);
                self::$pdo->prepare('DELETE FROM users WHERE user_id = ?')->execute([$this->userId]);
                $this->userId = 0;
            }
        }
        unset($_SERVER['HTTP_X_FORWARDED_FOR'], $_SERVER['REMOTE_ADDR']);
    }

    /**
     * @return array<string,mixed>
     */
    private function login(string $username, string $password = 'wrong-password'): array
    {
        ob_start();
        loginUser(self::$pdo, ['username' => $username, 'password' => $password]);
        return json_decode((string) ob_get_clean(), true) ?? [];
    }

    #[Test]
    public function six_failures_on_the_same_username_are_locked_out(): void
    {
        // เกณฑ์เดิมต่อ username (5 ครั้ง) — ครั้งที่ 6 ต้อง 429
        for ($i = 0; $i < 5; $i++) {
            $this->login('lockout-user');
            self::assertSame(401, http_response_code(), "ครั้งที่ " . ($i + 1) . " ยังต้องตอบ 401 ปกติ");
            http_response_code(200);
        }

        $response = $this->login('lockout-user');
        self::assertSame(429, http_response_code());
        self::assertArrayHasKey('error', $response);
    }

    #[Test]
    public function twenty_one_failures_across_usernames_from_one_ip_are_locked_out(): void
    {
        // 20 ครั้งแรกคนละ username (ไม่โดนเกณฑ์ต่อ username) ต้องยังตอบ 401 ปกติ
        for ($i = 0; $i < 20; $i++) {
            $this->login('spread-user-' . $i);
            self::assertSame(401, http_response_code(), "ครั้งที่ " . ($i + 1) . " ยังต้องตอบ 401 ปกติ");
            http_response_code(200);
        }

        // ครั้งที่ 21 จาก IP เดียวกัน = รวมครบ 20 แล้ว ต้อง 429
        // (บนโค้ดเก่าที่นับเฉพาะต่อ username เทสนี้ fail เพราะไม่มี lockout ต่อ IP)
        $response = $this->login('spread-user-20');
        self::assertSame(429, http_response_code());
        self::assertArrayHasKey('error', $response);
    }

    #[Test]
    public function successful_login_prunes_expired_and_stale_revoked_refresh_tokens(): void
    {
        self::$pdo->prepare(
            'INSERT INTO users
                (username, password_hash, full_name, role, is_active, must_change_password)
             VALUES (?, ?, ?, ?, 1, 0)'
        )->execute([
            'lockout-prune-user',
            password_hash('correct-password', PASSWORD_DEFAULT),
            'Login Lockout Test',
            'operator',
        ]);
        $this->userId = (int) self::$pdo->lastInsertId();

        // 3 ใบ: หมดอายุแล้ว / ถูก revoke นานเกิน 30 วัน / ยังใช้ได้ — prune ต้องลบเฉพาะ 2 ใบแรก
        $insert = self::$pdo->prepare(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked_at)
             VALUES (?, ?, ?, ?)'
        );
        $insert->execute([
            $this->userId,
            hashRefreshToken('expired-raw-token'),
            date('Y-m-d H:i:s', time() - 60),
            null,
        ]);
        $insert->execute([
            $this->userId,
            hashRefreshToken('stale-revoked-raw-token'),
            date('Y-m-d H:i:s', time() + 3600),
            date('Y-m-d H:i:s', time() - 31 * 86400),
        ]);
        $insert->execute([
            $this->userId,
            hashRefreshToken('live-raw-token'),
            date('Y-m-d H:i:s', time() + 3600),
            null,
        ]);

        $response = $this->login('lockout-prune-user', 'correct-password');
        self::assertSame(200, http_response_code());
        self::assertArrayHasKey('token', $response);

        $stmt = self::$pdo->prepare('SELECT token_hash FROM refresh_tokens WHERE user_id = ?');
        $stmt->execute([$this->userId]);
        $remaining = $stmt->fetchAll(PDO::FETCH_COLUMN);

        self::assertNotContains(
            hashRefreshToken('expired-raw-token'),
            $remaining,
            'token หมดอายุแล้วต้องถูก prune'
        );
        self::assertNotContains(
            hashRefreshToken('stale-revoked-raw-token'),
            $remaining,
            'token ที่ถูก revoke เกิน 30 วันต้องถูก prune'
        );
        self::assertContains(
            hashRefreshToken('live-raw-token'),
            $remaining,
            'token ที่ยังใช้ได้ต้องรอดจาก prune'
        );
    }
}
