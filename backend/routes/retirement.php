<?php
// ============================================================================
// routes/retirement.php
// Retirement Report Route Handler — รายงานเกษียณ (read-only)
// ดึงจาก civil_servants.retirement_date + คำนวณจำนวนวันคงเหลือ
//
// Endpoints:
//   GET /retirement   — รายชื่อผู้ที่มีกำหนดเกษียณ (filter within N เดือน + pagination)
//                       query: ?within=<months>&search=&limit=&offset=
// ============================================================================

include_once __DIR__ . '/../helpers.php';

function handleRetirement(PDO $pdo, string $method, array $path): void
{
    requirePermission('read', 'retirement');

    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    getRetirementList($pdo);
}

function getRetirementList(PDO $pdo): void
{
    $search = trim($_GET['search'] ?? '');
    $within = intval($_GET['within'] ?? 0); // 0 = ไม่จำกัดช่วง
    $limit = max(1, min(intval($_GET['limit'] ?? 20), 200));
    $offset = max(0, intval($_GET['offset'] ?? 0));

    $conditions = ['cs.is_active = 1', 'cs.retirement_date IS NOT NULL'];
    $params = [];
    if ($search !== '') {
        $conditions[] = "(cs.first_name LIKE ? OR cs.last_name LIKE ? OR cs.employee_id LIKE ?)";
        $term = "%{$search}%";
        array_push($params, $term, $term, $term);
    }
    if ($within > 0) {
        $conditions[] = "cs.retirement_date >= CURDATE()
                         AND cs.retirement_date <= DATE_ADD(CURDATE(), INTERVAL {$within} MONTH)";
    }
    $where = ' WHERE ' . implode(' AND ', $conditions);

    $select = "cs.servant_id, cs.employee_id, cs.retirement_date, cs.servant_status,
               DATEDIFF(cs.retirement_date, CURDATE()) AS remaining_days,
               CONCAT(COALESCE(p.prefix_name_th, ''), cs.first_name, ' ', cs.last_name) AS full_name";
    $base = "FROM civil_servants cs LEFT JOIN prefixes p ON cs.prefix_id = p.prefix_id";

    $sql = "SELECT {$select} {$base}{$where}
            ORDER BY cs.retirement_date ASC LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countStmt = $pdo->prepare("SELECT COUNT(*) AS total {$base}{$where}");
    $countStmt->execute($params);
    $total = intval($countStmt->fetch(PDO::FETCH_ASSOC)['total']);

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
