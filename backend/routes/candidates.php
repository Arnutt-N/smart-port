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
include_once __DIR__ . '/../authz.php';
include_once __DIR__ . '/../QualificationEngine.php';
include_once __DIR__ . '/personnel.php';

/**
 * N23: test hook — pattern เดียวกับ routes/settings.php (array_key_exists
 * เพื่อให้ฉีด null = unauthenticated ได้ ไม่ตกทะลุ getAuthenticatedUser)
 */
function resolveCandidatesUser(): ?array
{
    if (array_key_exists('__auth_user', $GLOBALS)) {
        $u = $GLOBALS['__auth_user'];
        return is_array($u) ? $u : null;
    }
    return getAuthenticatedUser();
}

/**
 * จัดการ request สำหรับ candidate list endpoints
 *
 * N23: $authUser/$query สำหรับ integration test (null = resolve/อ่าน $_GET ตามเดิม)
 *
 * @param PDO $pdo Database connection
 * @param string $method HTTP method
 * @param array $path URL path segments
 * @param array{user_id?:int|string, role?:string}|null $authUser
 * @param array<string,mixed>|null $query
 */
function handleCandidates(PDO $pdo, string $method, array $path, ?array $authUser = null, ?array $query = null): void
{
    // เฉพาะ GET เท่านั้น
    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    $user = $authUser ?? resolveCandidatesUser();
    // N23: เดิม requirePermission exit จะฆ่า PHPUnit — ใช้ evaluate + return
    // contract เดิม (401/403/503 + body) คงไว้ทุกประการ
    $denied = evaluatePermissionAccess('read', 'candidates', $user, $pdo);
    if ($denied !== null) {
        http_response_code($denied['status']);
        echo json_encode($denied['body']);
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
        $role = (string) ($user['role'] ?? '');
        $result['data'] = redactPersonnelCitizenIdForRole($result['data'], $role);
        echo json_encode($result);
    } else {
        // รายชื่อทั้งหมด: GET /candidates/K2?search=&limit=20&offset=0
        $q = $query ?? $_GET;
        $search = $q['search'] ?? '';
        $limit = intval($q['limit'] ?? 20);
        $offset = intval($q['offset'] ?? 0);

        $result = $engine->computeForLevel($targetLevel, $search, $limit, $offset);
        echo json_encode($result);
    }
}
