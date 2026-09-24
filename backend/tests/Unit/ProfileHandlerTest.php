<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../authz.php';
require_once __DIR__ . '/../../routes/profile.php';

/**
 * T6 — profile extract: โครงสร้าง + auth contract ของ routes/profile.php
 *
 * - api.php ต้อง delegate ไป handleProfile และไม่มี inline SQL ของ profile เหลืออยู่
 * - 405 เกิดก่อน authz (offline) · 401/403/503 คง contract เดียวกับ requirePermission
 * - เส้นทาง allowed (200/404 + เนื้อ row) อยู่ใน Integration/ProfileRouteTest
 */
final class ProfileHandlerTest extends TestCase
{
    protected function tearDown(): void
    {
        unset($GLOBALS['__auth_user']);
        clearPermissionOverrideCache();
        // http_response_code() เป็น process-global — reset กัน test ถัดไป false-pass
        http_response_code(200);
    }

    #[Test]
    public function route_file_defines_handler_and_helpers(): void
    {
        self::assertFileExists(__DIR__ . '/../../routes/profile.php');
        self::assertTrue(function_exists('handleProfile'));
        self::assertTrue(function_exists('resolveProfileAuthUser'));
        self::assertTrue(function_exists('fetchPersonnelProfile'));
        self::assertTrue(function_exists('fetchOwnAccount'));
    }

    #[Test]
    public function api_gateway_delegates_and_has_no_inline_profile_sql(): void
    {
        $api = (string) file_get_contents(__DIR__ . '/../../api.php');
        self::assertStringContainsString('handleProfile($pdo, $method, $path)', $api);
        // marker ของ inline block เดิม (api.php ก่อนย้าย) — ต้องไม่อยู่ใน gateway แล้ว
        self::assertStringNotContainsString('csp.file_path AS photo_path', $api);
        self::assertStringNotContainsString('GET /profile/{id}', $api);
    }

    #[Test]
    public function non_get_rejected_before_authz(): void
    {
        $pdo = $this->sqliteMemory();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        $output = $this->capture(fn () => handleProfile($pdo, 'POST', ['profile']));

        self::assertSame(405, http_response_code());
        self::assertSame(['error' => 'Method not allowed'], json_decode($output, true));
    }

    #[Test]
    public function null_auth_user_returns_401(): void
    {
        $pdo = $this->sqliteMemory();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }
        $GLOBALS['__auth_user'] = null;

        $output = $this->capture(fn () => handleProfile($pdo, 'GET', ['profile']));

        self::assertSame(401, http_response_code());
        self::assertSame(['error' => 'Unauthorized'], json_decode($output, true));
    }

    #[Test]
    public function override_deny_returns_403_with_required_permission(): void
    {
        $pdo = $this->sqliteWithOverrides([['viewer', 'read', 'profile', 0]]);
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }
        $GLOBALS['__auth_user'] = ['user_id' => 7, 'role' => 'viewer'];
        clearPermissionOverrideCache();

        $output = $this->capture(fn () => handleProfile($pdo, 'GET', ['profile', '1']));

        self::assertSame(403, http_response_code());
        $json = json_decode($output, true);
        self::assertSame('Forbidden', $json['error'] ?? null);
        self::assertSame('read:profile', $json['required_permission'] ?? null);
    }

    #[Test]
    public function missing_override_table_returns_503_fail_closed(): void
    {
        $pdo = $this->sqliteMemory();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }
        $GLOBALS['__auth_user'] = ['user_id' => 7, 'role' => 'viewer'];
        clearPermissionOverrideCache();

        $output = $this->capture(fn () => handleProfile($pdo, 'GET', ['profile']));

        self::assertSame(503, http_response_code());
        $json = json_decode($output, true);
        self::assertSame('Service Unavailable', $json['error'] ?? null);
    }

    private function capture(callable $fn): string
    {
        http_response_code(200);
        ob_start();
        try {
            $fn();
        } finally {
            $output = (string) ob_get_clean();
        }
        return $output;
    }

    private function sqliteMemory(): ?PDO
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            return null;
        }
        $pdo = new PDO('sqlite::memory:');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $pdo;
    }

    /**
     * @param list<array{string, string, string, int}> $rows
     */
    private function sqliteWithOverrides(array $rows): ?PDO
    {
        $pdo = $this->sqliteMemory();
        if ($pdo === null) {
            return null;
        }
        $pdo->exec(
            'CREATE TABLE role_permission_overrides (
                role TEXT NOT NULL,
                action TEXT NOT NULL,
                resource TEXT NOT NULL,
                allowed INTEGER NOT NULL
            )'
        );
        $stmt = $pdo->prepare(
            'INSERT INTO role_permission_overrides (role, action, resource, allowed)
             VALUES (?, ?, ?, ?)'
        );
        foreach ($rows as $row) {
            $stmt->execute($row);
        }
        return $pdo;
    }
}
