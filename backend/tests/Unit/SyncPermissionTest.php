<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../authz.php';

/**
 * N32 — GET /sync/status ต้องใช้ read:sync ไม่ใช่ create:sync
 * ล็อก default matrix ที่ route fix อ้างอิง: admin/operator อ่าน sync ได้
 * (read = ['*']) ส่วน viewer ไม่มี sync ใน read list → 403 เหมือนเดิม
 */
final class SyncPermissionTest extends TestCase
{
    #[Test]
    public function admin_and_operator_can_read_sync_by_default(): void
    {
        self::assertTrue(checkPermissionDefault('admin', 'read', 'sync'));
        self::assertTrue(checkPermissionDefault('operator', 'read', 'sync'));
        self::assertTrue(checkPermissionDefault('superadmin', 'read', 'sync'));
    }

    #[Test]
    public function viewer_cannot_read_or_create_sync_by_default(): void
    {
        self::assertFalse(checkPermissionDefault('viewer', 'read', 'sync'));
        self::assertFalse(checkPermissionDefault('viewer', 'create', 'sync'));
    }

    #[Test]
    public function operator_cannot_trigger_sync_by_default(): void
    {
        // POST /sync ยังเป็น create:sync — operator ไม่มีสิทธิ์ trigger
        self::assertFalse(checkPermissionDefault('operator', 'create', 'sync'));
    }
}
