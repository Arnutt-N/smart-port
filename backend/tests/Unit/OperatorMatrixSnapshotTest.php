<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../authz.php';

/**
 * M1: operator read ต้องเป็น explicit allowlist (ห้าม '*') — snapshot + coverage
 * fail-closed: resource ใหม่ที่เพิ่มเข้า authzResources() ต้องมาอยู่ใน operator.read
 * หรือ OPERATOR_EXCLUDED พร้อมเหตุผล ไม่งั้นเทสแดง (กัน auto-grant เงียบ)
 */
final class OperatorMatrixSnapshotTest extends TestCase
{
    /**
     * @var list<string> resource ที่ operator อ่านไม่ได้ — ว่างตอนนี้;
     * เพิ่ม resource ใหม่ทีไรต้องตัดสินใจที่นี่หรือใน matrix (ห้ามปล่อยผ่านเงียบ)
     */
    private const OPERATOR_EXCLUDED = [];

    private const EXPECTED_OPERATOR_READ = [
        'multiplier', 'personnel', 'candidates', 'probation',
        'equivalence', 'equivalence_approval', 'supportive', 'diverse',
        'photos', 'ocr', 'awards', 'royal_decorations', 'import',
        'retirement', 'analytics', 'work_results', 'dashboard', 'sync',
        'audit', 'users', 'profile', 'system_permissions',
    ];

    #[Test]
    public function operator_read_has_no_wildcard(): void
    {
        $matrix = defaultPermissionMatrix();

        self::assertNotContains('*', $matrix['operator']['read']);
        self::assertNotContains('*', $matrix['viewer']['read']);
    }

    #[Test]
    public function operator_read_matches_snapshot(): void
    {
        $matrix = defaultPermissionMatrix();
        $actual = $matrix['operator']['read'];
        sort($actual);
        $expected = self::EXPECTED_OPERATOR_READ;
        sort($expected);

        self::assertSame($expected, $actual);
    }

    #[Test]
    public function every_matrix_value_is_a_known_resource_or_wildcard(): void
    {
        $resources = authzResources();
        $matrix = defaultPermissionMatrix();

        foreach ($matrix as $role => $actions) {
            foreach ($actions as $action => $allowed) {
                foreach ($allowed as $resource) {
                    self::assertTrue(
                        $resource === '*' || in_array($resource, $resources, true),
                        "unknown resource '{$resource}' in {$role}.{$action}"
                    );
                }
            }
        }
    }

    #[Test]
    public function admin_keeps_wildcard_by_design(): void
    {
        $matrix = defaultPermissionMatrix();

        foreach (['read', 'create', 'update', 'delete'] as $action) {
            self::assertSame(['*'], $matrix['admin'][$action]);
        }
    }

    #[Test]
    public function operator_read_grants_preserved(): void
    {
        // behavior เดิม: operator อ่าน audit/users ได้ (users ตั้งใจให้ดูได้)
        self::assertTrue(checkPermissionDefault('operator', 'read', 'audit'));
        self::assertTrue(checkPermissionDefault('operator', 'read', 'users'));
        self::assertTrue(checkPermissionDefault('operator', 'read', 'personnel'));
        self::assertFalse(checkPermissionDefault('operator', 'delete', 'personnel'));
        self::assertFalse(checkPermissionDefault('operator', 'read', 'no-such-resource'));
    }

    #[Test]
    public function every_resource_has_an_explicit_operator_decision(): void
    {
        $matrix = defaultPermissionMatrix();
        $read = $matrix['operator']['read'];

        foreach (authzResources() as $resource) {
            self::assertTrue(
                in_array($resource, $read, true) || in_array($resource, self::OPERATOR_EXCLUDED, true),
                "resource '{$resource}' ขาด operator decision — เพิ่มใน matrix หรือ OPERATOR_EXCLUDED"
            );
        }
    }
}
