<?php
// ============================================================================
// authz.php
// Authorization seam — permission matrix + DB overrides + requirePermission
// ============================================================================

/** @var list<string> */
const AUTHZ_ACTIONS = ['read', 'create', 'update', 'delete'];

/** @var list<string> Roles that can appear in override UI (not superadmin). */
const AUTHZ_OVERRIDABLE_ROLES = ['admin', 'operator', 'viewer'];

/**
 * Canonical resource keys used by routes / settings UI.
 *
 * @return list<string>
 */
function authzResources(): array
{
    return [
        'multiplier', 'personnel', 'candidates', 'probation',
        'equivalence', 'equivalence_approval', 'supportive', 'diverse',
        'photos', 'ocr', 'awards', 'royal_decorations', 'import',
        'retirement', 'analytics', 'work_results', 'dashboard', 'sync',
        'audit', 'users', 'profile', 'system_permissions',
    ];
}

/**
 * Hardcoded defaults — DB overrides layer on top when present.
 *
 * @return array<string, array<string, list<string>>>
 */
function defaultPermissionMatrix(): array
{
    return [
        'superadmin' => [
            'read' => ['*'],
            'create' => ['*'],
            'update' => ['*'],
            'delete' => ['*'],
        ],
        'admin' => [
            'read' => ['*'],
            'create' => ['*'],
            'update' => ['*'],
            'delete' => ['*'],
        ],
        'operator' => [
            'read' => ['*'],
            // personnel master write = admin/superadmin เท่านั้น (ADR-0004)
            'create' => [
                'multiplier', 'candidates', 'probation',
                'equivalence', 'supportive', 'diverse', 'photos',
            ],
            'update' => [
                'multiplier', 'candidates', 'probation',
                'equivalence', 'supportive', 'diverse',
            ],
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
}

/**
 * Whether the code default allows role/action/resource (no DB).
 */
function checkPermissionDefault(string $userRole, string $action, string $resource): bool
{
    $permissions = defaultPermissionMatrix();

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
 * Generation-based override map so clearPermissionOverrideCache() works.
 * Successful loads are cached; failures are not (next call retries).
 *
 * @return array<string, bool>|null null only when $pdo is null (unit tests / offline)
 * @throws RuntimeException when $pdo is provided but the override table cannot be read
 */
function getPermissionOverrideMap(?PDO $pdo = null): ?array
{
    static $generation = 0;
    static $cachedGeneration = -1;
    /** @var array<string, bool>|null */
    static $cache = null;

    if (!empty($GLOBALS['__authz_overrides_bump'])) {
        $generation++;
        unset($GLOBALS['__authz_overrides_bump']);
    }

    // Without an explicit PDO, do not probe getDB() (keeps unit tests offline).
    if ($pdo === null) {
        return null;
    }

    if ($cachedGeneration === $generation && is_array($cache)) {
        return $cache;
    }

    try {
        $stmt = $pdo->query(
            'SELECT role, action, resource, allowed FROM role_permission_overrides'
        );
        $map = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $key = $row['role'] . '|' . $row['action'] . '|' . $row['resource'];
            $map[$key] = ((int) $row['allowed']) === 1;
        }
        $cachedGeneration = $generation;
        return $cache = $map;
    } catch (Throwable $e) {
        // Note: PDOException extends RuntimeException — always wrap load failures.
        if ($e instanceof RuntimeException && $e->getMessage() === 'AUTHZ_OVERRIDES_UNAVAILABLE') {
            throw $e;
        }
        error_log('[Authz] Failed to load permission overrides: ' . $e->getMessage());
        // Do not cache failures — a transient outage must not 503 the worker forever.
        throw new RuntimeException('AUTHZ_OVERRIDES_UNAVAILABLE', 0, $e);
    }
}

function clearPermissionOverrideCache(): void
{
    $GLOBALS['__authz_overrides_bump'] = true;
}

/**
 * @param PDO|null $pdo Optional PDO (tests / settings write path)
 * @throws RuntimeException when $pdo provided but overrides cannot be loaded
 */
function checkPermission(string $userRole, string $action, string $resource, ?PDO $pdo = null): bool
{
    if ($userRole === 'superadmin') {
        return true;
    }

    $overrides = getPermissionOverrideMap($pdo);
    if (is_array($overrides)) {
        $key = $userRole . '|' . $action . '|' . $resource;
        if (array_key_exists($key, $overrides)) {
            return $overrides[$key];
        }
    }

    return checkPermissionDefault($userRole, $action, $resource);
}

/**
 * Evaluate whether $user may perform $action on $resource.
 * Fail-closed: any DB / override-store failure ⇒ 503 (do not fall back to defaults).
 *
 * @param array{user_id?:int|string, role?:string}|null $user
 * @return array{status:int, body:array<string,mixed>}|null null = allowed
 */
function evaluatePermissionAccess(string $action, string $resource, ?array $user, ?PDO $pdo = null): ?array
{
    if (!$user) {
        return ['status' => 401, 'body' => ['error' => 'Unauthorized']];
    }

    $role = $user['role'] ?? 'viewer';

    // Superadmin bypasses override store (always allowed).
    if ($role === 'superadmin') {
        return null;
    }

    try {
        if ($pdo === null) {
            if (!function_exists('getDB')) {
                throw new RuntimeException('AUTHZ_OVERRIDES_UNAVAILABLE');
            }
            $pdo = getDB();
        }
        if (!$pdo instanceof PDO) {
            throw new RuntimeException('AUTHZ_OVERRIDES_UNAVAILABLE');
        }
        if (!checkPermission($role, $action, $resource, $pdo)) {
            return [
                'status' => 403,
                'body' => [
                    'error' => 'Forbidden',
                    'message' => 'คุณไม่มีสิทธิ์ในการดำเนินการนี้',
                    'required_permission' => "{$action}:{$resource}",
                    'your_role' => $role,
                ],
            ];
        }
        return null;
    } catch (Throwable $e) {
        // getDB() / PDO / override load — treat all as unavailable (fail-closed).
        error_log('[Authz] Permission check unavailable: ' . $e->getMessage());
        return [
            'status' => 503,
            'body' => [
                'error' => 'Service Unavailable',
                'message' => 'ไม่สามารถตรวจสอบสิทธิ์ระบบได้ในขณะนี้ กรุณาลองใหม่ภายหลัง',
            ],
        ];
    }
}

/**
 * Middleware: ตรวจสอบ permission ก่อนให้ access endpoint
 * Fail-closed: if override store / DB is unreachable, deny (503) rather than fall back to defaults.
 */
function requirePermission(string $action, string $resource): void
{
    $denied = evaluatePermissionAccess($action, $resource, getAuthenticatedUser());
    if ($denied === null) {
        return;
    }
    http_response_code($denied['status']);
    echo json_encode($denied['body']);
    exit;
}

/**
 * @return array{user_id:int|string, role:string, must_change_password?:int|string}
 */
function requireSuperAdmin(): array
{
    $user = getAuthenticatedUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    if (($user['role'] ?? '') !== 'superadmin') {
        http_response_code(403);
        echo json_encode([
            'error' => 'Forbidden',
            'message' => 'เฉพาะซูเปอร์แอดมินเท่านั้นที่จัดการสิทธิ์ระบบได้',
        ]);
        exit;
    }
    return $user;
}

/**
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
