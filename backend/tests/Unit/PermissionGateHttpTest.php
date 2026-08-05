<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../authz.php';

/**
 * HTTP contract for evaluatePermissionAccess / requirePermission (without exit).
 */
final class PermissionGateHttpTest extends TestCase
{
    #[Test]
    public function unauthenticated_is_401(): void
    {
        $denied = evaluatePermissionAccess('read', 'users', null);
        self::assertSame(401, $denied['status'] ?? null);
        self::assertSame('Unauthorized', $denied['body']['error'] ?? null);
    }

    #[Test]
    public function superadmin_allowed_without_pdo(): void
    {
        self::assertNull(evaluatePermissionAccess('delete', 'users', [
            'user_id' => 1,
            'role' => 'superadmin',
        ]));
    }

    #[Test]
    public function forbidden_when_default_denies(): void
    {
        $pdo = $this->sqliteOverrides();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        clearPermissionOverrideCache();
        $denied = evaluatePermissionAccess('delete', 'multiplier', [
            'user_id' => 2,
            'role' => 'operator',
        ], $pdo);

        self::assertSame(403, $denied['status'] ?? null);
        self::assertSame('Forbidden', $denied['body']['error'] ?? null);
        self::assertSame('delete:multiplier', $denied['body']['required_permission'] ?? null);
    }

    #[Test]
    public function override_store_unavailable_is_503(): void
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        // Empty in-memory DB — no role_permission_overrides table
        $pdo = new PDO('sqlite::memory:');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        clearPermissionOverrideCache();

        $denied = evaluatePermissionAccess('read', 'users', [
            'user_id' => 3,
            'role' => 'admin',
        ], $pdo);

        self::assertSame(503, $denied['status'] ?? null);
        self::assertSame('Service Unavailable', $denied['body']['error'] ?? null);
        self::assertNotEmpty($denied['body']['message'] ?? null);
    }

    #[Test]
    public function missing_getdb_without_pdo_is_503(): void
    {
        if (function_exists('getDB')) {
            self::markTestSkipped('getDB already defined in this process');
        }

        clearPermissionOverrideCache();
        $denied = evaluatePermissionAccess('read', 'users', [
            'user_id' => 4,
            'role' => 'admin',
        ], null);

        self::assertSame(503, $denied['status'] ?? null);
        self::assertSame('Service Unavailable', $denied['body']['error'] ?? null);
    }

    private function sqliteOverrides(): ?PDO
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            return null;
        }

        $pdo = new PDO('sqlite::memory:');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec(
            'CREATE TABLE role_permission_overrides (
                role TEXT NOT NULL,
                action TEXT NOT NULL,
                resource TEXT NOT NULL,
                allowed INTEGER NOT NULL
            )'
        );
        return $pdo;
    }
}
