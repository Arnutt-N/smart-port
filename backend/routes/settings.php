<?php
// ============================================================================
// routes/settings.php
// System settings — permission matrix overrides (superadmin only)
//
// Endpoints:
//   GET /settings/permissions — matrix with default / effective / override flag
//   PUT /settings/permissions — upsert override rows, or reset:true to delete override
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../audit.php';
include_once __DIR__ . '/../authz.php';

/**
 * @param PDO $pdo
 * @param string $method
 * @param array $path
 */
function handleSettings(PDO $pdo, string $method, array $path): void
{
    $section = $path[1] ?? '';

    if ($section === 'permissions') {
        $auth = requireSuperAdmin();
        if ($method === 'GET') {
            getPermissionSettings($pdo);
            return;
        }
        if ($method === 'PUT') {
            putPermissionSettings($pdo, $auth);
            return;
        }
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    http_response_code(404);
    echo json_encode(['error' => 'ไม่พบ endpoint การตั้งค่า']);
}

function getPermissionSettings(PDO $pdo): void
{
    clearPermissionOverrideCache();
    try {
        $overrides = getPermissionOverrideMap($pdo) ?? [];
    } catch (RuntimeException $e) {
        http_response_code(503);
        echo json_encode([
            'error' => 'Service Unavailable',
            'message' => 'ไม่สามารถโหลดเมทริกซ์สิทธิ์ได้ในขณะนี้',
        ]);
        return;
    }

    $roles = AUTHZ_OVERRIDABLE_ROLES;
    $actions = AUTHZ_ACTIONS;
    $resources = authzResources();

    $cells = [];
    foreach ($roles as $role) {
        foreach ($actions as $action) {
            foreach ($resources as $resource) {
                // system_permissions is superadmin-gated via requireSuperAdmin — skip in matrix UI noise
                if ($resource === 'system_permissions') {
                    continue;
                }
                $key = $role . '|' . $action . '|' . $resource;
                $defaultAllowed = checkPermissionDefault($role, $action, $resource);
                $hasOverride = array_key_exists($key, $overrides);
                $effective = $hasOverride ? $overrides[$key] : $defaultAllowed;
                $cells[] = [
                    'role' => $role,
                    'action' => $action,
                    'resource' => $resource,
                    'default_allowed' => $defaultAllowed,
                    'allowed' => $effective,
                    'has_override' => $hasOverride,
                ];
            }
        }
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'roles' => $roles,
            'actions' => $actions,
            'resources' => array_values(array_filter(
                $resources,
                static fn($r) => $r !== 'system_permissions'
            )),
            'cells' => $cells,
        ],
    ]);
}

/**
 * Validate one override cell identity.
 *
 * @return array{0:string,1:string,2:string}|null [role, action, resource] or null + sets HTTP error
 */
function validatePermissionCell(array $item, int $index): ?array
{
    $role = (string) ($item['role'] ?? '');
    $action = (string) ($item['action'] ?? '');
    $resource = (string) ($item['resource'] ?? '');

    if ($role === 'superadmin') {
        http_response_code(400);
        echo json_encode(['error' => 'ไม่สามารถกำหนด override ให้บทบาท superadmin ได้']);
        return null;
    }

    if (!in_array($role, AUTHZ_OVERRIDABLE_ROLES, true)
        || !in_array($action, AUTHZ_ACTIONS, true)
        || !in_array($resource, authzResources(), true)
        || $resource === 'system_permissions'
    ) {
        http_response_code(400);
        echo json_encode(['error' => "ค่าไม่ถูกต้องที่รายการ #{$index}: {$role}/{$action}/{$resource}"]);
        return null;
    }

    return [$role, $action, $resource];
}

/**
 * @param array{user_id:int|string} $auth
 * @param array<string,mixed>|null $input
 */
function putPermissionSettings(PDO $pdo, array $auth, ?array $input = null): void
{
    $data = $input ?? json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'รูปแบบข้อมูลไม่ถูกต้อง']);
        return;
    }

    $items = $data['overrides'] ?? $data;
    if (!is_array($items)) {
        http_response_code(400);
        echo json_encode(['error' => 'ต้องส่งรายการ overrides เป็น array']);
        return;
    }

    // Validate all rows first (fail fast, no partial writes).
    $ops = [];
    foreach ($items as $index => $item) {
        if (!is_array($item)) {
            http_response_code(400);
            echo json_encode(['error' => "รายการที่ #{$index} ไม่ถูกต้อง"]);
            return;
        }
        $cell = validatePermissionCell($item, (int) $index);
        if ($cell === null) {
            return;
        }
        [$role, $action, $resource] = $cell;
        if (!empty($item['reset'])) {
            $ops[] = ['op' => 'reset', 'role' => $role, 'action' => $action, 'resource' => $resource];
        } else {
            if (!array_key_exists('allowed', $item)) {
                http_response_code(400);
                echo json_encode(['error' => "รายการที่ #{$index} ต้องมี allowed หรือ reset"]);
                return;
            }
            $ops[] = [
                'op' => 'upsert',
                'role' => $role,
                'action' => $action,
                'resource' => $resource,
                'allowed' => !empty($item['allowed']) ? 1 : 0,
            ];
        }
    }

    $find = $pdo->prepare(
        'SELECT 1 FROM role_permission_overrides
         WHERE role = ? AND action = ? AND resource = ? LIMIT 1'
    );
    $insert = $pdo->prepare(
        'INSERT INTO role_permission_overrides (role, action, resource, allowed)
         VALUES (?, ?, ?, ?)'
    );
    $update = $pdo->prepare(
        'UPDATE role_permission_overrides SET allowed = ?
         WHERE role = ? AND action = ? AND resource = ?'
    );
    $delete = $pdo->prepare(
        'DELETE FROM role_permission_overrides
         WHERE role = ? AND action = ? AND resource = ?'
    );

    $applied = [];
    try {
        $pdo->beginTransaction();
        foreach ($ops as $op) {
            if ($op['op'] === 'reset') {
                $delete->execute([$op['role'], $op['action'], $op['resource']]);
                $applied[] = [
                    'role' => $op['role'],
                    'action' => $op['action'],
                    'resource' => $op['resource'],
                    'reset' => true,
                ];
            } else {
                $find->execute([$op['role'], $op['action'], $op['resource']]);
                if ($find->fetchColumn()) {
                    $update->execute([$op['allowed'], $op['role'], $op['action'], $op['resource']]);
                } else {
                    $insert->execute([$op['role'], $op['action'], $op['resource'], $op['allowed']]);
                }
                $applied[] = [
                    'role' => $op['role'],
                    'action' => $op['action'],
                    'resource' => $op['resource'],
                    'allowed' => (bool) $op['allowed'],
                ];
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[Settings] putPermissionSettings failed: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'บันทึกสิทธิ์ไม่สำเร็จ']);
        return;
    }

    clearPermissionOverrideCache();

    logAudit(
        $pdo,
        (int) $auth['user_id'],
        'UPDATE',
        'role_permission_overrides',
        null,
        null,
        ['overrides' => $applied]
    );

    echo json_encode(['success' => true, 'updated' => count($applied)]);
}
