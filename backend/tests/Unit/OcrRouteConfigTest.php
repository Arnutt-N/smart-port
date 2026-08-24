<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/ocr.php';

/**
 * Issue #147 — เมื่อไม่ได้ตั้ง OCR_SERVER_URL ต้องตอบ 503 ชัดเจนว่า "ยังไม่ได้ติดตั้ง"
 * ไม่ใช่ปล่อยให้ curl ไปชน localhost ของ container เองแล้วล้มเหลวแบบที่ผู้ใช้อ่านไม่ออก
 * ("ไม่รู้" ต้องไม่กลายเป็น "สะอาด") — ครอบคลุมทั้ง GET /ocr/health และ POST /ocr/convert
 */
final class OcrRouteConfigTest extends TestCase
{
    protected function setUp(): void
    {
        // เริ่มจากสภาพไม่มีตัวแปรทุกเคส กัน env ของเครื่อง dev ปนเข้ามา
        putenv('OCR_SERVER_URL');
    }

    protected function tearDown(): void
    {
        putenv('OCR_SERVER_URL');
        // http_response_code() เป็น process-global — reset กัน test ถัดไป false-pass
        http_response_code(200);
    }

    #[Test]
    public function base_url_is_null_when_env_unset(): void
    {
        self::assertNull(ocrServerBaseUrl());
    }

    #[Test]
    public function base_url_is_null_when_env_is_blank(): void
    {
        foreach (['', '   ', "\t"] as $blank) {
            putenv("OCR_SERVER_URL=$blank");
            self::assertNull(ocrServerBaseUrl());
        }
    }

    #[Test]
    public function base_url_trims_whitespace_and_trailing_slash(): void
    {
        putenv('OCR_SERVER_URL= http://ocr:8100/ ');
        self::assertSame('http://ocr:8100', ocrServerBaseUrl());
    }

    #[Test]
    public function not_configured_emits_503_with_documented_shape(): void
    {
        ob_start();
        try {
            respondOcrNotConfigured();
        } finally {
            $output = (string) ob_get_clean();
        }

        self::assertSame(503, http_response_code());

        $json = json_decode($output, true);
        self::assertIsArray($json);
        self::assertSame('ยังไม่ได้ติดตั้งบริการแปลงเอกสาร (OCR)', $json['error']);
        self::assertSame('OCR_NOT_CONFIGURED', $json['code']);
        self::assertArrayHasKey('message', $json);
    }
}
