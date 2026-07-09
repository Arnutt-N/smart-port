<?php
// ============================================================================
// routes/audit.php
// Audit Log API
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../audit.php';

function handleAudit(PDO $pdo, string $method, array $path): void
{
    // admin อ่านได้เสมอ (wildcard) และ operator อ่านได้ด้วยตาม permission matrix
    // ('read' => ['*'] ใน audit.php) — ตั้งใจให้ operator ตรวจสอบประวัติได้ แม้ frontend
    // จะซ่อนเมนูนี้ไว้ให้เห็นเฉพาะ admin ก็ตาม (ดู AppSidebar.vue)
    requirePermission('read', 'audit');

    try {
        if ($method === 'GET') {
            getAuditLog($pdo);
            return;
        }

        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
    } catch (PDOException $e) {
        error_log('[audit] DB error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'เกิดข้อผิดพลาดในการเข้าถึงฐานข้อมูล']);
    }
}

function getAuditLog(PDO $pdo): void
{
    $tableName = $_GET['table'] ?? '';
    $action = $_GET['action'] ?? '';
    $userId = $_GET['user_id'] ?? '';
    $limit = max(1, min(100, intval($_GET['limit'] ?? 50)));
    $offset = max(0, intval($_GET['offset'] ?? 0));

    $where = [];
    $params = [];

    if ($tableName !== '') {
        $where[] = 'table_name = ?';
        $params[] = $tableName;
    }

    if ($action !== '') {
        $where[] = 'action = ?';
        $params[] = $action;
    }

    if ($userId !== '') {
        $where[] = 'user_id = ?';
        $params[] = intval($userId);
    }

    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

    $baseQuery = "FROM vw_audit_log {$whereSql}";

    $sql = "
        SELECT
            audit_id,
            user_id,
            username,
            full_name,
            action,
            table_name,
            record_id,
            before_value,
            after_value,
            ip_address,
            created_at
        {$baseQuery}
        ORDER BY created_at DESC
        LIMIT {$limit} OFFSET {$offset}
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Parse JSON fields
    foreach ($rows as &$row) {
        $row['before_value'] = $row['before_value'] ? json_decode($row['before_value'], true) : null;
        $row['after_value'] = $row['after_value'] ? json_decode($row['after_value'], true) : null;
    }
    unset($row);

    $countStmt = $pdo->prepare("SELECT COUNT(*) AS total {$baseQuery}");
    $countStmt->execute($params);
    $total = intval($countStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    echo json_encode([
        'success' => true,
        'data' => $rows,
        'pagination' => [
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => ($offset + $limit) < $total,
        ],
    ]);
}
