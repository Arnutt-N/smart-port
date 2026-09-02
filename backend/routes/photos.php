<?php

declare(strict_types=1);

// ============================================================================
// routes/photos.php
// Issue #112: เก็บ/เสิร์ฟ bytes ของรูปจากฐานข้อมูล (TiDB) แทน filesystem
// ของ container — filesystem ของ Render ไม่ persist ข้าม deploy (ADR-0001/0003)
//
// การอ่าน (GET /uploads/{file}) เป็น public เหมือนเดิมที่ Apache เคยเสิร์ฟ static —
// ชื่อไฟล์สร้างจาก CSPRNG (เดาไม่ได้) จึงทำหน้าที่เป็น capability URL
// ============================================================================

require_once __DIR__ . '/../helpers.php';

/** ชื่อไฟล์รูปที่รับได้ — กัน path traversal (ของจริงคือ photo_<hex32>.<ext> จาก CSPRNG) */
function isValidPhotoFileName(string $name): bool
{
    return (bool) preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/', $name);
}

/**
 * บันทึกแถวรูป + bytes ใน transaction เดียว (all-or-nothing)
 *
 * Issue #127: ไม่สร้างแถว photo_versions แล้ว — ของเดิมแทรก thumb_<file> ที่ไม่มี bytes
 * ทำให้ GET /uploads/thumb_<file> 404 เสมอ (โฆษณา asset ที่เข้าไม่ถึง)
 *
 * @return array{photo_id: int}
 */
function storePhotoRecord(PDO $pdo, int $servantId, string $fileName, string $webPath, string $bytes, string $mime): array
{
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO civil_servant_photos (servant_id, file_name, file_path, file_data, mime_type, file_size)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$servantId, $fileName, $webPath, $bytes, $mime, strlen($bytes)]);
        $photoId = (int) $pdo->lastInsertId();

        // รูปล่าสุดต้องเป็น primary เสมอ — กวาด is_primary = 0 ทุกแถวเก่าของ servant นี้
        // (รวมแถวที่ถูก soft-delete ด้วย) ก่อนตั้งแถวใหม่เป็น 1 ใน transaction เดียวกัน
        // เพราะ GET /profile/{id} JOIN ด้วย is_primary = 1 ถ้ามี primary ค้างหลายแถว
        // profile จะได้รูปไม่ตรงหรือได้ null
        $sweep = $pdo->prepare(
            'UPDATE civil_servant_photos SET is_primary = 0 WHERE servant_id = ? AND photo_id != ?'
        );
        $sweep->execute([$servantId, $photoId]);

        $setPrimary = $pdo->prepare('UPDATE civil_servant_photos SET is_primary = 1 WHERE photo_id = ?');
        $setPrimary->execute([$photoId]);

        $pdo->commit();

        return ['photo_id' => $photoId];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/**
 * อ่าน bytes ของรูป active จากชื่อไฟล์
 *
 * @return array{data: string, mime: string}|null null = ไม่พบ/inactive/แถวเก่าที่ไฟล์สูญหาย (file_data NULL)
 */
function fetchActivePhoto(PDO $pdo, string $fileName): ?array
{
    $stmt = $pdo->prepare(
        'SELECT file_data, mime_type FROM civil_servant_photos
         WHERE file_name = ? AND is_active = 1
         ORDER BY photo_id DESC LIMIT 1'
    );
    $stmt->execute([$fileName]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row === false || $row['file_data'] === null) {
        return null;
    }
    return [
        'data' => (string) $row['file_data'],
        'mime' => (string) ($row['mime_type'] ?: 'application/octet-stream'),
    ];
}

/**
 * GET /uploads/{file} — stream รูปจาก DB (แทน static file ที่เคยเสิร์ฟโดย Apache)
 * public เหมือนเดิม (<img> ไม่ส่ง Authorization header)
 */
function handleUploadsAsset(PDO $pdo, string $method, array $path): void
{
    if ($method !== 'GET') {
        respondMethodNotAllowed();
        return;
    }

    $fileName = basename((string) ($path[1] ?? ''));
    if (!isValidPhotoFileName($fileName)) {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
        return;
    }

    $photo = fetchActivePhoto($pdo, $fileName);
    if ($photo === null) {
        // log เฉพาะ file_name (CSPRNG-generated, ไม่มี PII) — ใช้ตามหา missing objects
        error_log('[photos] asset not found or inactive: ' . $fileName);
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
        return;
    }

    header('Content-Type: ' . $photo['mime']);
    header('Content-Length: ' . strlen($photo['data']));
    header('Cache-Control: private, max-age=86400');
    echo $photo['data'];
}
