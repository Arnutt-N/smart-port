<?php

declare(strict_types=1);

include_once __DIR__ . '/../authz.php';
include_once __DIR__ . '/../helpers.php';

/**
 * Issue #147 — คืน null เมื่อไม่ได้ตั้ง OCR_SERVER_URL
 * ห้าม fallback เป็น 127.0.0.1:8100 เพราะทำให้ "ยังไม่ได้ติดตั้ง" กับ "ติดตั้งแล้วพัง"
 * ให้ผลหน้าจอเหมือนกัน (curl ชน localhost ของ container เอง) — "ไม่รู้" ต้องไม่กลายเป็น "สะอาด"
 */
function ocrServerBaseUrl(): ?string
{
    $raw = getenv('OCR_SERVER_URL');
    if ($raw === false || trim($raw) === '') {
        return null;
    }
    return rtrim(trim($raw), '/');
}

/** 503 พร้อมข้อความที่ผู้ใช้อ่านรู้เรื่อง — ใช้ร่วมทั้ง /health และ /convert */
function respondOcrNotConfigured(): void
{
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'ยังไม่ได้ติดตั้งบริการแปลงเอกสาร (OCR)',
        'message' => 'ฟีเจอร์นี้ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
        'code' => 'OCR_NOT_CONFIGURED',
    ]);
}

/**
 * Shared secret สำหรับ OCR service (public URL บน Render) — ส่งเป็น header
 * X-OCR-Secret ทุกคำขอถ้าตั้ง OCR_SHARED_SECRET ไว้ (convert_server ปฏิเสธ 401 ถ้าไม่ตรง)
 * @return string[] curl headers เพิ่มเติม (ว่างเมื่อไม่ได้ตั้ง secret)
 */
function ocrSecretHeaders(): array
{
    $secret = getenv('OCR_SHARED_SECRET');
    if ($secret === false || trim($secret) === '') {
        return [];
    }
    return ['X-OCR-Secret: ' . trim($secret)];
}

/**
 * POST /ocr/convert — upload PDF, forward to document-ocr FastAPI server.
 * GET  /ocr/health  — check OCR server availability.
 */
const OCR_CONVERT_TIMEOUT_SECONDS = 600;
const OCR_CONVERT_MAX_BYTES = 50 * 1024 * 1024;

/**
 * ส่งต่อ body จาก upstream เฉพาะ 2xx — status อื่น sanitize + generic 502 (กัน info leak)
 */
function ocrShouldForwardBody(int $code): bool
{
    return $code >= 200 && $code < 300;
}

function handleOcr(PDO $pdo, string $method, array $path): void
{
    $sub = $path[1] ?? '';

    if ($method === 'GET' && $sub === 'health') {
        requirePermission('read', 'ocr');
        $ocrBase = ocrServerBaseUrl();
        if ($ocrBase === null) {
            respondOcrNotConfigured();
            return;
        }
        $ch = curl_init("$ocrBase/health");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_HTTPHEADER => array_merge(
                ['Content-Type: application/json'],
                ocrSecretHeaders()
            ),
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        http_response_code($code ?: 502);
        header('Content-Type: application/json');
        echo $body ?: json_encode(['error' => 'OCR server unreachable']);
        return;
    }

    if ($method === 'POST' && $sub === 'convert') {
        requirePermission('create', 'ocr');
        $ocrBase = ocrServerBaseUrl();
        if ($ocrBase === null) {
            respondOcrNotConfigured();
            return;
        }
        if (!isset($_FILES['file'])) {
            http_response_code(422);
            echo json_encode(['error' => 'Missing file upload (field: file)']);
            return;
        }

        $file = $_FILES['file'];
        if ($file['error'] !== UPLOAD_ERR_OK) {
            http_response_code(422);
            echo json_encode(['error' => 'Upload failed', 'code' => $file['error']]);
            return;
        }

        $maxSize = OCR_CONVERT_MAX_BYTES; // 50 MB
        if (filesize($file['tmp_name']) > $maxSize) {
            http_response_code(422);
            echo json_encode(['error' => 'File too large (max 50 MB)']);
            return;
        }

        $header = file_get_contents($file['tmp_name'], false, null, 0, 5);
        if ($header !== '%PDF-') {
            http_response_code(422);
            echo json_encode(['error' => 'Not a valid PDF file']);
            return;
        }

        // สตรีม body ตรงจากไฟล์ (ไม่โหลดทั้ง 50MB เข้า memory ต่อ request)
        $uploadSize = filesize($file['tmp_name']);
        $uploadFh = fopen($file['tmp_name'], 'rb');
        if ($uploadFh === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Upload failed']);
            return;
        }
        // strip CR/LF ก่อนเข้า header — ชื่อไฟล์ที่ฝัง \r\n ฉีด header เข้า upstream ได้
        $filename = str_replace(["\r", "\n"], '', basename($file['name']));

        $ch = curl_init("$ocrBase/convert");
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDSIZE => $uploadSize,
            CURLOPT_READFUNCTION => static function ($ch, $fd, int $length) use ($uploadFh) {
                $d = fread($uploadFh, $length);
                return $d === false ? '' : $d;
            },
            CURLOPT_HTTPHEADER => array_merge(
                [
                    'Content-Type: application/octet-stream',
                    "X-Filename: $filename",
                ],
                ocrSecretHeaders()
            ),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => OCR_CONVERT_TIMEOUT_SECONDS,
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        fclose($uploadFh);

        if ($body === false || $code === 0) {
            // F29: รายละเอียด error ของ upstream ไม่ควรกลับไปถึง client (info leak) —
            // ลง error_log ฝั่ง server เท่านั้น (sanitize ก่อน ตาม Issue #122)
            error_log('[ocr] convert unreachable: ' . sanitizeLogValue($err));
            http_response_code(502);
            echo json_encode(['error' => 'OCR server unreachable']);
            return;
        }

        if (!ocrShouldForwardBody($code)) {
            error_log('[ocr] convert bad status ' . $code . ': ' . sanitizeLogValue(substr((string) $body, 0, 200)));
            http_response_code(502);
            echo json_encode(['error' => 'OCR conversion failed']);
            return;
        }

        http_response_code($code);
        header('Content-Type: application/json');
        echo $body;
        return;
    }

    http_response_code(404);
    echo json_encode(['error' => 'Not found. Use POST /ocr/convert or GET /ocr/health']);
}
