<?php

// ============================================================================
// routes/work_results.php
// Work Results Route Handler — ผลงานและข้อเสนอ (ตาราง performance_proposals)
//
// Endpoints:
//   GET    /work-results          — รายการผลงาน (search + filter status + pagination)
//   GET    /work-results/{id}     — รายละเอียดผลงานรายการเดียว
//   POST   /work-results          — เพิ่มผลงาน (admin+)
//   PUT    /work-results/{id}     — แก้ไขผลงาน (admin+)
//   DELETE /work-results/{id}     — ลบผลงาน (admin+)
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../audit.php';

const WORK_RESULT_VALID_TYPES = ['improvement', 'innovation', 'research', 'service', 'other'];
const WORK_RESULT_VALID_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected'];
const WORK_RESULT_VALID_LEVELS = ['department', 'ministry', 'national'];

function handleWorkResults(PDO $pdo, string $method, array $path): void
{
    $actionMap = ['GET' => 'read', 'POST' => 'create', 'PUT' => 'update', 'DELETE' => 'delete'];
    requirePermission($actionMap[$method] ?? 'read', 'work_results');
    $auth = getAuthenticatedUser();

    switch ($method) {
        case 'GET':
            $id = $path[1] ?? null;
            if ($id !== null) {
                getWorkResultDetail($pdo, intval($id));
            } else {
                getWorkResultList($pdo);
            }
            break;

        case 'POST':
            createWorkResult($pdo, $auth);
            break;

        case 'PUT':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID ของผลงาน']);
                return;
            }
            updateWorkResult($pdo, intval($id), $auth);
            break;

        case 'DELETE':
            $id = $path[1] ?? null;
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณาระบุ ID ของผลงาน']);
                return;
            }
            deleteWorkResult($pdo, intval($id), $auth);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
}

function workResultSelectSql(): string
{
    return 'pp.proposal_id, pp.personnel_id, pp.proposal_type, pp.title,
            pp.description, pp.impact_description, pp.quantitative_result,
            pp.result_unit, pp.submission_date, pp.evaluation_score,
            pp.status, pp.approval_level, pp.created_at, '
            . sqlPersonnelFullName() . ' AS personnel_name';
}

function workResultBaseQuery(): string
{
    return 'FROM performance_proposals pp
            LEFT JOIN personnel p ON pp.personnel_id = p.personnel_id
            LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id';
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
        $conditions[] = '(pp.title LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?)';
        $term = "%{$search}%";
        array_push($params, $term, $term, $term);
    }
    if ($status !== '') {
        $conditions[] = 'pp.status = ?';
        $params[] = $status;
    }
    $where = ' WHERE ' . implode(' AND ', $conditions);

    $sql = 'SELECT ' . workResultSelectSql() . ' ' . workResultBaseQuery() . $where
        . " ORDER BY pp.submission_date DESC, pp.proposal_id DESC LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countStmt = $pdo->prepare('SELECT COUNT(*) AS total ' . workResultBaseQuery() . $where);
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
    $sql = 'SELECT ' . workResultSelectSql() . ' ' . workResultBaseQuery() . ' WHERE pp.proposal_id = ?';
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

function workResultValidDate(?string $value): bool
{
    if ($value === null || $value === '') {
        return true;
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        return false;
    }
    $parsed = DateTime::createFromFormat('Y-m-d|', $value);
    $errors = DateTime::getLastErrors();
    return $parsed !== false
        && ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0));
}

/**
 * @return array{0: array<string,mixed>|null, 1: string|null}
 */
function validateWorkResultPayload(array $data, bool $requireCore): array
{
    if ($requireCore) {
        foreach (['personnel_id', 'title', 'submission_date'] as $field) {
            if (!isset($data[$field]) || $data[$field] === '') {
                return [null, "กรุณาระบุข้อมูล: {$field}"];
            }
        }
    }

    if (array_key_exists('personnel_id', $data) && $data['personnel_id'] !== '' && $data['personnel_id'] !== null) {
        $pid = strictPersonnelId($data['personnel_id']);
        if ($pid === null) {
            return [null, 'รูปแบบข้อมูลไม่ถูกต้อง'];
        }
        $data['personnel_id'] = $pid;
    }

    if (isset($data['proposal_type']) && $data['proposal_type'] !== ''
        && !in_array($data['proposal_type'], WORK_RESULT_VALID_TYPES, true)) {
        return [null, 'ประเภทผลงานไม่ถูกต้อง'];
    }

    if (isset($data['status']) && $data['status'] !== ''
        && !in_array($data['status'], WORK_RESULT_VALID_STATUSES, true)) {
        return [null, 'สถานะไม่ถูกต้อง'];
    }

    if (isset($data['approval_level']) && $data['approval_level'] !== ''
        && !in_array($data['approval_level'], WORK_RESULT_VALID_LEVELS, true)) {
        return [null, 'ระดับการอนุมัติไม่ถูกต้อง'];
    }

    foreach (['submission_date', 'evaluation_date'] as $dateField) {
        if (!array_key_exists($dateField, $data)) {
            continue;
        }
        $raw = $data[$dateField];
        if ($raw === '' || $raw === null) {
            continue;
        }
        if (!is_string($raw) || !workResultValidDate($raw)) {
            return [null, 'รูปแบบวันที่ไม่ถูกต้อง'];
        }
    }

    if (array_key_exists('evaluation_score', $data) && $data['evaluation_score'] !== '' && $data['evaluation_score'] !== null) {
        if (!is_numeric($data['evaluation_score'])) {
            return [null, 'คะแนนประเมินไม่ถูกต้อง'];
        }
        $score = (float) $data['evaluation_score'];
        if ($score < 0 || $score > 5) {
            return [null, 'คะแนนประเมินต้องอยู่ระหว่าง 0 ถึง 5'];
        }
        $data['evaluation_score'] = $score;
    }

    return [$data, null];
}

function createWorkResult(PDO $pdo, ?array $auth): void
{
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    [$valid, $error] = validateWorkResultPayload($data, true);
    if ($error !== null) {
        http_response_code(400);
        echo json_encode(['error' => $error]);
        return;
    }

    $personnelId = $valid['personnel_id'];
    if (!personnelExists($pdo, $personnelId)) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบบุคลากรตามรหัสที่ระบุ']);
        return;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO performance_proposals
            (personnel_id, proposal_type, title, description, impact_description,
             quantitative_result, result_unit, submission_date, evaluation_score,
             status, approval_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $personnelId,
        $valid['proposal_type'] ?? 'improvement',
        trim($valid['title']),
        $valid['description'] ?? null,
        $valid['impact_description'] ?? null,
        ($valid['quantitative_result'] ?? '') !== '' ? $valid['quantitative_result'] : null,
        ($valid['result_unit'] ?? '') !== '' ? $valid['result_unit'] : null,
        $valid['submission_date'],
        array_key_exists('evaluation_score', $valid) && $valid['evaluation_score'] !== '' && $valid['evaluation_score'] !== null
            ? $valid['evaluation_score'] : null,
        $valid['status'] ?? 'draft',
        ($valid['approval_level'] ?? '') !== '' ? $valid['approval_level'] : 'department',
    ]);

    $newId = intval($pdo->lastInsertId());
    logAudit($pdo, intval($auth['user_id']), 'CREATE', 'work_results', $newId, null, [
        'personnel_id' => $personnelId,
        'title' => trim($valid['title']),
        'status' => $valid['status'] ?? 'draft',
    ]);

    http_response_code(201);
    echo json_encode(['success' => true, 'proposal_id' => $newId]);
}

function updateWorkResult(PDO $pdo, int $id, ?array $auth): void
{
    $data = json_decode(file_get_contents('php://input'), true) ?: [];

    $stmt = $pdo->prepare('SELECT * FROM performance_proposals WHERE proposal_id = ?');
    $stmt->execute([$id]);
    $before = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$before) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบผลงาน']);
        return;
    }

    [$valid, $error] = validateWorkResultPayload($data, false);
    if ($error !== null) {
        http_response_code(400);
        echo json_encode(['error' => $error]);
        return;
    }

    $fields = [];
    $params = [];
    $editable = [
        'personnel_id', 'proposal_type', 'title', 'description', 'impact_description',
        'quantitative_result', 'result_unit', 'submission_date', 'evaluation_score',
        'status', 'approval_level',
    ];
    $nullable = [
        'description', 'impact_description', 'quantitative_result', 'result_unit',
        'evaluation_score', 'approval_level',
    ];
    foreach ($editable as $col) {
        if (!array_key_exists($col, $valid)) {
            continue;
        }
        $value = $valid[$col];
        if (in_array($col, $nullable, true) && $value === '') {
            $value = null;
        }
        if ($col === 'personnel_id') {
            $value = intval($value);
            if (!personnelExists($pdo, $value)) {
                http_response_code(404);
                echo json_encode(['error' => 'ไม่พบบุคลากรตามรหัสที่ระบุ']);
                return;
            }
        }
        if ($col === 'title' && is_string($value)) {
            $value = trim($value);
        }
        $fields[] = "{$col} = ?";
        $params[] = $value;
    }

    if ($fields === []) {
        echo json_encode(['success' => true, 'proposal_id' => $id, 'unchanged' => true]);
        return;
    }

    $params[] = $id;
    $pdo->prepare('UPDATE performance_proposals SET ' . implode(', ', $fields) . ' WHERE proposal_id = ?')->execute($params);

    logAudit($pdo, intval($auth['user_id']), 'UPDATE', 'work_results', $id, $before, $valid);
    echo json_encode(['success' => true, 'proposal_id' => $id]);
}

function deleteWorkResult(PDO $pdo, int $id, ?array $auth): void
{
    $stmt = $pdo->prepare('SELECT * FROM performance_proposals WHERE proposal_id = ?');
    $stmt->execute([$id]);
    $before = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$before) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบผลงาน']);
        return;
    }

    $pdo->prepare('DELETE FROM performance_proposals WHERE proposal_id = ?')->execute([$id]);
    logAudit($pdo, intval($auth['user_id']), 'DELETE', 'work_results', $id, $before, null);
    echo json_encode(['success' => true, 'proposal_id' => $id]);
}
