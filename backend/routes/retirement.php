<?php
// ============================================================================
// routes/retirement.php
// Retirement Report Route Handler — รายงานเกษียณ (read-only)
// ดึงจาก personnel.retirement_date + คำนวณจำนวนวันคงเหลือ
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

    $conditions = ['p.is_active = 1', 'p.retirement_date IS NOT NULL'];
    $params = [];
    if ($search !== '') {
        $conditions[] = "(p.first_name LIKE ? OR p.last_name LIKE ? OR p.employee_id LIKE ?)";
        $term = "%{$search}%";
        array_push($params, $term, $term, $term);
    }
    if ($within > 0) {
        $conditions[] = "p.retirement_date >= CURDATE()
                         AND p.retirement_date <= DATE_ADD(CURDATE(), INTERVAL {$within} MONTH)";
    }
    $where = ' WHERE ' . implode(' AND ', $conditions);

    $select = "p.personnel_id AS servant_id, p.employee_id, p.retirement_date, p.servant_status,
               DATEDIFF(p.retirement_date, CURDATE()) AS remaining_days,
               CONCAT(COALESCE(px.prefix_name_th, ''), p.first_name, ' ', p.last_name) AS full_name";
    $base = "FROM personnel p LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id";

    $sql = "SELECT {$select} {$base}{$where}
            ORDER BY p.retirement_date ASC LIMIT {$limit} OFFSET {$offset}";
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
