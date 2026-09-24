<?php

declare(strict_types=1);

// ============================================================================
// routes/photos.php
// Issue #112: เก็บ/เสิร์ฟ bytes ของรูปจากฐานข้อมูล (TiDB) แทน filesystem
// ของ container — filesystem ของ Render ไม่ persist ข้าม deploy (ADR-0001/0003)
//
// การอ่าน (GET /uploads/{file}) ต้องมี ?exp=&sig= จาก GET /photos/sign (D1) —
// capability URL เดิม (ชื่อไฟล์ CSPRNG อย่างเดียว) ใช้ไม่ได้แล้วหลัง cut over
// ============================================================================

require_once __DIR__ . '/../helpers.php';

/** ชื่อไฟล์รูปที่รับได้ — กัน path traversal (ของจริงคือ photo_<hex32>.<ext> จาก CSPRNG) */
function isValidPhotoFileName(string $name): bool
{
    return (bool) preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/', $name);
}

/** D1: อายุ signed URL รูป (วินาที) */
const PHOTO_URL_TTL_SECONDS = 900;

/**
 * D1: ออก path รูปพร้อมลายเซ็น HMAC — sig ผูกกับชื่อไฟล์ + เวลาหมดอายุ
 * (ไม่เช็กว่าไฟล์มีจริง — endpoint asset ตอบ 404 เอง กัน existence oracle)
 */
function signPhotoUrl(string $fileName, int $issuedAt): string
{
    $exp = $issuedAt + PHOTO_URL_TTL_SECONDS;
    $sig = hash_hmac('sha256', $fileName . '|' . $exp, JWT_SECRET);

    return '/uploads/' . $fileName . '?exp=' . $exp . '&sig=' . $sig;
}

/**
 * D1: ตรวจลายเซ็น + วันหมดอายุ — คืน false ทุกกรณีที่ไม่ผ่าน (caller ตอบ 404 ทรงเดียว)
 */
function verifyPhotoUrl(string $fileName, string $exp, string $sig, int $now): bool
{
    if ($exp === '' || $sig === '' || !ctype_digit($exp) || (int) $exp < $now) {
        return false;
    }

    return hash_equals(hash_hmac('sha256', $fileName . '|' . $exp, JWT_SECRET), $sig);
}

/**
 * บันทึกแถวรูป + bytes ใน transaction เดียว (all-or-nothing)
 *
 * Issue #127: ไม่สร้างแถว photo_versions แล้ว — ของเดิมแทรก thumb_<file> ที่ไม่มี bytes
 * ทำให้ GET /uploads/thumb_<file> 404 เสมอ (โฆษณา asset ที่เข้าไม่ถึง)
 *
 * @return array{photo_id: int}
 */
function storePhotoRecord(PDO $pdo, int $personnelId, string $fileName, string $webPath, string $bytes, string $mime): array
{
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO civil_servant_photos (personnel_id, file_name, file_path, file_data, mime_type, file_size)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$personnelId, $fileName, $webPath, $bytes, $mime, strlen($bytes)]);
        $photoId = (int) $pdo->lastInsertId();

        // รูปล่าสุดต้องเป็น primary เสมอ — กวาด is_primary = 0 ทุกแถวเก่าของบุคลากรนี้
        // (รวมแถวที่ถูก soft-delete ด้วย) ก่อนตั้งแถวใหม่เป็น 1 ใน transaction เดียวกัน
        // เพราะ GET /profile/{id} JOIN ด้วย is_primary = 1 ถ้ามี primary ค้างหลายแถว
        // profile จะได้รูปไม่ตรงหรือได้ null
        $sweep = $pdo->prepare(
            'UPDATE civil_servant_photos SET is_primary = 0 WHERE personnel_id = ? AND photo_id != ?'
        );
        $sweep->execute([$personnelId, $photoId]);

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
 * D1: GET /photos/sign?file={name} — ออก signed URL (JWT อย่างเดียว, ไม่เช็ก existence)
 *
 * @param array<string,mixed>|null $query ใช้ฉีด query จาก test (null = อ่าน $_GET)
 */
function handlePhotoSign(?array $query = null): void
{
    $q = $query ?? $_GET;
    $fileName = (string) ($q['file'] ?? '');
    if (!isValidPhotoFileName($fileName)) {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
        return;
    }

    echo json_encode(['url' => signPhotoUrl($fileName, time())]);
}

/**
 * GET /uploads/{file} — stream รูปจาก DB (แทน static file ที่เคยเสิร์ฟโดย Apache)
 * D1: ต้องมี ?exp=&sig= ที่ถูกต้อง (cut over — capability URL เดิมใช้ไม่ได้แล้ว)
 *
 * @param array<string,mixed>|null $query ใช้ฉีด query จาก test (null = อ่าน $_GET)
 */
function handleUploadsAsset(PDO $pdo, string $method, array $path, ?array $query = null): void
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

    // D1: ตรวจลายเซ็นก่อนแตะ DB — ไม่ผ่านทุกกรณีตอบ 404 ทรงเดียว (กัน oracle)
    $q = $query ?? $_GET;
    if (!verifyPhotoUrl($fileName, (string) ($q['exp'] ?? ''), (string) ($q['sig'] ?? ''), time())) {
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
    header('Cache-Control: private, max-age=900');
    echo $photo['data'];
}
