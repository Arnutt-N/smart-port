<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/settings.php';

final class PermissionSettingsRouteTest extends TestCase
{
    #[Test]
    public function validate_cell_rejects_superadmin_role(): void
    {
        http_response_code(200);
        ob_start();
        $result = validatePermissionCell([
            'role' => 'superadmin',
            'action' => 'read',
            'resource' => 'users',
        ], 0);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertNull($result);
        self::assertSame(400, http_response_code());
        self::assertStringContainsString('superadmin', (string) ($body['error'] ?? ''));
    }

    #[Test]
    public function put_rejects_item_without_allowed_or_reset(): void
    {
        $pdo = $this->sqliteOverrides();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        putPermissionSettings($pdo, ['user_id' => 1], [
            'overrides' => [
                ['role' => 'operator', 'action' => 'delete', 'resource' => 'multiplier'],
            ],
        ]);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(400, http_response_code());
        self::assertStringContainsString('allowed หรือ reset', (string) ($body['error'] ?? ''));
    }

    #[Test]
    public function put_invalid_item_does_not_partially_write(): void
    {
        $pdo = $this->sqliteOverrides();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        putPermissionSettings($pdo, ['user_id' => 1], [
            'overrides' => [
                [
                    'role' => 'operator',
                    'action' => 'delete',
                    'resource' => 'multiplier',
                    'allowed' => true,
                ],
                [
                    'role' => 'superadmin',
                    'action' => 'read',
                    'resource' => 'users',
                    'allowed' => false,
                ],
            ],
        ]);
        ob_get_clean();

        self::assertSame(400, http_response_code());
        self::assertSame(
            0,
            (int) $pdo->query('SELECT COUNT(*) FROM role_permission_overrides')->fetchColumn()
        );
    }

    #[Test]
    public function put_upsert_and_reset_round_trip(): void
    {
        $pdo = $this->sqliteOverrides();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        putPermissionSettings($pdo, ['user_id' => 1], [
            'overrides' => [
                [
                    'role' => 'operator',
                    'action' => 'delete',
                    'resource' => 'multiplier',
                    'allowed' => true,
                ],
            ],
        ]);
        $created = json_decode((string) ob_get_clean(), true);
        self::assertTrue($created['success'] ?? false);

        self::assertSame(
            1,
            (int) $pdo->query('SELECT COUNT(*) FROM role_permission_overrides')->fetchColumn()
        );

        http_response_code(200);
        ob_start();
        putPermissionSettings($pdo, ['user_id' => 1], [
            'overrides' => [
                [
                    'role' => 'operator',
                    'action' => 'delete',
                    'resource' => 'multiplier',
                    'reset' => true,
                ],
            ],
        ]);
        $reset = json_decode((string) ob_get_clean(), true);
        self::assertTrue($reset['success'] ?? false);
        self::assertSame(
            0,
            (int) $pdo->query('SELECT COUNT(*) FROM role_permission_overrides')->fetchColumn()
        );
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
                allowed INTEGER NOT NULL,
                PRIMARY KEY (role, action, resource)
            )'
        );
        $pdo->exec(
            'CREATE TABLE audit_log (
                audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action TEXT,
                table_name TEXT,
                record_id INTEGER,
                before_value TEXT,
                after_value TEXT,
                ip_address TEXT,
                user_agent TEXT
            )'
        );
        return $pdo;
    }
}
