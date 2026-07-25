<?php
declare(strict_types=1);

/**
 * POST /ocr/convert — upload PDF, forward to document-ocr FastAPI server.
 * GET  /ocr/health  — check OCR server availability.
 */
function handleOcr(PDO $pdo, string $method, array $path): void
{
    $ocrBase = rtrim(getenv('OCR_SERVER_URL') ?: 'http://127.0.0.1:8100', '/');

    $sub = $path[1] ?? '';

    if ($method === 'GET' && $sub === 'health') {
        $ch = curl_init("$ocrBase/health");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        http_response_code($code ?: 502);
        echo $body ?: json_encode(['error' => 'OCR server unreachable']);
        return;
    }

    if ($method === 'POST' && $sub === 'convert') {
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

        $maxSize = 50 * 1024 * 1024; // 50 MB
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

        $pdfBytes = file_get_contents($file['tmp_name']);
        $filename = basename($file['name']);

        $ch = curl_init("$ocrBase/convert");
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $pdfBytes,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/octet-stream',
                "X-Filename: $filename",
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 3600,
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($body === false || $code === 0) {
            http_response_code(502);
            echo json_encode(['error' => 'OCR server unreachable', 'detail' => $err]);
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
