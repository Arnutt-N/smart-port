<?php
// ============================================================================
// routes/candidates.php
// Candidate List Route Handler
// จัดการเส้นทาง API สำหรับบัญชีรายชื่อผู้มีคุณสมบัติเลื่อนระดับ
//
// Endpoints:
//   GET /candidates/overview                 — สรุปภาพรวมทุกระดับ (ทั่วไป + วิชาการ) จาก full dataset
//   GET /candidates/{targetLevel}            — รายชื่อบุคลากรพร้อมสถานะคุณสมบัติ
//   GET /candidates/{targetLevel}/{id}       — รายละเอียดคุณสมบัติรายบุคคล
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../QualificationEngine.php';

/**
 * จัดการ request สำหรับ candidate list endpoints
 *
 * @param PDO $pdo Database connection
 * @param string $method HTTP method
 * @param array $path URL path segments
 */
function handleCandidates(PDO $pdo, string $method, array $path): void
{
    // เฉพาะ GET เท่านั้น
    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    // GET /candidates/overview — สรุปภาพรวมทุกระดับ (ต้องเช็คก่อน treat path[1] เป็น targetLevel)
    if (strtolower($path[1] ?? '') === 'overview') {
        $engine = new QualificationEngine($pdo);
        echo json_encode($engine->computeOverview());
        return;
    }

    // ต้องระบุระดับเป้าหมาย เช่น /candidates/K2
    $targetLevel = $path[1] ?? null;
    if (!$targetLevel) {
        http_response_code(400);
        echo json_encode(['error' => 'Target level is required (e.g., /candidates/K2)']);
        return;
    }

    // ตรวจสอบว่าเป็นระดับเป้าหมายที่ถูกต้อง
    $validTargets = ['K2', 'K3', 'K4', 'O2', 'O3', 'M1', 'M2', 'S1', 'S2'];
    if (!in_array(strtoupper($targetLevel), $validTargets)) {
        http_response_code(400);
        echo json_encode([
            'error' => "Invalid target level: {$targetLevel}. Valid targets: " . implode(', ', $validTargets)
        ]);
        return;
    }

    $targetLevel = strtoupper($targetLevel);
    $engine = new QualificationEngine($pdo);

    // ตรวจสอบว่ามี personnel_id หรือไม่
    $personnelId = $path[2] ?? null;

    if ($personnelId !== null) {
        // รายละเอียดรายบุคคล: GET /candidates/K2/1
        $result = $engine->computeDetail($targetLevel, intval($personnelId));
        if ($result === null) {
            http_response_code(404);
            echo json_encode(['error' => 'Personnel not found']);
            return;
        }
        echo json_encode($result);
    } else {
        // รายชื่อทั้งหมด: GET /candidates/K2?search=&limit=20&offset=0
        $search = $_GET['search'] ?? '';
        $limit = intval($_GET['limit'] ?? 20);
        $offset = intval($_GET['offset'] ?? 0);

        $result = $engine->computeForLevel($targetLevel, $search, $limit, $offset);
        echo json_encode($result);
    }
}
