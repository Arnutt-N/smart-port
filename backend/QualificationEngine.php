<?php
// ============================================================================
// QualificationEngine.php
// Core qualification computation for candidate list feature
// คำนวณคุณสมบัติเลื่อนระดับจากเกณฑ์ promotion_criteria + ข้อมูลบุคลากร
//
// ใช้ DATE_ADD สำหรับคำนวณวันครบเกณฑ์ (รองรับปีอธิกสุรทิน)
// ใช้ DATEDIFF สำหรับนับวันเหลือ
// ============================================================================

include_once __DIR__ . '/helpers.php';

class QualificationEngine
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * คำนวณคุณสมบัติเลื่อนระดับสำหรับบุคลากรทั้งหมดที่อยู่ในระดับต้นทาง
     *
     * @param string $targetLevel รหัสระดับเป้าหมาย (e.g. K2, K3, O2)
     * @param string|null $search คำค้นหา (ชื่อ, นามสกุล, ตำแหน่ง)
     * @param int $limit จำนวนรายการต่อหน้า
     * @param int $offset เริ่มต้นจากรายการที่
     * @return array ผลลัพธ์พร้อม data, summary, pagination
     */
    public function computeForLevel(string $targetLevel, ?string $search, int $limit, int $offset): array
    {
        // Step 1: ดึง source level codes สำหรับ target level นี้
        $stmt = $this->pdo->prepare(
            'SELECT DISTINCT source_level_code FROM promotion_criteria WHERE target_level_code = ? AND is_active = 1'
        );
        $stmt->execute([$targetLevel]);
        $sourceLevels = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (empty($sourceLevels)) {
            return [
                'success' => true,
                'data' => [],
                'summary' => ['total' => 0, 'qualified' => 0, 'not_yet' => 0, 'check_data' => 0],
                'pagination' => ['total' => 0, 'limit' => $limit, 'offset' => $offset, 'has_more' => false]
            ];
        }

        // Step 2: Build main query
        $placeholders = implode(',', array_fill(0, count($sourceLevels), '?'));

        $baseSelect = "
            SELECT
                p.personnel_id,
                CONCAT(p.first_name, ' ', p.last_name) AS full_name,
                pos.position_name AS current_position,
                p.current_level_code,
                p.current_level_start_date,
                COALESCE(p.education_level, 'BACHELOR') AS education_level,
                pc.min_years,
                o.org_name AS department,
                COALESCE(sup.total_supportive_days, 0) AS supportive_days,
                COALESCE(eq.total_equivalence_days, 0) AS equivalence_days,
                COALESCE(div.max_diff_count, 0) AS diverse_diff_count,
                CASE
                    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN NULL
                    ELSE DATE_SUB(
                        DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
                        INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0)) AS UNSIGNED) DAY
                    )
                END AS qualification_date,
                CASE
                    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN NULL
                    ELSE DATEDIFF(
                        DATE_SUB(
                            DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
                            INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0)) AS UNSIGNED) DAY
                        ),
                        CURDATE()
                    )
                END AS remaining_days,
                CASE
                    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN 'check_data'
                    WHEN pc.min_years IS NULL THEN 'check_data'
                    WHEN DATEDIFF(
                        DATE_SUB(
                            DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
                            INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0)) AS UNSIGNED) DAY
                        ),
                        CURDATE()
                    ) <= 0 THEN 'qualified'
                    ELSE 'not_yet'
                END AS status
            FROM personnel p
            LEFT JOIN position pos ON p.current_position_id = pos.position_id
            LEFT JOIN organization o ON p.current_org_id = o.org_id
            LEFT JOIN promotion_criteria pc
                ON pc.target_level_code = ?
                AND pc.source_level_code = p.current_level_code
                AND (pc.education_condition = COALESCE(p.education_level, 'BACHELOR') OR pc.education_condition = 'ANY')
                AND pc.is_active = 1
            LEFT JOIN (
                SELECT personnel_id, SUM(effective_days) AS total_supportive_days
                FROM supportive_experience
                GROUP BY personnel_id
            ) sup ON sup.personnel_id = p.personnel_id
            LEFT JOIN (
                SELECT personnel_id, SUM(approved_total_days) AS total_equivalence_days
                FROM position_equivalence
                WHERE approval_status = 'APPROVED'
                GROUP BY personnel_id
            ) eq ON eq.personnel_id = p.personnel_id
            LEFT JOIN (
                SELECT personnel_id, MAX(diff_count) AS max_diff_count
                FROM diverse_experience
                GROUP BY personnel_id
            ) div ON div.personnel_id = p.personnel_id
            WHERE p.current_level_code IN ({$placeholders})
                AND p.is_active = 1
        ";

        // Build params: targetLevel for JOIN, then source levels for IN clause
        $params = [$targetLevel];
        $params = array_merge($params, $sourceLevels);

        // Step 3: Apply search filter
        $searchClause = '';
        if (!empty($search)) {
            $searchClause = ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR pos.position_name LIKE ?)';
            $searchTerm = "%{$search}%";
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
        }

        // Step 4: Count query (for pagination total)
        $countSql = "SELECT COUNT(*) as total FROM ({$baseSelect}{$searchClause}) AS sub";
        $countStmt = $this->pdo->prepare($countSql);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetch(PDO::FETCH_ASSOC)['total'];

        // Step 5: Summary counts query
        $summarySql = "
            SELECT
                SUM(CASE WHEN sub.status = 'qualified' THEN 1 ELSE 0 END) AS qualified,
                SUM(CASE WHEN sub.status = 'not_yet' THEN 1 ELSE 0 END) AS not_yet,
                SUM(CASE WHEN sub.status = 'check_data' THEN 1 ELSE 0 END) AS check_data
            FROM ({$baseSelect}{$searchClause}) AS sub
        ";
        $summaryStmt = $this->pdo->prepare($summarySql);
        $summaryStmt->execute($params);
        $summaryRow = $summaryStmt->fetch(PDO::FETCH_ASSOC);

        // Step 6: Data query with ORDER BY + LIMIT/OFFSET
        $limit = max(1, intval($limit));
        $offset = max(0, intval($offset));
        $dataSql = "{$baseSelect}{$searchClause} ORDER BY remaining_days ASC LIMIT {$limit} OFFSET {$offset}";
        $dataStmt = $this->pdo->prepare($dataSql);
        $dataStmt->execute($params);
        $rows = $dataStmt->fetchAll(PDO::FETCH_ASSOC);

        // Step 7: Add formatted fields using helpers
        foreach ($rows as &$row) {
            $row['qualification_date_thai'] = formatThaiDate($row['qualification_date']);
            $row['level_start_date_thai'] = formatThaiDate($row['current_level_start_date']);
            $row['current_level_name'] = getLevelName($row['current_level_code'] ?? '');
            $row['remaining_days'] = $row['remaining_days'] !== null ? (int) $row['remaining_days'] : null;
            $row['min_years'] = $row['min_years'] !== null ? (float) $row['min_years'] : null;

            // Diverse status -- only meaningful for M1 (per D-05, D-06, D-07, D-08)
            if ($targetLevel === 'M1') {
                $row['diverse_status'] = ((int)$row['diverse_diff_count'] >= 3) ? 'DIFF_PASS' : 'DIFF_NOT_YET';
            } else {
                $row['diverse_status'] = null;
            }

            // Cast numeric fields (per D-13, D-14)
            $row['supportive_days'] = (int)$row['supportive_days'];
            $row['equivalence_days'] = (int)$row['equivalence_days'];
            $row['diverse_diff_count'] = (int)$row['diverse_diff_count'];
        }
        unset($row);

        return [
            'success' => true,
            'data' => $rows,
            'summary' => [
                'total' => $total,
                'qualified' => (int) ($summaryRow['qualified'] ?? 0),
                'not_yet' => (int) ($summaryRow['not_yet'] ?? 0),
                'check_data' => (int) ($summaryRow['check_data'] ?? 0),
            ],
            'pagination' => [
                'total' => $total,
                'limit' => $limit,
                'offset' => $offset,
                'has_more' => ($offset + $limit) < $total,
            ]
        ];
    }

    /**
     * คำนวณรายละเอียดคุณสมบัติเลื่อนระดับสำหรับบุคลากรรายบุคคล
     *
     * @param string $targetLevel รหัสระดับเป้าหมาย
     * @param int $personnelId รหัสบุคลากร
     * @return array|null ข้อมูลคุณสมบัติ หรือ null ถ้าไม่พบ
     */
    public function computeDetail(string $targetLevel, int $personnelId): ?array
    {
        $sql = "
            SELECT
                p.personnel_id,
                p.citizen_id,
                CONCAT(p.first_name, ' ', p.last_name) AS full_name,
                p.first_name,
                p.last_name,
                p.hire_date,
                pos.position_name AS current_position,
                p.current_level_code,
                p.current_level_start_date,
                COALESCE(p.education_level, 'BACHELOR') AS education_level,
                pc.min_years,
                pc.education_condition,
                o.org_name AS department,
                COALESCE(sup.total_supportive_days, 0) AS supportive_days,
                COALESCE(eq.total_equivalence_days, 0) AS equivalence_days,
                COALESCE(div.max_diff_count, 0) AS diverse_diff_count,
                CASE
                    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN NULL
                    ELSE DATE_SUB(
                        DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
                        INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0)) AS UNSIGNED) DAY
                    )
                END AS qualification_date,
                CASE
                    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN NULL
                    ELSE DATEDIFF(
                        DATE_SUB(
                            DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
                            INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0)) AS UNSIGNED) DAY
                        ),
                        CURDATE()
                    )
                END AS remaining_days,
                CASE
                    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN 'check_data'
                    WHEN pc.min_years IS NULL THEN 'check_data'
                    WHEN DATEDIFF(
                        DATE_SUB(
                            DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
                            INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0)) AS UNSIGNED) DAY
                        ),
                        CURDATE()
                    ) <= 0 THEN 'qualified'
                    ELSE 'not_yet'
                END AS status
            FROM personnel p
            LEFT JOIN position pos ON p.current_position_id = pos.position_id
            LEFT JOIN organization o ON p.current_org_id = o.org_id
            LEFT JOIN promotion_criteria pc
                ON pc.target_level_code = ?
                AND pc.source_level_code = p.current_level_code
                AND (pc.education_condition = COALESCE(p.education_level, 'BACHELOR') OR pc.education_condition = 'ANY')
                AND pc.is_active = 1
            LEFT JOIN (
                SELECT personnel_id, SUM(effective_days) AS total_supportive_days
                FROM supportive_experience
                GROUP BY personnel_id
            ) sup ON sup.personnel_id = p.personnel_id
            LEFT JOIN (
                SELECT personnel_id, SUM(approved_total_days) AS total_equivalence_days
                FROM position_equivalence
                WHERE approval_status = 'APPROVED'
                GROUP BY personnel_id
            ) eq ON eq.personnel_id = p.personnel_id
            LEFT JOIN (
                SELECT personnel_id, MAX(diff_count) AS max_diff_count
                FROM diverse_experience
                GROUP BY personnel_id
            ) div ON div.personnel_id = p.personnel_id
            WHERE p.personnel_id = ?
                AND p.is_active = 1
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$targetLevel, $personnelId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        // Add formatted fields
        $row['qualification_date_thai'] = formatThaiDate($row['qualification_date']);
        $row['level_start_date_thai'] = formatThaiDate($row['current_level_start_date']);
        $row['hire_date_thai'] = formatThaiDate($row['hire_date']);
        $row['current_level_name'] = getLevelName($row['current_level_code'] ?? '');
        $row['remaining_days'] = $row['remaining_days'] !== null ? (int) $row['remaining_days'] : null;
        $row['min_years'] = $row['min_years'] !== null ? (float) $row['min_years'] : null;

        // Diverse status -- only meaningful for M1 (per D-05, D-06, D-07, D-08)
        if ($targetLevel === 'M1') {
            $row['diverse_status'] = ((int)$row['diverse_diff_count'] >= 3) ? 'DIFF_PASS' : 'DIFF_NOT_YET';
        } else {
            $row['diverse_status'] = null;
        }

        // Cast numeric fields (per D-13, D-14)
        $row['supportive_days'] = (int)$row['supportive_days'];
        $row['equivalence_days'] = (int)$row['equivalence_days'];
        $row['diverse_diff_count'] = (int)$row['diverse_diff_count'];

        return [
            'success' => true,
            'data' => $row,
        ];
    }
}
