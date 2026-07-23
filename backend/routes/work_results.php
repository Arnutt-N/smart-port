<?php
// ============================================================================
// routes/work_results.php
// Work Results Route Handler — ผลงานและข้อเสนอ (ตาราง performance_proposals)
// อ่านอย่างเดียวในเฟสนี้ (ข้อเสนอถูกสร้าง/อนุมัติผ่านกระบวนการอื่น)
//
// Endpoints:
//   GET /work-results          — รายการผลงาน (search + filter status + pagination)
//   GET /work-results/{id}     — รายละเอียดผลงานรายการเดียว
// ============================================================================

include_once __DIR__ . '/../helpers.php';

function handleWorkResults(PDO $pdo, string $method, array $path): void
{
    requirePermission('read', 'work_results');

    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    $id = $path[1] ?? null;
    if ($id !== null) {
        getWorkResultDetail($pdo, intval($id));
    } else {
        getWorkResultList($pdo);
    }
}

const WORK_RESULT_SELECT = "pp.proposal_id, pp.servant_id, pp.proposal_type, pp.title,
                            pp.description, pp.impact_description, pp.quantitative_result,
                            pp.result_unit, pp.submission_date, pp.evaluation_score,
                            pp.status, pp.approval_level, pp.created_at,
                            CONCAT(COALESCE(p.prefix_name_th, ''), cs.first_name, ' ', cs.last_name) AS servant_name";

function workResultBaseQuery(): string
{
    return "FROM performance_proposals pp
            LEFT JOIN civil_servants cs ON pp.servant_id = cs.servant_id
            LEFT JOIN prefixes p ON cs.prefix_id = p.prefix_id";
}

function getWorkResultList(PDO $pdo): void
{
    $search = trim($_GET['search'] ?? '');
    $status = trim($_GET['status'] ?? '');
    $limit = max(1, min(intval($_GET['limit'] ?? 20), 200));
    $offset = max(0, intval($_GET['offset'] ?? 0));

    $conditions = ['pp.is_active = 1'];
    $params = [];
    if ($search !== '') {
        $conditions[] = "(pp.title LIKE ? OR cs.first_name LIKE ? OR cs.last_name LIKE ?)";
        $term = "%{$search}%";
        array_push($params, $term, $term, $term);
    }
    if ($status !== '') {
        $conditions[] = "pp.status = ?";
        $params[] = $status;
    }
    $where = ' WHERE ' . implode(' AND ', $conditions);

    $sql = "SELECT " . WORK_RESULT_SELECT . ' ' . workResultBaseQuery() . $where
        . " ORDER BY pp.submission_date DESC, pp.proposal_id DESC LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countStmt = $pdo->prepare("SELECT COUNT(*) AS total " . workResultBaseQuery() . $where);
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

function getWorkResultDetail(PDO $pdo, int $id): void
{
    $sql = "SELECT " . WORK_RESULT_SELECT . ' ' . workResultBaseQuery() . " WHERE pp.proposal_id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบผลงาน']);
        return;
    }
    echo json_encode(['success' => true, 'data' => $row]);
}
