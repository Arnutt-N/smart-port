<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../audit.php';

/**
 * Unit tests สำหรับ checkPermission() ใน backend/audit.php — pure function, ไม่ใช้ DB
 * Permission matrix: admin (ทุกอย่าง), operator (read ทุก resource, create/update เฉพาะ
 * resource งาน HR, ห้าม delete), viewer (read เฉพาะ resource ที่กำหนด, ห้าม เขียนทุกชนิด)
 */
final class AuditPermissionTest extends TestCase
{
    #[Test]
    #[DataProvider('adminProvider')]
    public function admin_can_do_anything_on_any_resource(string $action, string $resource): void
    {
        self::assertTrue(checkPermission('admin', $action, $resource));
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function adminProvider(): array
    {
        return [
            'read multiplier'  => ['read', 'multiplier'],
            'create supportive' => ['create', 'supportive'],
            'update diverse'    => ['update', 'diverse'],
            'delete supportive' => ['delete', 'supportive'],
            'create audit'     => ['create', 'audit'],
            'update users'     => ['update', 'users'],
            'delete anything'  => ['delete', 'ไม่มี resource นี้จริง'],
        ];
    }

    #[Test]
    #[DataProvider('operatorReadProvider')]
    public function operator_can_read_any_resource(string $resource): void
    {
        self::assertTrue(checkPermission('operator', 'read', $resource));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function operatorReadProvider(): array
    {
        return [
            'multiplier' => ['multiplier'],
            'supportive' => ['supportive'],
            'diverse'    => ['diverse'],
            'audit'      => ['audit'],
            'users'      => ['users'],
        ];
    }

    #[Test]
    #[DataProvider('operatorWriteProvider')]
    public function operator_can_create_and_update_only_hr_resources(string $resource, bool $expected): void
    {
        self::assertSame($expected, checkPermission('operator', 'create', $resource));
        self::assertSame($expected, checkPermission('operator', 'update', $resource));
    }

    /**
     * @return array<string, array{string, bool}>
     */
    public static function operatorWriteProvider(): array
    {
        return [
            'multiplier (allowed)'   => ['multiplier', true],
            'personnel (allowed)'    => ['personnel', true],
            'candidates (allowed)'   => ['candidates', true],
            'probation (allowed)'    => ['probation', true],
            'equivalence (allowed)'  => ['equivalence', true],
            'supportive (allowed)'   => ['supportive', true],
            'diverse (allowed)'      => ['diverse', true],
            'audit (denied)'         => ['audit', false],
            'users (denied)'         => ['users', false],
        ];
    }

    #[Test]
    public function operator_can_edit_equivalence_but_not_approve_it(): void
    {
        // 'equivalence' (แก้ field ปกติ) กับ 'equivalence_approval' (อนุมัติ/ปฏิเสธ)
        // ต้องเป็นคนละ resource — operator แก้ field ได้แต่อนุมัติไม่ได้
        self::assertTrue(checkPermission('operator', 'update', 'equivalence'));
        self::assertFalse(checkPermission('operator', 'update', 'equivalence_approval'));
    }

    #[Test]
    public function admin_can_approve_equivalence(): void
    {
        self::assertTrue(checkPermission('admin', 'update', 'equivalence_approval'));
    }

    #[Test]
    public function operator_can_never_delete_regardless_of_resource(): void
    {
        self::assertFalse(checkPermission('operator', 'delete', 'multiplier'));
        self::assertFalse(checkPermission('operator', 'delete', 'personnel'));
        self::assertFalse(checkPermission('operator', 'delete', 'supportive'));
        self::assertFalse(checkPermission('operator', 'delete', 'diverse'));
    }

    #[Test]
    #[DataProvider('viewerReadProvider')]
    public function viewer_can_read_only_allowed_resources(string $resource, bool $expected): void
    {
        self::assertSame($expected, checkPermission('viewer', 'read', $resource));
    }

    /**
     * @return array<string, array{string, bool}>
     */
    public static function viewerReadProvider(): array
    {
        return [
            'multiplier (allowed)' => ['multiplier', true],
            'dashboard (allowed)'  => ['dashboard', true],
            'supportive (denied)'  => ['supportive', false],
            'diverse (denied)'     => ['diverse', false],
            'audit (denied)'       => ['audit', false],
            'users (denied)'       => ['users', false],
        ];
    }

    #[Test]
    public function viewer_cannot_write_anything(): void
    {
        self::assertFalse(checkPermission('viewer', 'create', 'multiplier'));
        self::assertFalse(checkPermission('viewer', 'update', 'multiplier'));
        self::assertFalse(checkPermission('viewer', 'delete', 'multiplier'));
        self::assertFalse(checkPermission('viewer', 'create', 'supportive'));
        self::assertFalse(checkPermission('viewer', 'update', 'diverse'));
        self::assertFalse(checkPermission('viewer', 'delete', 'supportive'));
    }

    #[Test]
    public function unknown_role_is_always_denied(): void
    {
        self::assertFalse(checkPermission('superadmin', 'read', 'multiplier'));
        self::assertFalse(checkPermission('', 'read', 'multiplier'));
    }

    #[Test]
    public function unknown_action_is_always_denied(): void
    {
        // 'archive' ไม่อยู่ใน permission matrix เลยสักบทบาท
        self::assertFalse(checkPermission('admin', 'archive', 'multiplier'));
    }
}
