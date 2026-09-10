<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Throwable;

putenv('JWT_SECRET=integration-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/users.php';

/**
 * N23 — integration suite ของ users CRUD ต่อ DB จริง
 *
 * เดิมมีแค่ guard ระดับ sqlite (UserManagementGuardTest) ไม่มีเทสต่อ MySQL:
 * create/get/update roundtrip, duplicate 409, password reset revoke refresh,
 * self-guard, last-superadmin guard, routing ผ่าน handleUsers
 */
final class UsersCrudTest extends TestCase
{
    private static ?PDO $pdo = null;

    /** @var list<int> user ที่สร้างในแต่ละเทส */
    private array $userIds = [];

    private int $actorId = 0;

    /** @var array{user_id:int, role:string} */
    private array $actor = ['user_id' => 0, 'role' => 'admin'];

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        if (!self::$pdo->query("SHOW TABLES LIKE 'users'")->fetchColumn()) {
            self::markTestSkipped('ไม่พบตาราง users');
        }
        http_response_code(200);

        // actor แอดมินจริงใน DB (logAudit มี FK ไป users — ใช้ id จริงกัน violation)
        $actorName = 'n23actor' . bin2hex(random_bytes(3));
        self::$pdo->prepare(
            "INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)
             VALUES (?, ?, 'N23 Actor', 'admin', 1, 0)"
        )->execute([$actorName, password_hash('ActorPass123', PASSWORD_BCRYPT)]);
        $this->actorId = (int) self::$pdo->lastInsertId();
        $this->actor = ['user_id' => $this->actorId, 'role' => 'admin'];
        $GLOBALS['__auth_user'] = $this->actor;
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['__auth_user']);
        if (self::$pdo !== null) {
            try {
                if ($this->userIds !== []) {
                    $placeholders = implode(',', array_fill(0, count($this->userIds), '?'));
                    self::$pdo->prepare("DELETE FROM refresh_tokens WHERE user_id IN ({$placeholders})")
                        ->execute($this->userIds);
                    self::$pdo->prepare("DELETE FROM users WHERE user_id IN ({$placeholders})")
                        ->execute($this->userIds);
                }
                if ($this->actorId > 0) {
                    self::$pdo->prepare('DELETE FROM refresh_tokens WHERE user_id = ?')->execute([$this->actorId]);
                    self::$pdo->prepare('DELETE FROM users WHERE user_id = ?')->execute([$this->actorId]);
                }
            } catch (Throwable $e) {
                // cleanup ล้มเหลว — อย่าทำให้ผลเทสเสีย
            }
        }
        $this->userIds = [];
        $this->actorId = 0;
        http_response_code(200);
    }

    #[Test]
    public function create_list_update_roundtrip(): void
    {
        $username = $this->uniqueUsername();

        http_response_code(200);
        ob_start();
        createUser(self::$pdo, $this->actor, [
            'username' => $username,
            'password' => 'TestPass123',
            'full_name' => 'ทดสอบ ครัด',
            'role' => 'viewer',
        ]);
        $raw = (string) ob_get_clean();
        $created = json_decode($raw, true);

        self::assertSame(201, http_response_code(), $raw);
        self::assertTrue($created['success']);
        $newId = (int) $created['user_id'];
        self::assertGreaterThan(0, $newId);
        $this->userIds[] = $newId;

        // list เจอ + ไม่มี password_hash หลุด
        http_response_code(200);
        ob_start();
        getUserList(self::$pdo, ['search' => $username, 'limit' => 20, 'offset' => 0]);
        $list = json_decode((string) ob_get_clean(), true);

        self::assertSame(200, http_response_code());
        self::assertTrue($list['success']);
        self::assertGreaterThanOrEqual(1, $list['pagination']['total']);
        $found = null;
        foreach ($list['data'] as $row) {
            if ((int) $row['user_id'] === $newId) {
                $found = $row;
            }
        }
        self::assertNotNull($found, 'ต้องเจอ user ที่สร้างใน list');
        self::assertArrayNotHasKey('password_hash', $found);
        self::assertSame($username, $found['username']);

        // update full_name
        http_response_code(200);
        ob_start();
        updateUser(self::$pdo, $newId, $this->actor, ['full_name' => 'ทดสอบ เปลี่ยนชื่อ']);
        $updated = json_decode((string) ob_get_clean(), true);

        self::assertSame(200, http_response_code());
        self::assertTrue($updated['success']);
        $name = self::$pdo->query("SELECT full_name FROM users WHERE user_id = {$newId}")->fetchColumn();
        self::assertSame('ทดสอบ เปลี่ยนชื่อ', $name);
    }

    #[Test]
    public function create_duplicate_username_returns_409(): void
    {
        $username = $this->uniqueUsername();
        $this->createDirect($username);

        http_response_code(200);
        ob_start();
        createUser(self::$pdo, $this->actor, [
            'username' => $username,
            'password' => 'TestPass123',
            'full_name' => 'ซ้ำ',
            'role' => 'viewer',
        ]);
        $raw = (string) ob_get_clean();
        $body = json_decode($raw, true);

        self::assertSame(409, http_response_code(), $raw);
        self::assertSame('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว', $body['error'] ?? null);
    }

    #[Test]
    public function create_rejects_bad_input(): void
    {
        // role ผิด
        $out = $this->tryCreate(['role' => 'nobody']);
        self::assertSame(400, $out['code']);
        self::assertSame('role ไม่ถูกต้อง', $out['body']['error'] ?? null);

        // รหัสผ่านสั้น
        $out = $this->tryCreate(['password' => 'short']);
        self::assertSame(400, $out['code']);
        self::assertStringContainsString('รหัสผ่าน', (string) ($out['body']['error'] ?? ''));

        // N34: password ไม่ใช่ string → 400 ไม่ใช่ TypeError 500
        $out = $this->tryCreate(['password' => ['a', 'b']]);
        self::assertSame(400, $out['code']);

        // username ผิด pattern
        $out = $this->tryCreate(['username' => 'bad name!']);
        self::assertSame(400, $out['code']);
    }

    #[Test]
    public function admin_cannot_create_superadmin(): void
    {
        $out = $this->tryCreate(['role' => 'superadmin']);

        self::assertSame(403, $out['code']);
        self::assertSame('คุณไม่มีสิทธิ์กำหนดบทบาทนี้', $out['body']['error'] ?? null);
    }

    #[Test]
    public function password_reset_revokes_refresh_tokens(): void
    {
        if (!self::$pdo->query("SHOW TABLES LIKE 'refresh_tokens'")->fetchColumn()) {
            self::markTestSkipped('ไม่พบตาราง refresh_tokens');
        }
        $id = $this->createDirect($this->uniqueUsername());

        self::$pdo->prepare(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))'
        )->execute([$id, hash('sha256', 'n23-refresh-' . $id)]);

        http_response_code(200);
        ob_start();
        updateUser(self::$pdo, $id, $this->actor, ['password' => 'NewPass456']);
        $raw = (string) ob_get_clean();

        self::assertSame(200, http_response_code(), $raw);
        $active = (int) self::$pdo->query(
            "SELECT COUNT(*) FROM refresh_tokens WHERE user_id = {$id} AND revoked_at IS NULL"
        )->fetchColumn();
        self::assertSame(0, $active, 'reset แล้ว refresh token ต้องถูก revoke หมด');
        $flag = (int) self::$pdo->query("SELECT must_change_password FROM users WHERE user_id = {$id}")->fetchColumn();
        self::assertSame(1, $flag);
    }

    #[Test]
    public function self_demote_and_deactivate_are_blocked(): void
    {
        $self = ['user_id' => $this->actorId, 'role' => 'admin'];

        http_response_code(200);
        ob_start();
        updateUser(self::$pdo, $this->actorId, $self, ['role' => 'viewer']);
        $raw = (string) ob_get_clean();
        self::assertSame(400, http_response_code(), $raw);

        http_response_code(200);
        ob_start();
        updateUser(self::$pdo, $this->actorId, $self, ['is_active' => 0]);
        $raw2 = (string) ob_get_clean();
        self::assertSame(400, http_response_code(), $raw2);

        $row = self::$pdo->query(
            "SELECT role, is_active FROM users WHERE user_id = {$this->actorId}"
        )->fetch(PDO::FETCH_ASSOC);
        self::assertSame('admin', $row['role']);
        self::assertSame(1, (int) $row['is_active']);
    }

    #[Test]
    public function update_unknown_user_returns_404(): void
    {
        http_response_code(200);
        ob_start();
        updateUser(self::$pdo, 999999989, $this->actor, ['full_name' => 'ผี']);
        $raw = (string) ob_get_clean();

        self::assertSame(404, http_response_code(), $raw);
    }

    #[Test]
    public function handle_users_routing(): void
    {
        // GET ด้วย operator (read:users ผ่าน default) → 200
        $GLOBALS['__auth_user'] = ['user_id' => $this->actorId, 'role' => 'operator'];
        $out = $this->callHandle('GET', ['users']);
        self::assertSame(200, $out['code']);
        self::assertTrue($out['body']['success']);

        // POST ด้วย viewer (ไม่มี create:users) → 403
        $GLOBALS['__auth_user'] = ['user_id' => $this->actorId, 'role' => 'viewer'];
        $out = $this->callHandle('POST', ['users'], ['username' => 'x', 'password' => 'TestPass123', 'full_name' => 'x', 'role' => 'viewer']);
        self::assertSame(403, $out['code']);

        // PUT ไม่ระบุ id → 400
        $GLOBALS['__auth_user'] = $this->actor;
        $out = $this->callHandle('PUT', ['users']);
        self::assertSame(400, $out['code']);

        // unauthenticated → 401
        $GLOBALS['__auth_user'] = null;
        $out = $this->callHandle('GET', ['users']);
        self::assertSame(401, $out['code']);
    }

    /** @return array{code:int, body:array<string,mixed>} */
    private function tryCreate(array $overrides): array
    {
        $input = array_merge([
            'username' => $this->uniqueUsername(),
            'password' => 'TestPass123',
            'full_name' => 'ทดสอบ',
            'role' => 'viewer',
        ], $overrides);
        http_response_code(200);
        ob_start();
        createUser(self::$pdo, $this->actor, $input);
        $raw = (string) ob_get_clean();
        $body = json_decode($raw, true) ?? [];
        if (($body['success'] ?? false) && isset($body['user_id'])) {
            $this->userIds[] = (int) $body['user_id'];
        }
        return ['code' => http_response_code(), 'body' => $body];
    }

    private function createDirect(string $username): int
    {
        http_response_code(200);
        ob_start();
        createUser(self::$pdo, $this->actor, [
            'username' => $username,
            'password' => 'TestPass123',
            'full_name' => 'ทดสอบ ตรง',
            'role' => 'viewer',
        ]);
        $raw = (string) ob_get_clean();
        $body = json_decode($raw, true);
        self::assertSame(201, http_response_code(), $raw);
        $id = (int) $body['user_id'];
        $this->userIds[] = $id;
        return $id;
    }

    /**
     * @param list<string> $path
     * @return array{code:int, body:array<string,mixed>}
     */
    private function callHandle(string $method, array $path, ?array $input = null): array
    {
        http_response_code(200);
        ob_start();
        handleUsers(self::$pdo, $method, $path, $input, []);
        $raw = (string) ob_get_clean();
        return ['code' => http_response_code(), 'body' => json_decode($raw, true) ?? []];
    }

    private function uniqueUsername(): string
    {
        return 'n23user' . bin2hex(random_bytes(3));
    }
}
