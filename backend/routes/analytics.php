<?php
// ============================================================================
// routes/analytics.php
// Analytics Route Handler — สรุปข้อมูลเชิงวิเคราะห์ (read-only)
//
// รวมตัวเลขจากหลายตาราง; แต่ละ query ถูกห่อ try/catch → คืน 0 ถ้าตารางไม่มี
// (กัน endpoint พังทั้งอันเพราะตารางใดตารางหนึ่งหาย เช่นต่าง schema/TiDB)
//
// Endpoints:
//   GET /analytics    — สรุปตัวเลขภาพรวม + การกระจายสถานะผลงาน
// ============================================================================

include_once __DIR__ . '/../helpers.php';

function handleAnalytics(PDO $pdo, string $method, array $path): void
{
    requirePermission('read', 'analytics');

    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    getAnalyticsSummary($pdo);
}

/** คืนค่าตัวเลขเดี่ยวจาก query; ถ้า error (ตารางหาย ฯลฯ) คืน 0 */
function analyticsScalar(PDO $pdo, string $sql, array $params = []): int
{
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return intval($stmt->fetchColumn());
    } catch (Throwable $e) {
        error_log('[analytics] scalar failed: ' . $e->getMessage());
        return 0;
    }
}

/** คืน list ของ {label,count}; ถ้า error คืน [] */
function analyticsGroup(PDO $pdo, string $sql): array
{
    try {
        $stmt = $pdo->query($sql);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        error_log('[analytics] group failed: ' . $e->getMessage());
        return [];
    }
}

function getAnalyticsSummary(PDO $pdo): void
{
    $totals = [
        'personnel' => analyticsScalar($pdo, "SELECT COUNT(*) FROM personnel WHERE is_active = 1"),
        'civil_servants' => analyticsScalar($pdo, "SELECT COUNT(*) FROM civil_servants WHERE is_active = 1"),
        'awards' => analyticsScalar($pdo, "SELECT COUNT(*) FROM awards"),
        'decorations' => analyticsScalar($pdo, "SELECT COUNT(*) FROM royal_decorations"),
        'work_results' => analyticsScalar($pdo, "SELECT COUNT(*) FROM performance_proposals WHERE is_active = 1"),
        'retirement_upcoming' => analyticsScalar(
            $pdo,
            "SELECT COUNT(*) FROM civil_servants
             WHERE is_active = 1 AND retirement_date IS NOT NULL
               AND retirement_date >= CURDATE()
               AND retirement_date <= DATE_ADD(CURDATE(), INTERVAL 12 MONTH)"
        ),
    ];

    $proposalsByStatus = analyticsGroup(
        $pdo,
        "SELECT status AS label, COUNT(*) AS count
         FROM performance_proposals WHERE is_active = 1
         GROUP BY status ORDER BY count DESC"
    );

    $awardsByType = analyticsGroup(
        $pdo,
        "SELECT award_type AS label, COUNT(*) AS count
         FROM awards GROUP BY award_type ORDER BY count DESC"
    );

    echo json_encode([
        'success' => true,
        'data' => [
            'totals' => $totals,
            'proposals_by_status' => $proposalsByStatus,
            'awards_by_type' => $awardsByType,
        ],
    ]);
}
