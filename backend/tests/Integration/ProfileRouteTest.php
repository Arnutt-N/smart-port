<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Throwable;

putenv('JWT_SECRET=integration-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/profile.php';

/**
 * T6 — profile extract: เส้นทาง allowed 200/404 ต่อ MySQL จริง
 *
 * actor ใช้ role viewer (สิทธิ์ต่ำสุดที่อ่าน profile ได้) — พิสูจน์ว่าไม่ใช่แค่ admin-*
 * contract 401/403/503 อยู่ใน Unit/ProfileHandlerTest (sqlite, ไม่ต้องมี DB)
 */
final class ProfileRouteTest extends TestCase
{
    private static ?PDO $pdo = null;

    private int $actorId = 0;
    private int $prefixId = 0;
    private int $personnelId = 0;
    private string $suffix = '';
    private string $username = '';
    private string $employeeId = '';

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        foreach (['personnel', 'prefixes', 'users', 'civil_servant_photos'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table}");
            }
        }
        http_response_code(200);

        $this->suffix = bin2hex(random_bytes(3));
        self::$pdo->prepare(
            'INSERT INTO prefixes (prefix_code, prefix_name_th) VALUES (?, ?)'
        )->execute(['T6' . $this->suffix, 'นาย']);
        $this->prefixId = (int) self::$pdo->lastInsertId();

        $this->employeeId = 'T6E' . $this->suffix;
        self::$pdo->prepare(
            'INSERT INTO personnel
                (citizen_id, first_name, last_name, prefix_id, employee_id,
                 birth_date, appointment_date, servant_status, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)'
        )->execute([
            $this->uniqueCitizenId('6'),
            'ทดสอบ',
            'โปรไฟล์',
            $this->prefixId,
            $this->employeeId,
            '1990-01-15',
            '2020-06-01',
            'active',
        ]);
        $this->personnelId = (int) self::$pdo->lastInsertId();

        $this->username = 't6actor' . $this->suffix;
        self::$pdo->prepare(
            "INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)
             VALUES (?, ?, 'T6 Actor', 'viewer', 1, 0)"
        )->execute([$this->username, password_hash('ActorPass123', PASSWORD_BCRYPT)]);
        $this->actorId = (int) self::$pdo->lastInsertId();
        $GLOBALS['__auth_user'] = ['user_id' => $this->actorId, 'role' => 'viewer'];
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['__auth_user']);
        if (self::$pdo !== null) {
            try {
                if ($this->personnelId > 0) {
                    self::$pdo->prepare('DELETE FROM personnel WHERE personnel_id = ?')
                        ->execute([$this->personnelId]);
                }
                if ($this->prefixId > 0) {
                    self::$pdo->prepare('DELETE FROM prefixes WHERE prefix_id = ?')
                        ->execute([$this->prefixId]);
                }
                if ($this->actorId > 0) {
                    self::$pdo->prepare('DELETE FROM refresh_tokens WHERE user_id = ?')
                        ->execute([$this->actorId]);
                    self::$pdo->prepare('DELETE FROM users WHERE user_id = ?')
                        ->execute([$this->actorId]);
                }
            } catch (Throwable $e) {
                // cleanup ล้มเหลว — อย่าทำให้ผลเทสเสีย
            }
        }
        $this->actorId = 0;
        $this->prefixId = 0;
        $this->personnelId = 0;
        http_response_code(200);
    }

    #[Test]
    public function get_own_account_returns_user_shape_without_password_hash(): void
    {
        $json = $this->callProfile('GET', ['profile']);

        self::assertSame(200, http_response_code());
        self::assertTrue($json['success'] ?? false);
        self::assertSame($this->actorId, (int) ($json['data']['user_id'] ?? 0));
        self::assertSame($this->username, $json['data']['username'] ?? null);
        self::assertSame('viewer', $json['data']['role'] ?? null);
        self::assertArrayHasKey('must_change_password', $json['data']);
        self::assertArrayNotHasKey('password_hash', $json['data']);
    }

    #[Test]
    public function get_personnel_by_id_returns_servant_shape_with_prefix_full_name(): void
    {
        $json = $this->callProfile('GET', ['profile', (string) $this->personnelId]);

        self::assertSame(200, http_response_code());
        self::assertTrue($json['success'] ?? false);
        self::assertSame($this->personnelId, (int) ($json['data']['personnel_id'] ?? 0));
        self::assertSame($this->employeeId, $json['data']['employee_id'] ?? null);
        self::assertSame('นายทดสอบ โปรไฟล์', $json['data']['full_name'] ?? null);
        self::assertSame('active', $json['data']['servant_status'] ?? null);
        self::assertArrayHasKey('photo_path', $json['data']);
        self::assertNull($json['data']['photo_path']);
    }

    #[Test]
    public function get_unknown_personnel_returns_404(): void
    {
        $json = $this->callProfile('GET', ['profile', '999999999']);

        self::assertSame(404, http_response_code());
        self::assertSame(['error' => 'Not found'], $json);
    }

    /**
     * @param list<string> $path
     * @return array<string,mixed>|null
     */
    private function callProfile(string $method, array $path): ?array
    {
        http_response_code(200);
        ob_start();
        try {
            handleProfile(self::$pdo, $method, $path);
        } finally {
            $raw = (string) ob_get_clean();
        }
        return json_decode($raw, true);
    }

    private function uniqueCitizenId(string $lead): string
    {
        $first12 = substr($lead . str_pad((string) hexdec($this->suffix), 11, '0', STR_PAD_LEFT), 0, 12);
        return testCitizenId($first12);
    }
}
