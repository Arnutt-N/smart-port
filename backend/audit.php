<?php
// ============================================================================
// audit.php
// Audit Log Helper Functions
// Authz (checkPermission / requirePermission / getAuthenticatedUser) → authz.php
// ============================================================================

include_once __DIR__ . '/authz.php';

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
        $ipAddress = $_SERVER['REMOTE_ADDR'] ?? null;
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;

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
