<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/settings.php';
require_once __DIR__ . '/../../authz.php';

/**
 * N4 — GET /settings/permissions/self คืน effective grants ของ role ตัวเอง
 * (รวม role_permission_overrides) — ตรวจ response shape + กัน unauthenticated
 * + superadmin คืน all=true — Authorization guard ของ requireSuperAdmin เดิม
 * ไม่ถูกแตะ (PUT/Edit ยัง superadmin เท่านั้น)
 */
final class OwnPermissionMatrixTest extends TestCase
{
    protected function tearDown(): void
    {
        // เทสอื่นอาจพึ่ง $GLOBALS['__auth_user'] override — ล้างเสมอ
        $GLOBALS['__auth_user'] = null;
    }

    /** @return array{status:int, body:array} */
    private function call(string $role, ?PDO $pdo = null): array
    {
        $GLOBALS['__auth_user'] = ['user_id' => 1, 'role' => $role];
        http_response_code(418);
        ob_start();
        getOwnPermissionMatrix($pdo ?? new PDO('sqlite::memory:'));
        $body = json_decode((string) ob_get_clean(), true) ?? [];
        return ['status' => http_response_code(), 'body' => $body];
    }

    private function emptyOverridesPdo(): ?PDO
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            return null;
        }
        $pdo = new PDO('sqlite::memory:');
        $pdo->exec(
            'CREATE TABLE role_permission_overrides (
                role TEXT NOT NULL, action TEXT NOT NULL, resource TEXT NOT NULL,
                allowed INTEGER NOT NULL)'
        );
        return $pdo;
    }

    #[Test]
    public function superadmin_gets_all_flag(): void
    {
        $result = $this->call('superadmin');
        self::assertSame(200, $result['status']);
        self::assertTrue($result['body']['data']['all']);
    }

    #[Test]
    public function operator_grants_exclude_delete(): void
    {
        $pdo = $this->emptyOverridesPdo();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }
        $result = $this->call('operator', $pdo);
        self::assertSame(200, $result['status']);
        $grants = $result['body']['data']['grants'];
        self::assertSame('operator', $result['body']['data']['role']);
        self::assertSame([], $grants['delete']);
        // operator read = ['*'] → ควรมี resource หลากหลาย
        self::assertContains('multiplier', $grants['read']);
        self::assertContains('audit', $grants['read']);
    }

    #[Test]
    public function viewer_grants_are_narrow(): void
    {
        $pdo = $this->emptyOverridesPdo();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }
        $result = $this->call('viewer', $pdo);
        self::assertSame(200, $result['status']);
        $grants = $result['body']['data']['grants'];
        self::assertNotContains('audit', $grants['read']);
        self::assertContains('dashboard', $grants['read']);
        self::assertSame([], $grants['create']);
    }
}
