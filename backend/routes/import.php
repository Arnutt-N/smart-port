<?php

declare(strict_types=1);

// ============================================================================
// routes/import.php
// Endpoint นำเข้าข้อมูล executive จากไฟล์ Excel — admin เท่านั้น
//   POST /import/executive   (multipart, field: file = .xlsx)
// ห่อ ImportService (core ที่เทสต์แยกได้) — ที่นี่จัดการเฉพาะ auth/upload/serialize
// ============================================================================

require_once __DIR__ . '/../ImportService.php';

const IMPORT_MAX_BYTES = 5 * 1024 * 1024;   // 5MB
const IMPORT_RATE_MAX = 10;                  // จำนวนครั้งต่อหน้าต่าง
const IMPORT_RATE_WINDOW_MIN = 15;           // นาที

function handleImport(PDO $pdo, string $method, array $path): void
{
    $user = requireAdmin();
    $userId = (int) ($user['user_id'] ?? 0);
    if ($userId < 1) {
        http_response_code(401);
        echo json_encode(['error' => 'โทเคนไม่สมบูรณ์ กรุณาเข้าสู่ระบบใหม่'], JSON_UNESCAPED_UNICODE);
        return;
    }

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

    // rate limit: นับ import ของ user นี้ในหน้าต่างล่าสุด (กัน abuse/DoS) — pattern เดียวกับ login_attempts
    // cleanup ห่อ try-catch: ถ้า import_log ยังไม่มี/ชั่วคราวล่ม จะไม่ทำให้ทั้ง endpoint 500
    try {
        $pdo->exec('DELETE FROM import_log WHERE imported_at < NOW() - INTERVAL 1 DAY');
    } catch (Throwable $e) {
        error_log('[import] log cleanup skip: ' . $e->getMessage());
    }
    $rl = $pdo->prepare(
        'SELECT COUNT(*) FROM import_log WHERE user_id = ? AND imported_at > NOW() - INTERVAL ' . (int) IMPORT_RATE_WINDOW_MIN . ' MINUTE'
    );
    $rl->execute([$userId]);
    if ((int) $rl->fetchColumn() >= IMPORT_RATE_MAX) {
        http_response_code(429);
        echo json_encode(['error' => 'นำเข้าบ่อยเกินไป กรุณารอสักครู่'], JSON_UNESCAPED_UNICODE);
        return;
    }

    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK
        || !is_uploaded_file((string) ($file['tmp_name'] ?? ''))) {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณาแนบไฟล์ Excel (field: file)'], JSON_UNESCAPED_UNICODE);
        return;
    }

    if (!preg_match('/\.xlsx$/i', (string) ($file['name'] ?? ''))) {
        http_response_code(400);
        echo json_encode(['error' => 'รองรับเฉพาะไฟล์ .xlsx'], JSON_UNESCAPED_UNICODE);
        return;
    }

    // size cap ด้วย filesize จริง (ไม่เชื่อ $_FILES['size'] ที่ client ปลอมได้) — fail-fast ก่อนเปิดไฟล์
    if ((int) filesize($file['tmp_name']) > IMPORT_MAX_BYTES) {
        http_response_code(413);
        echo json_encode(['error' => 'ไฟล์ใหญ่เกิน 5MB'], JSON_UNESCAPED_UNICODE);
        return;
    }

    // magic bytes: .xlsx = ZIP (PK\x03\x04) — กันไฟล์ปลอมนามสกุล
    $fh = fopen($file['tmp_name'], 'rb');
    if ($fh === false) {
        http_response_code(500);
        echo json_encode(['error' => 'ไม่สามารถอ่านไฟล์เพื่อตรวจสอบได้'], JSON_UNESCAPED_UNICODE);
        return;
    }
    $magic = (string) fread($fh, 4);
    fclose($fh);
    if (strlen($magic) < 4 || $magic !== "PK\x03\x04") {
        http_response_code(415);
        echo json_encode(['error' => 'ไฟล์ไม่ใช่ .xlsx ที่ถูกต้อง'], JSON_UNESCAPED_UNICODE);
        return;
    }

    // pre-log attempt ก่อน import — กัน rate-limit bypass (นับทันที) + audit ไว้แม้ import crash
    $logStmt = $pdo->prepare('INSERT INTO import_log (user_id, filename) VALUES (?, ?)');
    $logStmt->execute([$userId, mb_substr((string) ($file['name'] ?? ''), 0, 300)]);
    $logId = (int) $pdo->lastInsertId();

    $result = (new ImportService($pdo))->importFromFile((string) $file['tmp_name']);

    // อัปเดตผลลง audit log (OWASP A09) — ไม่เก็บ citizen_id (PII)
    $pdo->prepare(
        'UPDATE import_log SET personnel_count = ?, is_success = ?, error_summary = ? WHERE log_id = ?'
    )->execute([
        (int) ($result['summary']['personnel'] ?? 0),
        $result['success'] ? 1 : 0,
        $result['success'] ? null : mb_substr(implode(' | ', $result['errors']), 0, 500),
        $logId,
    ]);

    http_response_code($result['success'] ? 200 : 422);
    echo json_encode($result, JSON_UNESCAPED_UNICODE);
}
