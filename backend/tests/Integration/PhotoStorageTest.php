<?php

declare(strict_types=1);

namespace Tests\Integration;

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/photos.php';

/**
 * Issue #112 — regression สำหรับ photo storage ในฐานข้อมูล (แทน ephemeral filesystem):
 * store/fetch roundtrip, missing/inactive/legacy rows → 404 semantics, filename validation
 *
 * cleanup: ลบแถวที่สร้างเองด้วย file_name prefix 'ptest112_' (photo_versions ก่อนเพราะมี FK)
 */
final class PhotoStorageTest extends TestCase
{
    private const NAME_PREFIX = 'ptest112_';

    private static ?\PDO $pdo = null;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            $this->markTestSkipped('database not available');
        }
        $this->cleanup();
    }

    protected function tearDown(): void
    {
        if (self::$pdo !== null) {
            $this->cleanup();
        }
    }

    public function test_store_then_fetch_roundtrip_returns_same_bytes_and_mime(): void
    {
        $bytes = random_bytes(1024);
        $name = self::NAME_PREFIX . 'roundtrip.jpg';

        $stored = storePhotoRecord(self::$pdo, 1, $name, 'uploads/' . $name, $bytes, 'image/jpeg');

        $this->assertGreaterThan(0, $stored['photo_id']);
        $this->assertArrayNotHasKey('versions', $stored);

        // Issue #127: ต้องไม่มีแถว phantom ใน photo_versions (thumb_ ที่ไร้ bytes → 404)
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM photo_versions WHERE photo_id = ?');
        $stmt->execute([$stored['photo_id']]);
        $this->assertSame(0, (int) $stmt->fetchColumn());

        $fetched = fetchActivePhoto(self::$pdo, $name);
        $this->assertNotNull($fetched);
        $this->assertSame($bytes, $fetched['data']);
        $this->assertSame('image/jpeg', $fetched['mime']);

        $stmt = self::$pdo->prepare('SELECT file_size FROM civil_servant_photos WHERE file_name = ?');
        $stmt->execute([$name]);
        $this->assertSame(1024, (int) $stmt->fetchColumn());
    }

    public function test_fetch_missing_file_returns_null(): void
    {
        $this->assertNull(fetchActivePhoto(self::$pdo, self::NAME_PREFIX . 'no_such_file.jpg'));
    }

    public function test_inactive_row_returns_null(): void
    {
        $name = self::NAME_PREFIX . 'inactive.jpg';
        $id = storePhotoRecord(self::$pdo, 1, $name, 'uploads/' . $name, 'x', 'image/jpeg')['photo_id'];
        self::$pdo->prepare('UPDATE civil_servant_photos SET is_active = 0 WHERE photo_id = ?')->execute([$id]);

        $this->assertNull(fetchActivePhoto(self::$pdo, $name));
    }

    public function test_legacy_row_without_bytes_returns_null_404_semantics(): void
    {
        // แถวรุ่นเก่าที่ไฟล์สูญหายจาก ephemeral disk — file_data NULL ต้องเสิร์ฟ 404 (null)
        $name = self::NAME_PREFIX . 'legacy.jpg';
        self::$pdo->prepare(
            'INSERT INTO civil_servant_photos (servant_id, file_name, file_path) VALUES (1, ?, ?)'
        )->execute([$name, 'uploads/' . $name]);

        $this->assertNull(fetchActivePhoto(self::$pdo, $name));
    }

    public function test_duplicate_name_prefers_latest_photo(): void
    {
        $name = self::NAME_PREFIX . 'dup.jpg';
        storePhotoRecord(self::$pdo, 1, $name, 'uploads/' . $name, 'old-bytes', 'image/jpeg');
        storePhotoRecord(self::$pdo, 1, $name, 'uploads/' . $name, 'new-bytes', 'image/jpeg');

        $fetched = fetchActivePhoto(self::$pdo, $name);
        $this->assertSame('new-bytes', $fetched['data']);
    }

    public function test_file_name_validation_rejects_traversal_and_accepts_generated_names(): void
    {
        $this->assertTrue(isValidPhotoFileName('photo_65e1c8a0b1f2a3.45678901.jpg'));
        $this->assertTrue(isValidPhotoFileName('photo_' . str_repeat('0a1b2c3d', 4) . '.jpg')); // CSPRNG shape (#127)
        $this->assertTrue(isValidPhotoFileName('thumb_photo_abc.png'));

        $this->assertFalse(isValidPhotoFileName('../etc/passwd'));
        $this->assertFalse(isValidPhotoFileName('a/b.jpg'));
        $this->assertFalse(isValidPhotoFileName(''));
        $this->assertFalse(isValidPhotoFileName('.hidden'));
        $this->assertFalse(isValidPhotoFileName(str_repeat('x', 300)));
    }

    private function cleanup(): void
    {
        $like = self::NAME_PREFIX . '%';
        self::$pdo->prepare(
            "DELETE FROM photo_versions WHERE photo_id IN (SELECT photo_id FROM civil_servant_photos WHERE file_name LIKE ?)"
        )->execute([$like]);
        self::$pdo->prepare('DELETE FROM civil_servant_photos WHERE file_name LIKE ?')->execute([$like]);
    }
}
