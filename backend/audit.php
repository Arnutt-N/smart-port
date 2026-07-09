<?php
// ============================================================================
// audit.php
// Audit Log Helper Functions
// ============================================================================

/**
 * บันทึก audit log เมื่อมีการเปลี่ยนแปลงข้อมูลสำคัญ
 *
 * @param PDO $pdo
 * @param int $userId — ผู้ทำรายการ
 * @param string $action — CREATE | UPDATE | DELETE
 * @param string $tableName — ชื่อตารางที่ถูกแก้ไข
 * @param int|null $recordId — PK ของ record
 * @param array|null $beforeValue — ค่าก่อนแก้ไข (UPDATE/DELETE)
 * @param array|null $afterValue — ค่าหลังแก้ไข (CREATE/UPDATE)
 * @return bool
 */
function logAudit(
    PDO $pdo,
    int $userId,
    string $action,
    string $tableName,
    ?int $recordId = null,
    ?array $beforeValue = null,
    ?array $afterValue = null
): bool {
    try {
        // ดึง IP address และ User Agent
        $ipAddress = $_SERVER['REMOTE_ADDR'] ?? null;
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;

        // กรองข้อมูล sensitive ออกก่อน log (password, token, etc.)
        if ($beforeValue) {
            $beforeValue = sanitizeAuditData($beforeValue);
        }
        if ($afterValue) {
            $afterValue = sanitizeAuditData($afterValue);
        }

        $stmt = $pdo->prepare("
            INSERT INTO audit_log
            (user_id, action, table_name, record_id, before_value, after_value, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");

        return $stmt->execute([
            $userId,
            $action,
            $tableName,
            $recordId,
            $beforeValue ? json_encode($beforeValue, JSON_UNESCAPED_UNICODE) : null,
            $afterValue ? json_encode($afterValue, JSON_UNESCAPED_UNICODE) : null,
            $ipAddress,
            $userAgent,
        ]);
    } catch (PDOException $e) {
        error_log("[Audit] Failed to log: " . $e->getMessage());
        // ไม่ throw exception เพราะไม่อยากให้ audit log failure block การทำงานหลัก
        return false;
    }
}

/**
 * กรองข้อมูล sensitive ออกจาก audit data
 *
 * @param array $data
 * @return array
 */
function sanitizeAuditData(array $data): array
{
    $sensitiveKeys = [
        'password',
        'password_hash',
        'token',
        'access_token',
        'refresh_token',
        'secret',
        'api_key',
    ];

    foreach ($sensitiveKeys as $key) {
        if (isset($data[$key])) {
            $data[$key] = '[REDACTED]';
        }
    }

    return $data;
}

/**
 * ตรวจสอบว่า user มี permission ทำ action นี้หรือไม่
 *
 * @param string $userRole — admin | operator | viewer
 * @param string $action — read | create | update | delete
 * @param string $resource — multiplier | personnel | users | candidates | probation
 * @return bool
 */
function checkPermission(string $userRole, string $action, string $resource): bool
{
    // Permission matrix
    $permissions = [
        'admin' => [
            'read' => ['*'], // ทุก resource
            'create' => ['*'],
            'update' => ['*'],
            'delete' => ['*'],
        ],
        'operator' => [
            'read' => ['*'],
            'create' => ['multiplier', 'personnel', 'candidates', 'probation', 'equivalence'],
            'update' => ['multiplier', 'personnel', 'candidates', 'probation', 'equivalence'],
            // 'equivalence_approval' ไม่อยู่ในลิสต์ — อนุมัติ/ปฏิเสธคำขอเทียบตำแหน่งเป็นสิทธิ์ admin เท่านั้น
            'delete' => [], // ห้าม delete (ยกเว้น admin)
        ],
        'viewer' => [
            'read' => ['multiplier', 'personnel', 'candidates', 'probation', 'dashboard'],
            'create' => [],
            'update' => [],
            'delete' => [],
        ],
    ];

    if (!isset($permissions[$userRole])) {
        return false;
    }

    $allowedResources = $permissions[$userRole][$action] ?? [];

    // ถ้ามี '*' หมายถึงทุก resource
    if (in_array('*', $allowedResources)) {
        return true;
    }

    return in_array($resource, $allowedResources);
}

/**
 * Middleware: ตรวจสอบ permission ก่อนให้ access endpoint
 * ถ้าไม่มีสิทธิ์ จะ return 403 Forbidden และ exit
 *
 * @param string $action — read | create | update | delete
 * @param string $resource — multiplier | personnel | users | candidates | probation
 * @return void
 */
function requirePermission(string $action, string $resource): void
{
    $user = getAuthenticatedUser();

    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    $role = $user['role'] ?? 'viewer';

    if (!checkPermission($role, $action, $resource)) {
        http_response_code(403);
        echo json_encode([
            'error' => 'Forbidden',
            'message' => 'คุณไม่มีสิทธิ์ในการดำเนินการนี้',
            'required_permission' => "{$action}:{$resource}",
            'your_role' => $role,
        ]);
        exit;
    }
}

/**
 * ดึงข้อมูล authenticated user จาก JWT token
 *
 * @return array|null — ['user_id' => int, 'role' => string] หรือ null
 */
function getAuthenticatedUser(): ?array
{
    // Memoize ต่อ request — ฟังก์ชันนี้ถูกเรียกซ้ำหลายครั้งต่อ 1 request
    // (rateLimitGlobal, requireCSRFToken, requirePermission, แล้ว route handler เรียกซ้ำเอง)
    // token/DB row ไม่เปลี่ยนกลางคันของ request เดียว จึง cache ได้ปลอดภัย
    static $resolved = false;
    static $cached = null;
    if ($resolved) {
        return $cached;
    }
    $resolved = true;

    $token = getAuthHeader();
    if (!$token) {
        return $cached = null;
    }

    $payload = validateJWT($token);
    if (!$payload) {
        return $cached = null;
    }

    // ดึง user จาก DB เพื่อ check role ล่าสุด (กัน cache role เก่า)
    try {
        $pdo = getDB();
        $stmt = $pdo->prepare("SELECT user_id, role FROM users WHERE user_id = ? AND is_active = 1");
        $stmt->execute([$payload['data']['user_id'] ?? 0]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            // Extract CSRF token from JWT payload for validation
            $tokenParts = explode('.', $token);
            if (count($tokenParts) === 3) {
                $fullPayload = json_decode(base64url_decode($tokenParts[1]), true);
                $user['csrf_token'] = $fullPayload['csrf'] ?? '';
            }
        }

        return $cached = ($user ?: null);
    } catch (PDOException $e) {
        error_log('[Auth] Failed to fetch user: ' . $e->getMessage());
        return $cached = null;
    }
}
