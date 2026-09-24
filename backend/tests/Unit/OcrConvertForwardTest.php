<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/ocr.php';

/**
 * M5 + L12: OCR convert สตรีม body + timeout 600 + ส่งต่อเฉพาะ 2xx
 * (ไม่มี behavioral test ผ่าน curl จริง — ต้อง stub upstream + requirePermission exit;
 *  บันทึกเหตุผลไว้ใน PR)
 */
final class OcrConvertForwardTest extends TestCase
{
    #[Test]
    public function forward_decision_is_true_only_for_2xx(): void
    {
        foreach ([200, 201, 204, 299] as $code) {
            self::assertTrue(ocrShouldForwardBody($code), "code {$code}");
        }
        foreach ([0, 199, 300, 404, 500] as $code) {
            self::assertFalse(ocrShouldForwardBody($code), "code {$code}");
        }
    }

    #[Test]
    public function convert_timeout_is_600_seconds(): void
    {
        self::assertSame(600, OCR_CONVERT_TIMEOUT_SECONDS);
        self::assertSame(50 * 1024 * 1024, OCR_CONVERT_MAX_BYTES);
    }

    #[Test]
    public function convert_streams_upload_and_gates_forwarding(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/ocr.php');
        $start = strpos($src, "if (\$method === 'POST' && \$sub === 'convert')");
        self::assertNotFalse($start);
        $slice = substr($src, $start, 4000);

        // สตรีม ไม่ใช่ full-memory read
        self::assertStringContainsString('CURLOPT_READFUNCTION', $slice);
        self::assertStringContainsString('fclose($uploadFh)', $slice);
        self::assertStringContainsString('CURLOPT_TIMEOUT => OCR_CONVERT_TIMEOUT_SECONDS', $slice);
        self::assertStringNotContainsString('CURLOPT_POSTFIELDS => $pdfBytes', $slice);
        // magic check 5-byte แรกต้องยังอยู่ (กันลบผิด)
        self::assertStringContainsString("file_get_contents(\$file['tmp_name'], false, null, 0, 5)", $slice);
        // L12: ส่งต่อเฉพาะ 2xx
        self::assertStringContainsString('ocrShouldForwardBody($code)', $slice);
    }
}
