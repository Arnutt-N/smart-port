<?php
// ============================================================================
// helpers.php
// Shared utility functions for Smart Port API
// ฟังก์ชันช่วยเหลือที่ใช้ร่วมกันระหว่าง candidate list และ probation endpoints
// ============================================================================

/** โฟลเดอร์ที่เสิร์ฟรูปผ่านเว็บ — สัมพัทธ์กับ document root ของ backend */
const PHOTO_WEB_DIR = 'uploads';

/** Username: 3–64 chars, letters/digits/dot/underscore/hyphen */
const USERNAME_PATTERN = '/^[A-Za-z0-9._-]{3,64}$/';

function isValidUsername(string $username): bool
{
    return (bool) preg_match(USERNAME_PATTERN, $username);
}

/**
 * ตอบ 405 พร้อม JSON body — ใช้กับ route ที่รองรับเฉพาะบาง method
 *
 * ถ้าไม่ตอบอะไรเลย client จะได้ HTTP 200 + body ว่าง ทั้งที่ header เป็น JSON
 * ทำให้ response.json() ฝั่ง frontend โยน SyntaxError แทนข้อความ error ที่อ่านรู้เรื่อง
 */
function respondMethodNotAllowed(): void
{
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}

/**
 * แปลงค่าใน civil_servant_photos.file_path ให้เป็น path สำหรับเสิร์ฟผ่านเว็บ
 *
 * แถวรุ่นเก่าเก็บ path ของ filesystem ทั้งเส้น (เช่น /var/www/html/uploads/x.jpg)
 * ซึ่งพอส่งให้ <img src> ตรง ๆ เบราว์เซอร์จะยิงไปที่โดเมนหน้าเว็บแล้วได้ 404 เสมอ
 * ฟังก์ชันนี้ตัดเหลือชื่อไฟล์แล้วประกอบใหม่ จึงรองรับทั้งค่ารุ่นเก่าและรุ่นใหม่
 *
 * @param string|null $storedPath ค่าที่อ่านจากคอลัมน์ file_path
 * @return string|null path สัมพัทธ์ เช่น "uploads/photo_abc.jpg" หรือ null ถ้าไม่มีรูป
 */
function photoWebPath(?string $storedPath): ?string
{
    if ($storedPath === null || trim($storedPath) === '') {
        return null;
    }

    // รองรับทั้ง separator แบบ POSIX และ Windows แล้วเหลือเฉพาะชื่อไฟล์ (กัน path traversal)
    $fileName = basename(str_replace('\\', '/', trim($storedPath)));
    if ($fileName === '' || $fileName === '.' || $fileName === '..') {
        return null;
    }

    return PHOTO_WEB_DIR . '/' . $fileName;
}

/**
 * แปลงวันที่เป็นรูปแบบไทย (พ.ศ.)
 * Convert date string to Thai format with Buddhist Era year
 *
 * @param string|null $dateStr Date string in Y-m-d format (e.g. "2026-03-22")
 * @return string|null Thai formatted date (e.g. "22 มี.ค. 2569") or null
 */
function formatThaiDate(?string $dateStr): ?string
{
    if ($dateStr === null || $dateStr === '') {
        return null;
    }

    $thaiMonths = [
        '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];

    $timestamp = strtotime($dateStr);
    if ($timestamp === false) {
        return null;
    }

    $day = (int) date('j', $timestamp);
    $month = (int) date('n', $timestamp);
    $year = (int) date('Y', $timestamp) + 543; // พ.ศ. = ค.ศ. + 543

    return "{$day} {$thaiMonths[$month]} {$year}";
}

/**
 * แปลงรหัสระดับเป็นชื่อภาษาไทย
 * Convert level code to Thai level name
 *
 * @param string $code Level code (e.g. "K1", "O2")
 * @return string Thai level name or the code itself if not found
 */
function getLevelName(string $code): string
{
    $levelNames = [
        'K1' => 'ปฏิบัติการ',
        'K2' => 'ชำนาญการ',
        'K3' => 'ชำนาญการพิเศษ',
        'K4' => 'เชี่ยวชาญ',
        'K5' => 'ทรงคุณวุฒิ',
        'O1' => 'ปฏิบัติงาน',
        'O2' => 'ชำนาญงาน',
        'O3' => 'อาวุโส',
        'M1' => 'อำนวยการ ต้น',
        'M2' => 'อำนวยการ สูง',
        'S1' => 'บริหาร ต้น',
        'S2' => 'บริหาร สูง',
    ];

    return $levelNames[$code] ?? $code;
}

/**
 * Create photo version records in the application layer instead of a DB routine.
 *
 * @param PDO $pdo
 * @param int $photoId
 * @param string|null $fileName
 * @return array<int, array<string, mixed>>
 */
function createPhotoVersions(PDO $pdo, int $photoId, ?string $fileName = null): array
{
    if ($photoId <= 0) {
        throw new InvalidArgumentException('Photo id is required');
    }

    if ($fileName === null || $fileName === '') {
        $stmt = $pdo->prepare('SELECT file_name FROM civil_servant_photos WHERE photo_id = ?');
        $stmt->execute([$photoId]);
        $fileName = $stmt->fetchColumn() ?: '';
    }

    if ($fileName === '') {
        throw new RuntimeException('Photo file name not found');
    }

    $thumbnailFileName = 'thumb_' . $fileName;

    $deleteStmt = $pdo->prepare('DELETE FROM photo_versions WHERE photo_id = ? AND version_type = ?');
    $deleteStmt->execute([$photoId, 'thumbnail']);

    $insertStmt = $pdo->prepare(
        'INSERT INTO photo_versions (photo_id, version_type, file_name) VALUES (?, ?, ?)'
    );
    $insertStmt->execute([$photoId, 'thumbnail', $thumbnailFileName]);

    return [[
        'version_type' => 'thumbnail',
        'file_name' => $thumbnailFileName,
    ]];
}

/**
 * Sanitize text input to prevent XSS
 *
 * @param string|null $input Raw user input
 * @return string|null Sanitized text with all HTML tags stripped
 */
function sanitizeText(?string $input): ?string
{
    if ($input === null || $input === '') {
        return $input;
    }
    // Strip all HTML tags
    return strip_tags($input);
}

/**
 * Sanitize HTML input (allow safe tags only)
 *
 * @param string|null $input Raw HTML input
 * @return string|null HTML with only safe tags allowed
 */
function sanitizeHtml(?string $input): ?string
{
    if ($input === null || $input === '') {
        return $input;
    }
    // Allow only safe formatting tags
    $allowedTags = '<p><br><strong><em><ul><ol><li>';
    return strip_tags($input, $allowedTags);
}

/**
 * ตรวจว่า personnel_id มีอยู่จริง (soft-link enforcement แทน FK)
 */
function personnelExists(PDO $pdo, int $personnelId): bool
{
    if ($personnelId <= 0) {
        return false;
    }
    $stmt = $pdo->prepare('SELECT 1 FROM personnel WHERE personnel_id = ? LIMIT 1');
    $stmt->execute([$personnelId]);
    return (bool) $stmt->fetchColumn();
}
