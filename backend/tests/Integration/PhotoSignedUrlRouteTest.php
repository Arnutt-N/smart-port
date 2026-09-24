<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

putenv('JWT_SECRET=d1-photo-sign-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/photos.php';

/**
 * T-D1.1 — sign → เปิดรูปด้วย URL ที่เซ็น (DB จริง) + cut over (เปิดตรงต้อง 404).
 *
 * cleanup: ลบแถวที่สร้างเองด้วย file_name prefix 'psign_'
 */
final class PhotoSignedUrlRouteTest extends TestCase
{
    private const NAME_PREFIX = 'psign_';

    private static ?PDO $pdo = null;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('database not available');
        }
        http_response_code(200);
        $this->cleanup();
    }

    protected function tearDown(): void
    {
        http_response_code(200);
        if (self::$pdo !== null) {
            $this->cleanup();
        }
    }

    #[Test]
    public function signed_url_opens_stored_bytes(): void
    {
        $bytes = random_bytes(512);
        $name = self::NAME_PREFIX . 'open.jpg';
        storePhotoRecord(self::$pdo, 1, $name, 'uploads/' . $name, $bytes, 'image/jpeg');

        $signed = $this->sign($name);
        self::assertSame(200, http_response_code());

        http_response_code(200);
        ob_start();
        handleUploadsAsset(self::$pdo, 'GET', ['uploads', $name], $signed);
        $out = (string) ob_get_clean();

        self::assertSame(200, http_response_code());
        self::assertSame($bytes, $out);
    }

    #[Test]
    public function direct_open_without_signature_is_404(): void
    {
        $name = self::NAME_PREFIX . 'direct.jpg';
        storePhotoRecord(self::$pdo, 1, $name, 'uploads/' . $name, random_bytes(64), 'image/jpeg');

        http_response_code(200);
        ob_start();
        handleUploadsAsset(self::$pdo, 'GET', ['uploads', $name], []);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(404, http_response_code());
        self::assertSame('Not found', $body['error'] ?? null);
    }

    #[Test]
    public function tampered_and_expired_signatures_are_404(): void
    {
        $name = self::NAME_PREFIX . 'tamper.jpg';
        storePhotoRecord(self::$pdo, 1, $name, 'uploads/' . $name, random_bytes(64), 'image/jpeg');
        $signed = $this->sign($name);

        foreach ([
            ['exp' => $signed['exp'], 'sig' => str_repeat('0', 64)],
            ['exp' => (string) (time() - 10), 'sig' => $signed['sig']],
        ] as $query) {
            http_response_code(200);
            ob_start();
            handleUploadsAsset(self::$pdo, 'GET', ['uploads', $name], $query);
            $body = json_decode((string) ob_get_clean(), true);

            self::assertSame(404, http_response_code());
            self::assertSame('Not found', $body['error'] ?? null);
        }
    }

    /**
     * @return array{exp:string, sig:string}
     */
    private function sign(string $name): array
    {
        http_response_code(200);
        ob_start();
        handlePhotoSign(['file' => $name]);
        $body = json_decode((string) ob_get_clean(), true);
        parse_str((string) parse_url((string) ($body['url'] ?? ''), PHP_URL_QUERY), $qs);

        return ['exp' => (string) $qs['exp'], 'sig' => (string) $qs['sig']];
    }

    private function cleanup(): void
    {
        self::$pdo->prepare('DELETE FROM civil_servant_photos WHERE file_name LIKE ?')
            ->execute([self::NAME_PREFIX . '%']);
    }
}
