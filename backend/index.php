<?php

declare(strict_types=1);

// ============================================================================
// Health endpoint (`GET /`) — ใช้เป็น healthCheckPath ของ Render
//
// นอกจากบอกว่า API ยังมีชีวิต ยังรายงานว่า image นี้มีไฟล์ migration ติดมาด้วยไหม
// เพราะ production เคยอยู่ในสภาพที่ image ไม่มี migration เลย (build จาก backend/
// ซึ่ง database/ อยู่นอก build context) แล้ว schema ค้างรุ่นเก่าโดยไม่มีสัญญาณอะไร
//
// ตั้งใจไม่แตะ database และไม่ include config.php:
//   - config.php exit 500 เมื่อ JWT_SECRET ไม่ได้ตั้ง และ getDB() exit 503 เมื่อต่อ DB ไม่ได้
//   - health check ที่ล้มตาม DB จะทำให้ Render รีสตาร์ท service ที่ยังทำงานได้อยู่
// รายงานแค่จำนวน ไม่บอกชื่อตาราง — endpoint นี้เปิดสาธารณะ
// ============================================================================

header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/scripts/migration-lib.php';

$response = [
    'status' => 'success',
    'message' => 'Smart Port API is running.',
];

try {
    $response['migrations_available'] = count(listMigrationFiles(migrationDirectory()));
} catch (Throwable $e) {
    // image ถูก build โดยไม่ได้ copy database/ เข้ามา — ดู render.yaml
    $response['migrations_available'] = 0;
    $response['migrations_note'] = 'migrations not bundled in this image';
}

echo json_encode($response, JSON_UNESCAPED_UNICODE);
