<?php
// ============================================================================
// routes/personnel.php
// Personnel typeahead / search for career time-entry modals
//
// Endpoints:
//   GET /personnel?search=&limit= — ค้นหาบุคลากรที่ใช้งานอยู่ (typeahead)
// ============================================================================

include_once __DIR__ . '/../helpers.php';

/**
 * SQL สำหรับ typeahead บุคลากร — LIMIT เป็นตัวเลขที่ clamp แล้ว (ห้าม bind เป็น ?)
 * เพราะ PDO ATTR_EMULATE_PREPARES=false ทำให้ LIMIT ? พังบน MySQL/TiDB
 *
 * @return string SELECT … LIMIT N (ยังไม่รวม bind ของ search term)
 */
function personnelTypeaheadSql(int $limit = 10): string
{
    $limit = max(1, min(50, $limit));
    $fullName = sqlPersonnelFullName('p', 'px');

    return "
        SELECT p.personnel_id, p.citizen_id,
               {$fullName} AS full_name,
               p.first_name, p.last_name,
               pos.position_name AS current_position,
               o.org_name AS department
        FROM personnel p
        LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
        LEFT JOIN `position` pos ON p.current_position_id = pos.position_id
        LEFT JOIN organization o ON p.current_org_id = o.org_id
        WHERE p.is_active = 1
          AND (
                p.first_name LIKE ?
             OR p.last_name LIKE ?
             OR p.citizen_id LIKE ?
             OR p.employee_id LIKE ?
             OR {$fullName} LIKE ?
          )
        ORDER BY p.first_name, p.last_name
        LIMIT {$limit}
    ";
}

/**
 * ค้นหาบุคลากรสำหรับ typeahead
 *
 * @return list<array<string, mixed>>
 */
function searchPersonnelTypeahead(PDO $pdo, string $search, int $limit = 10): array
{
    $q = trim($search);
    // ให้สอดคล้องกับ FE typeahead (อย่างน้อย 2 ตัวอักษร)
    if (mb_strlen($q) < 2) {
        return [];
    }

    $term = "%{$q}%";
    $stmt = $pdo->prepare(personnelTypeaheadSql($limit));
    $stmt->execute([$term, $term, $term, $term, $term]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * @param PDO $pdo
 * @param string $method
 * @param array<int, string> $path
 */
function handlePersonnel(PDO $pdo, string $method, array $path): void
{
    if ($method !== 'GET') {
        respondMethodNotAllowed();
        return;
    }

    requirePermission('read', 'personnel');

    $search = (string) ($_GET['search'] ?? '');
    $limit = intval($_GET['limit'] ?? 10);
    $rows = searchPersonnelTypeahead($pdo, $search, $limit);

    echo json_encode(['success' => true, 'data' => $rows]);
}
