<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../authz.php';

/**
 * Override layer on checkPermission — uses an in-memory SQLite stand-in when available,
 * otherwise verifies default matrix helpers without DB.
 */
final class PermissionOverrideTest extends TestCase
{
    #[Test]
    public function default_helper_matches_operator_matrix(): void
    {
        self::assertTrue(checkPermissionDefault('operator', 'create', 'multiplier'));
        self::assertFalse(checkPermissionDefault('operator', 'delete', 'multiplier'));
        self::assertFalse(checkPermissionDefault('operator', 'update', 'equivalence_approval'));
    }

    #[Test]
    public function override_allow_grants_operator_delete_when_map_injected(): void
    {
        $pdo = $this->sqliteWithOverrides([
            ['operator', 'delete', 'multiplier', 1],
        ]);
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        clearPermissionOverrideCache();
        self::assertTrue(checkPermission('operator', 'delete', 'multiplier', $pdo));
        // Untouched cells still use defaults
        self::assertFalse(checkPermission('operator', 'delete', 'personnel', $pdo));
    }

    #[Test]
    public function override_deny_blocks_admin_read_when_map_injected(): void
    {
        $pdo = $this->sqliteWithOverrides([
            ['admin', 'read', 'audit', 0],
        ]);
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        clearPermissionOverrideCache();
        self::assertFalse(checkPermission('admin', 'read', 'audit', $pdo));
        self::assertTrue(checkPermission('admin', 'read', 'users', $pdo));
    }

    #[Test]
    public function superadmin_ignores_overrides(): void
    {
        $pdo = $this->sqliteWithOverrides([
            ['superadmin', 'read', 'audit', 0],
        ]);
        if ($pdo === null) {
            // Even without DB, superadmin is always true
            self::assertTrue(checkPermission('superadmin', 'read', 'audit'));
            return;
        }

        clearPermissionOverrideCache();
        self::assertTrue(checkPermission('superadmin', 'read', 'audit', $pdo));
    }

    #[Test]
    public function override_load_failure_is_fail_closed(): void
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        $pdo = new PDO('sqlite::memory:');
        // No role_permission_overrides table → load must fail closed
        clearPermissionOverrideCache();
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('AUTHZ_OVERRIDES_UNAVAILABLE');
        checkPermission('admin', 'read', 'users', $pdo);
    }

    #[Test]
    public function override_load_failure_is_not_sticky_across_retries(): void
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        $pdo = new PDO('sqlite::memory:');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        clearPermissionOverrideCache();

        try {
            checkPermission('admin', 'read', 'users', $pdo);
            self::fail('expected AUTHZ_OVERRIDES_UNAVAILABLE');
        } catch (\RuntimeException $e) {
            self::assertSame('AUTHZ_OVERRIDES_UNAVAILABLE', $e->getMessage());
        }

        // Recover without clearPermissionOverrideCache() — failures must not stick.
        $pdo->exec(
            'CREATE TABLE role_permission_overrides (
                role TEXT NOT NULL,
                action TEXT NOT NULL,
                resource TEXT NOT NULL,
                allowed INTEGER NOT NULL
            )'
        );
        self::assertTrue(checkPermission('admin', 'read', 'users', $pdo));
    }

    #[Test]
    public function null_pdo_keeps_defaults_for_offline_unit_tests(): void
    {
        clearPermissionOverrideCache();
        self::assertTrue(checkPermission('admin', 'read', 'users', null));
        self::assertFalse(checkPermission('viewer', 'delete', 'users', null));
    }

    /**
     * @param list<array{0:string,1:string,2:string,3:int}> $rows
     */
    private function sqliteWithOverrides(array $rows): ?PDO
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            return null;
        }

        $pdo = new PDO('sqlite::memory:');
        $pdo->exec(
            'CREATE TABLE role_permission_overrides (
                role TEXT NOT NULL,
                action TEXT NOT NULL,
                resource TEXT NOT NULL,
                allowed INTEGER NOT NULL
            )'
        );
        $stmt = $pdo->prepare(
            'INSERT INTO role_permission_overrides (role, action, resource, allowed) VALUES (?, ?, ?, ?)'
        );
        foreach ($rows as $row) {
            $stmt->execute($row);
        }
        return $pdo;
    }
}
