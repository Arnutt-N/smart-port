<?php

declare(strict_types=1);

// ============================================================================
// routes/import.php
// Endpoint นำเข้าข้อมูล executive จากไฟล์ Excel — admin เท่านั้น
//   POST /import/executive   (multipart, field: file = .xlsx)
// ห่อ ImportService (core ที่เทสต์แยกได้) — ที่นี่จัดการเฉพาะ auth/upload/serialize
// ============================================================================

require_once __DIR__ . '/../ImportService.php';

function handleImport(PDO $pdo, string $method, array $path): void
{
    requireAdmin();

    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    if (($path[1] ?? '') !== 'executive') {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
        return;
    }

    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณาแนบไฟล์ Excel (field: file)'], JSON_UNESCAPED_UNICODE);
        return;
    }

    if (!preg_match('/\.xlsx$/i', (string) ($file['name'] ?? ''))) {
        http_response_code(400);
        echo json_encode(['error' => 'รองรับเฉพาะไฟล์ .xlsx'], JSON_UNESCAPED_UNICODE);
        return;
    }

    $result = (new ImportService($pdo))->importFromFile((string) $file['tmp_name']);

    http_response_code($result['success'] ? 200 : 422);
    echo json_encode($result, JSON_UNESCAPED_UNICODE);
}
