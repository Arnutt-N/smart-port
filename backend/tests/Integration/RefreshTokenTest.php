<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

putenv('JWT_SECRET=integration-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../routes/auth.php';

/**
 * Integration tests for the refresh-token flow (rotation, expiry, reuse detection, logout).
 * Skips when MySQL or the refresh_tokens table is unavailable.
 */
final class RefreshTokenTest extends TestCase
{
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

        foreach (['users', 'refresh_tokens'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table} — รัน migration 18-refresh-tokens.sql");
            }
        }

        $username = 'refresh-' . bin2hex(random_bytes(5));
        self::$pdo->prepare(
            'INSERT INTO users
                (username, password_hash, full_name, role, is_active, must_change_password)
             VALUES (?, ?, ?, ?, 1, 0)'
        )->execute([
            $username,
            password_hash('test-only-password', PASSWORD_DEFAULT),
            'Refresh Token Test',
            'operator',
        ]);
        $this->userId = (int) self::$pdo->lastInsertId();
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['__capture_cookies']);
        if (self::$pdo === null || $this->userId === 0) {
            return;
        }
        self::$pdo->prepare('DELETE FROM refresh_tokens WHERE user_id = ?')->execute([$this->userId]);
        self::$pdo->prepare('DELETE FROM users WHERE user_id = ?')->execute([$this->userId]);
    }

    /**
     * @return array<string,mixed>
     */
    private function callRefresh(string $rawToken): array
    {
        ob_start();
        refreshSession(self::$pdo, ['refresh_token' => $rawToken]);
        return json_decode((string) ob_get_clean(), true) ?? [];
    }

    /**
     * สร้างแถว refresh fixture — remember/expiry กำหนดเอง (ค่า default = session mode 12 ชม.)
     */
    private function issueFixture(int $userId, bool $remember = false, ?string $expiresAt = null): string
    {
        return issueRefreshToken(
            self::$pdo,
            $userId,
            $remember,
            $expiresAt ?? date('Y-m-d H:i:s', time() + ($remember ? REFRESH_TOKEN_TTL_SECONDS : SESSION_ABS_TTL_SECONDS))
        );
    }

    #[Test]
    public function valid_token_is_rotated_and_returns_new_tokens(): void
    {
        $raw = $this->issueFixture($this->userId);
        $response = $this->callRefresh($raw);

        self::assertSame(200, http_response_code());
        self::assertArrayHasKey('token', $response);
        self::assertArrayHasKey('csrf_token', $response);
        self::assertArrayHasKey('refresh_token', $response);
        self::assertNotSame($raw, $response['refresh_token']);
        self::assertSame($this->userId, $response['user']['id'] ?? null);

        $stmt = self::$pdo->prepare(
            'SELECT token_hash, revoked_at FROM refresh_tokens WHERE user_id = ?'
        );
        $stmt->execute([$this->userId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        self::assertCount(2, $rows, 'rotation should leave the old (revoked) + new (active) token');

        $revokedByHash = [];
        foreach ($rows as $row) {
            $revokedByHash[$row['token_hash']] = $row['revoked_at'];
        }

        $oldHash = hashRefreshToken($raw);
        $newHash = hashRefreshToken($response['refresh_token']);
        self::assertArrayHasKey($oldHash, $revokedByHash);
        self::assertArrayHasKey($newHash, $revokedByHash);
        self::assertNotNull($revokedByHash[$oldHash], 'old token must be revoked');
        self::assertNull($revokedByHash[$newHash], 'new token must be active');
    }

    #[Test]
    public function expired_token_is_rejected(): void
    {
        $raw = generateRefreshToken();
        self::$pdo->prepare(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
        )->execute([$this->userId, hashRefreshToken($raw), date('Y-m-d H:i:s', time() - 60)]);

        $response = $this->callRefresh($raw);

        self::assertSame(401, http_response_code());
        self::assertArrayHasKey('error', $response);
    }

    #[Test]
    public function unknown_token_is_rejected_and_clears_cookies(): void
    {
        $GLOBALS['__capture_cookies'] = [];
        http_response_code(200);
        $response = $this->callRefresh(generateRefreshToken());

        self::assertSame(401, http_response_code());
        self::assertArrayHasKey('error', $response);
        // D6 terminal: ไม่พบแถว → clear คู่ cookies
        self::assertCount(2, $GLOBALS['__capture_cookies']);
        foreach ($GLOBALS['__capture_cookies'] as $cookie) {
            self::assertSame('', $cookie['value']);
        }
    }

    #[Test]
    public function refresh_exactly_at_expiry_is_rejected(): void
    {
        // strict `expires_at <= now` — ตรงวินาทีหมดอายุ = หมดอายุ (เคสคู่กับ JWT exp=now)
        $raw = generateRefreshToken();
        self::$pdo->prepare(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
        )->execute([$this->userId, hashRefreshToken($raw), date('Y-m-d H:i:s', time())]);

        $GLOBALS['__capture_cookies'] = [];
        http_response_code(200);
        $response = $this->callRefresh($raw);

        self::assertSame(401, http_response_code());
        self::assertArrayHasKey('error', $response);
        self::assertCount(2, $GLOBALS['__capture_cookies'], 'expired terminal ต้อง clear คู่ cookies');
    }

    #[Test]
    public function inactive_user_refresh_is_rejected_and_clears_cookies(): void
    {
        $raw = $this->issueFixture($this->userId);
        self::$pdo->prepare('UPDATE users SET is_active = 0 WHERE user_id = ?')
            ->execute([$this->userId]);

        $GLOBALS['__capture_cookies'] = [];
        http_response_code(200);
        $response = $this->callRefresh($raw);

        self::assertSame(401, http_response_code());
        self::assertArrayHasKey('error', $response);
        self::assertCount(2, $GLOBALS['__capture_cookies'], 'user ปิดใช้ → clear คู่ cookies');
        // แถวของตัวเองถูก revoke แล้ว
        $stmt = self::$pdo->prepare('SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?');
        $stmt->execute([hashRefreshToken($raw)]);
        self::assertNotNull($stmt->fetchColumn());

        self::$pdo->prepare('UPDATE users SET is_active = 1 WHERE user_id = ?')
            ->execute([$this->userId]);
    }

    private function countActiveTokens(): int
    {
        $stmt = self::$pdo->prepare(
            'SELECT COUNT(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL'
        );
        $stmt->execute([$this->userId]);
        return (int) $stmt->fetchColumn();
    }

    #[Test]
    public function reusing_a_just_revoked_token_is_rejected_without_killing_the_session(): void
    {
        // ภายใน grace window (10 วิ) ถือว่าเป็น race ระหว่าง browser tab ไม่ใช่การขโมย
        // จึงตอบ 401 ใบนั้นเฉย ๆ แต่ต้องไม่เตะผู้ใช้ออกจากระบบ (routes/auth.php)
        $raw = $this->issueFixture($this->userId);

        $this->callRefresh($raw);
        self::assertSame(200, http_response_code());

        http_response_code(200);
        $response = $this->callRefresh($raw);

        self::assertSame(401, http_response_code());
        self::assertArrayHasKey('error', $response);
        self::assertSame(1, $this->countActiveTokens(), 'ใบที่เพิ่ง rotate มาต้องยังใช้ได้');
    }

    #[Test]
    public function reusing_a_long_revoked_token_revokes_all_user_tokens(): void
    {
        $raw = $this->issueFixture($this->userId);

        // ครั้งแรก: rotation สำเร็จ -> raw ถูก revoke, มี token ใหม่ที่ active
        $this->callRefresh($raw);
        self::assertSame(200, http_response_code());
        self::assertSame(1, $this->countActiveTokens());

        // ดัน revoked_at ให้พ้น grace window แทนการ sleep จริง — เทสจึงเร็วและ deterministic
        self::$pdo->prepare(
            'UPDATE refresh_tokens SET revoked_at = DATE_SUB(NOW(), INTERVAL 60 SECOND)
             WHERE token_hash = ? AND user_id = ?'
        )->execute([hashRefreshToken($raw), $this->userId]);

        // นำ raw ที่ถูก revoke มานานแล้วมาใช้ซ้ำ = สงสัยถูกขโมย
        http_response_code(200);
        $GLOBALS['__capture_cookies'] = [];
        $response = $this->callRefresh($raw);
        self::assertSame(401, http_response_code());
        self::assertArrayHasKey('error', $response);

        // token ทุกใบของ user ต้องถูกเพิกถอน (รวมใบใหม่ที่เพิ่งออก)
        self::assertSame(0, $this->countActiveTokens());
        // reuse เกิน grace = terminal → clear คู่ cookies
        self::assertCount(2, $GLOBALS['__capture_cookies']);
    }

    #[Test]
    public function grace_boundary_10s_keeps_session_11s_kills_all(): void
    {
        // ขอบ grace 10 วินาที: 10 = ยังเป็น race (ไม่ kill), 11 = reuse (kill-all + clear)
        $raw = $this->issueFixture($this->userId);
        $this->callRefresh($raw); // rotation → raw revoked, มี active ใหม่ 1 แถว
        self::assertSame(1, $this->countActiveTokens());

        // อายุ 10 วินาที = ขอบในสุดของ grace (<= 10)
        self::$pdo->prepare(
            'UPDATE refresh_tokens SET revoked_at = DATE_SUB(NOW(), INTERVAL 10 SECOND)
             WHERE token_hash = ?'
        )->execute([hashRefreshToken($raw)]);
        http_response_code(200);
        $GLOBALS['__capture_cookies'] = [];
        $this->callRefresh($raw);
        self::assertSame(401, http_response_code(), 'อายุ 10 วิ = ยังอยู่ใน grace');
        self::assertCount(0, $GLOBALS['__capture_cookies'], 'ใน grace ห้ามมี Set-Cookie');
        self::assertSame(1, $this->countActiveTokens(), 'ใน grace ห้าม kill-all');

        // อายุ 11 วินาที = พ้น grace
        self::$pdo->prepare(
            'UPDATE refresh_tokens SET revoked_at = DATE_SUB(NOW(), INTERVAL 11 SECOND)
             WHERE token_hash = ?'
        )->execute([hashRefreshToken($raw)]);
        http_response_code(200);
        $GLOBALS['__capture_cookies'] = [];
        $this->callRefresh($raw);
        self::assertSame(401, http_response_code(), 'อายุ 11 วิ = เกิน grace');
        self::assertSame(0, $this->countActiveTokens(), 'เกิน grace ต้อง kill-all');
        self::assertCount(2, $GLOBALS['__capture_cookies'], 'เกิน grace ต้อง clear คู่ cookies');
    }

    #[Test]
    public function missing_token_returns_400(): void
    {
        $GLOBALS['__capture_cookies'] = [];
        http_response_code(200);
        $response = $this->callRefresh('');

        self::assertSame(400, http_response_code());
        self::assertArrayHasKey('error', $response);
        // terminal missing → clear คู่ cookies
        self::assertCount(2, $GLOBALS['__capture_cookies']);
    }

    #[Test]
    public function logout_revokes_the_refresh_token(): void
    {
        $raw = $this->issueFixture($this->userId);

        ob_start();
        logoutSession(self::$pdo, ['refresh_token' => $raw]);
        $response = json_decode((string) ob_get_clean(), true);

        self::assertTrue($response['success'] ?? false);

        $stmt = self::$pdo->prepare('SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?');
        $stmt->execute([hashRefreshToken($raw)]);
        self::assertNotNull($stmt->fetchColumn());
    }

    #[Test]
    public function rotation_preserves_original_expires_at_and_remember_me(): void
    {
        // D6: deadline ตอน login เป็น cap — rotation ต้องคง expires_at/remember_me เดิมเป๊ะ
        $originalExpires = date('Y-m-d H:i:s', time() + 5000);
        $raw = $this->issueFixture($this->userId, true, $originalExpires);

        $response = $this->callRefresh($raw);
        self::assertSame(200, http_response_code());

        $stmt = self::$pdo->prepare(
            'SELECT token_hash, expires_at, remember_me FROM refresh_tokens
              WHERE user_id = ? AND revoked_at IS NULL'
        );
        $stmt->execute([$this->userId]);
        $newRow = $stmt->fetch(PDO::FETCH_ASSOC);
        self::assertNotFalse($newRow, 'ต้องมีแถว active ใหม่หลัง rotation');
        self::assertSame($originalExpires, (string) $newRow['expires_at'], 'rotation ห้ามขยาย/ขยับ deadline');
        self::assertSame(1, (int) $newRow['remember_me'], 'remember mode ต้องส่งต่อ');

        // JWT ใหม่ผูก session deadline เดิม และ exp ไม่เกิน deadline
        $payload = json_decode(
            base64url_decode(explode('.', $response['token'] ?? '')[1] ?? ''),
            true
        );
        self::assertSame(strtotime($originalExpires), $payload['session_exp'] ?? null);
        self::assertLessThanOrEqual(strtotime($originalExpires), $payload['exp'] ?? null);

        // rotation ปกติไม่เขียน revocation_reason (คง NULL — ไม่ใช่ legacy_cutover)
        $oldStmt = self::$pdo->prepare('SELECT revocation_reason FROM refresh_tokens WHERE token_hash = ?');
        $oldStmt->execute([hashRefreshToken($raw)]);
        self::assertNull($oldStmt->fetchColumn(), 'rotation ห้ามแตะ revocation_reason');
    }

    #[Test]
    public function legacy_cutover_cookie_is_rejected_without_killing_newer_sessions(): void
    {
        // D6: แถวที่ migration 36 revoke (legacy_cutover) ถูกใช้ซ้ำหลังผู้ใช้ login ใหม่แล้ว
        // → 401 + clear เฉพาะใบนี้ ห้าม revoke session ใหม่ (kill-all)
        $raw = $this->issueFixture($this->userId, false, date('Y-m-d H:i:s', time() + 900));
        // ปลอมสถานะเหมือน migration: revoke ไปแล้ว 60 วินาที (เกิน grace) + เหตุผล cutover
        self::$pdo->prepare(
            "UPDATE refresh_tokens SET revoked_at = DATE_SUB(NOW(), INTERVAL 60 SECOND),
                    revocation_reason = 'legacy_cutover'
             WHERE token_hash = ?"
        )->execute([hashRefreshToken($raw)]);

        // session ใหม่ของผู้ใช้คนเดียวกัน (login หลัง cutover)
        $freshRaw = $this->issueFixture($this->userId, true, date('Y-m-d H:i:s', time() + REFRESH_TOKEN_TTL_SECONDS));

        $GLOBALS['__capture_cookies'] = [];
        http_response_code(200);
        $response = $this->callRefresh($raw);

        self::assertSame(401, http_response_code());
        self::assertArrayHasKey('error', $response);
        // terminal legacy_cutover ต้อง clear คู่ cookies
        self::assertCount(2, $GLOBALS['__capture_cookies'], 'legacy_cutover ต้อง emit clearing cookies ทั้งคู่');
        // session ใหม่ต้องยัง active — ไม่มี account-wide revocation
        self::assertSame(1, $this->countActiveTokens(), 'cookie เก่าห้าม kill session ใหม่');
        $freshStmt = self::$pdo->prepare('SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?');
        $freshStmt->execute([hashRefreshToken($freshRaw)]);
        self::assertNull($freshStmt->fetchColumn(), 'แถว session ใหม่ต้องยังไม่ถูก revoke');
    }

    #[Test]
    public function legacy_cutover_cookie_is_rejected_even_within_grace_window(): void
    {
        // legacy_cutover ไม่ใช่ race ระหว่าง tab — age เท่าไหร่ก็ clear + ไม่ kill-all
        $raw = $this->issueFixture($this->userId);
        self::$pdo->prepare(
            "UPDATE refresh_tokens SET revoked_at = NOW(), revocation_reason = 'legacy_cutover'
             WHERE token_hash = ?"
        )->execute([hashRefreshToken($raw)]);

        $GLOBALS['__capture_cookies'] = [];
        http_response_code(200);
        $response = $this->callRefresh($raw);

        self::assertSame(401, http_response_code());
        self::assertArrayHasKey('error', $response);
        self::assertCount(2, $GLOBALS['__capture_cookies'], 'legacy_cutover ใน grace ก็ต้อง clear');
        self::assertSame(0, $this->countActiveTokens(), 'แถวนี้เองถูก revoke อยู่แล้ว ไม่มีใบ active อื่น');
    }

    #[Test]
    public function within_grace_loser_emits_no_set_cookie_and_winner_cookies_still_work(): void
    {
        // D6: ผู้แพ้ใน grace ห้ามมี Set-Cookie (ไม่งั้นลบ cookie ที่ winner เพิ่งออก)
        $raw = $this->issueFixture($this->userId);

        // winner: rotation สำเร็จ + ออก cookies ชุดใหม่
        $GLOBALS['__capture_cookies'] = [];
        http_response_code(200);
        $winner = $this->callRefresh($raw);
        self::assertSame(200, http_response_code());
        $winnerCookies = $GLOBALS['__capture_cookies'];
        self::assertCount(2, $winnerCookies, 'winner ต้องออก cookie ทั้งคู่');

        // loser: ใช้ raw เดิมใน grace — ต้อง 401 และห้ามมี Set-Cookie
        $GLOBALS['__capture_cookies'] = [];
        http_response_code(200);
        $loser = $this->callRefresh($raw);
        self::assertSame(401, http_response_code());
        self::assertArrayHasKey('error', $loser);
        self::assertCount(0, $GLOBALS['__capture_cookies'], 'loser ห้าม emit Set-Cookie');

        // jar ยัง hold ชุดของ winner — access ยัง validate ได้ และ refresh ยังใช้ต่อได้
        $winnerAccess = '';
        foreach ($winnerCookies as $cookie) {
            if ($cookie['name'] === AUTH_ACCESS_COOKIE) {
                $winnerAccess = $cookie['value'];
            }
        }
        self::assertNotFalse(validateJWT($winnerAccess), 'access ของ winner ต้องยังผ่าน validate');
        http_response_code(200);
        $again = $this->callRefresh((string) $winner['refresh_token']);
        self::assertSame(200, http_response_code(), 'refresh ของ winner ต้องยัง rotate ต่อได้');
        self::assertArrayHasKey('token', $again);
    }
}
