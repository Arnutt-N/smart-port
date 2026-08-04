<?php
// ============================================================================
// authz.php
// Authorization seam — permission matrix + requirePermission + getAuthenticatedUser
// (Split from audit.php so audit logging and authz do not share one module.)
// ============================================================================

/**
 * ตรวจสอบว่า user มี permission ทำ action นี้หรือไม่
 *
 * Unknown resource ⇒ deny (must be listed explicitly for non-admin roles).
 *
 * @param string $userRole — admin | operator | viewer
 * @param string $action — read | create | update | delete
 * @param string $resource — see matrix below
 */
function checkPermission(string $userRole, string $action, string $resource): bool
{
    // Resources used by routes today (today-vs-matrix):
    // awards, royal_decorations, import, retirement, analytics, work_results,
    // ocr, photos, dashboard, sync, audit, users, profile — admin via '*';
    // viewer read: career overview only (Open Q3 default = deny awards/etc.)
    // ocr create: admin-only (not in operator create list)
    $permissions = [
        'admin' => [
            'read' => ['*'],
            'create' => ['*'],
            'update' => ['*'],
            'delete' => ['*'],
        ],
        'operator' => [
            'read' => ['*'],
            'create' => [
                'multiplier', 'personnel', 'candidates', 'probation',
                'equivalence', 'supportive', 'diverse', 'photos',
            ],
            'update' => [
                'multiplier', 'personnel', 'candidates', 'probation',
                'equivalence', 'supportive', 'diverse',
            ],
            // equivalence_approval — admin only
            'delete' => [],
        ],
        'viewer' => [
            'read' => [
                'multiplier', 'personnel', 'candidates', 'probation',
                'dashboard', 'profile',
            ],
            'create' => [],
            'update' => [],
            'delete' => [],
        ],
    ];

    if (!isset($permissions[$userRole])) {
        return false;
    }

    $allowedResources = $permissions[$userRole][$action] ?? [];

    if (in_array('*', $allowedResources, true)) {
        return true;
    }

    return in_array($resource, $allowedResources, true);
}

/**
 * Middleware: ตรวจสอบ permission ก่อนให้ access endpoint
 *
 * @param string $action — read | create | update | delete
 * @param string $resource
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
 * @return array|null — ['user_id' => int, 'role' => string, 'must_change_password' => int] หรือ null
 */
function getAuthenticatedUser(): ?array
{
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

    try {
        $pdo = getDB();
        $stmt = $pdo->prepare(
            "SELECT user_id, role, must_change_password
             FROM users
             WHERE user_id = ? AND is_active = 1"
        );
        $stmt->execute([$payload['user_id'] ?? 0]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
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
