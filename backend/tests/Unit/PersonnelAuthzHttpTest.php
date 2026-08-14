<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../authz.php';
require_once __DIR__ . '/../../helpers.php';
require_once __DIR__ . '/../../routes/personnel.php';

/**
 * HTTP contract: operator/viewer cannot write personnel (403);
 * include_inactive is admin-only (soft-deny, not 403);
 * master list/detail omits citizen_id for non-admin.
 */
final class PersonnelAuthzHttpTest extends TestCase
{
    #[Test]
    public function operator_create_personnel_is_403(): void
    {
        $denied = $this->evaluate('create', 'personnel', 'operator');
        self::assertSame(403, $denied['status'] ?? null);
        self::assertSame('Forbidden', $denied['body']['error'] ?? null);
        self::assertSame('create:personnel', $denied['body']['required_permission'] ?? null);
    }

    #[Test]
    public function operator_update_personnel_is_403(): void
    {
        $denied = $this->evaluate('update', 'personnel', 'operator');
        self::assertSame(403, $denied['status'] ?? null);
        self::assertSame('update:personnel', $denied['body']['required_permission'] ?? null);
    }

    #[Test]
    public function viewer_create_personnel_is_403(): void
    {
        $denied = $this->evaluate('create', 'personnel', 'viewer');
        self::assertSame(403, $denied['status'] ?? null);
        self::assertSame('create:personnel', $denied['body']['required_permission'] ?? null);
    }

    #[Test]
    public function operator_read_personnel_is_allowed(): void
    {
        self::assertNull($this->evaluate('read', 'personnel', 'operator'));
    }

    #[Test]
    public function admin_create_personnel_is_allowed(): void
    {
        self::assertNull($this->evaluate('create', 'personnel', 'admin'));
    }

    #[Test]
    public function include_inactive_false_for_every_role_when_not_requested(): void
    {
        foreach (['admin', 'superadmin', 'operator', 'viewer', ''] as $role) {
            self::assertFalse(resolvePersonnelIncludeInactive(false, $role));
        }
    }

    #[Test]
    public function include_inactive_true_only_for_admin_and_superadmin(): void
    {
        self::assertTrue(resolvePersonnelIncludeInactive(true, 'admin'));
        self::assertTrue(resolvePersonnelIncludeInactive(true, 'superadmin'));
        self::assertFalse(resolvePersonnelIncludeInactive(true, 'operator'));
        self::assertFalse(resolvePersonnelIncludeInactive(true, 'viewer'));
        self::assertFalse(resolvePersonnelIncludeInactive(true, ''));
    }

    #[Test]
    public function citizen_id_visible_only_to_admin_and_superadmin(): void
    {
        self::assertTrue(personnelRoleSeesCitizenId('admin'));
        self::assertTrue(personnelRoleSeesCitizenId('superadmin'));
        self::assertFalse(personnelRoleSeesCitizenId('operator'));
        self::assertFalse(personnelRoleSeesCitizenId('viewer'));
        self::assertFalse(personnelRoleSeesCitizenId(''));
    }

    #[Test]
    public function redact_omits_citizen_id_for_non_admin(): void
    {
        $row = ['personnel_id' => 1, 'citizen_id' => '1234567890121', 'first_name' => 'ก'];

        $admin = redactPersonnelCitizenIdForRole($row, 'admin');
        self::assertSame('1234567890121', $admin['citizen_id']);
        self::assertSame(1, $admin['personnel_id']);

        $super = redactPersonnelCitizenIdForRole($row, 'superadmin');
        self::assertSame('1234567890121', $super['citizen_id']);

        foreach (['operator', 'viewer', ''] as $role) {
            $redacted = redactPersonnelCitizenIdForRole($row, $role);
            self::assertArrayNotHasKey('citizen_id', $redacted);
            self::assertSame(1, $redacted['personnel_id']);
            self::assertSame('ก', $redacted['first_name']);
        }
    }

    /**
     * @return array{status:int, body:array<string,mixed>}|null
     */
    private function evaluate(string $action, string $resource, string $role): ?array
    {
        $pdo = $this->sqliteOverrides();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        clearPermissionOverrideCache();
        return evaluatePermissionAccess($action, $resource, [
            'user_id' => 2,
            'role' => $role,
        ], $pdo);
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
