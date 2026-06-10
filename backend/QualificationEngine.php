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

    /** ระดับเป้าหมายทั้งหมดที่แสดงในภาพรวม แยกตามประเภทตำแหน่ง */
    private const OVERVIEW_LEVELS = [
        'general' => ['O2', 'O3'],
        'academic' => ['K2', 'K3', 'K4'],
    ];

    /** เกณฑ์ "ใกล้ถึงเกณฑ์" — เหลือ 1-90 วัน (ตรงกับ NEAR_THRESHOLD_DAYS ฝั่ง frontend) */
    private const NEAR_THRESHOLD_DAYS = 90;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * สร้าง base SELECT query + parameters สำหรับ target level ที่กำหนด
     * แชร์ระหว่าง computeForLevel และ computeOverview เพื่อไม่ให้ SQL ซ้ำสองก๊อปปี้
     *
     * @param string $targetLevel รหัสระดับเป้าหมาย (e.g. K2, K3, O2)
     * @return array|null ['sql' => baseSelect, 'params' => params] หรือ null ถ้าไม่มี source levels
     */
    private function buildBaseQuery(string $targetLevel): ?array
    {
        // ดึง source level codes สำหรับ target level นี้
        $stmt = $this->pdo->prepare(
            'SELECT DISTINCT source_level_code FROM promotion_criteria WHERE target_level_code = ? AND is_active = 1'
        );
        $stmt->execute([$targetLevel]);
        $sourceLevels = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (empty($sourceLevels)) {
            return null;
        }

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
                COALESCE(dex.max_diff_count, 0) AS diverse_diff_count,
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
            ) dex ON dex.personnel_id = p.personnel_id
            WHERE p.current_level_code IN ({$placeholders})
                AND p.is_active = 1
        ";

        // Build params: targetLevel for JOIN, then source levels for IN clause
        $params = array_merge([$targetLevel], $sourceLevels);

        return ['sql' => $baseSelect, 'params' => $params];
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
        // Step 1-2: สร้าง base query (แชร์ logic กับ computeOverview)
        $base = $this->buildBaseQuery($targetLevel);

        if ($base === null) {
            return [
                'success' => true,
                'data' => [],
                'summary' => ['total' => 0, 'qualified' => 0, 'not_yet' => 0, 'check_data' => 0],
                'pagination' => ['total' => 0, 'limit' => $limit, 'offset' => $offset, 'has_more' => false]
            ];
        }

        $baseSelect = $base['sql'];
        $params = $base['params'];

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
     * สรุปภาพรวมบัญชีรายชื่อทุกระดับ (ทั่วไป + วิชาการ) จาก full dataset
     * แทนการให้ frontend ยิงรายระดับแล้วรวมเลขเอง (ผิดเมื่อข้อมูลเกิน limit ต่อหน้า)
     *
     * @return array summary รวมทุกระดับ, by_level รายระดับ, top5 ใกล้ครบเกณฑ์ที่สุดข้ามระดับ
     */
    public function computeOverview(): array
    {
        $summary = [
            'general_total' => 0,
            'academic_total' => 0,
            'qualified_total' => 0,
            'near_qualified_total' => 0,
            'not_yet_total' => 0,
            'check_data_total' => 0,
        ];
        $byLevel = [];
        $top5Pool = [];

        foreach (self::OVERVIEW_LEVELS as $category => $levels) {
            foreach ($levels as $level) {
                $base = $this->buildBaseQuery($level);

                // ระดับที่ไม่มีเกณฑ์ active — ใส่ค่าศูนย์ทั้งแถว ห้าม error
                if ($base === null) {
                    $byLevel[$level] = ['total' => 0, 'qualified' => 0, 'not_yet' => 0, 'check_data' => 0, 'near_qualified' => 0];
                    continue;
                }

                // Summary ต่อระดับจาก full dataset (BETWEEN 1 AND 90 — NULL ไม่ถูกนับโดยธรรมชาติ)
                $summarySql = "
                    SELECT
                        COUNT(*) AS total,
                        SUM(CASE WHEN sub.status = 'qualified' THEN 1 ELSE 0 END) AS qualified,
                        SUM(CASE WHEN sub.status = 'not_yet' THEN 1 ELSE 0 END) AS not_yet,
                        SUM(CASE WHEN sub.status = 'check_data' THEN 1 ELSE 0 END) AS check_data,
                        SUM(CASE WHEN sub.remaining_days BETWEEN 1 AND " . self::NEAR_THRESHOLD_DAYS . " THEN 1 ELSE 0 END) AS near_qualified
                    FROM ({$base['sql']}) AS sub
                ";
                $stmt = $this->pdo->prepare($summarySql);
                $stmt->execute($base['params']);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                $levelSummary = [
                    'total' => (int) ($row['total'] ?? 0),
                    'qualified' => (int) ($row['qualified'] ?? 0),
                    'not_yet' => (int) ($row['not_yet'] ?? 0),
                    'check_data' => (int) ($row['check_data'] ?? 0),
                    'near_qualified' => (int) ($row['near_qualified'] ?? 0),
                ];
                $byLevel[$level] = $levelSummary;

                $summary[$category === 'general' ? 'general_total' : 'academic_total'] += $levelSummary['total'];
                $summary['qualified_total'] += $levelSummary['qualified'];
                $summary['near_qualified_total'] += $levelSummary['near_qualified'];
                $summary['not_yet_total'] += $levelSummary['not_yet'];
                $summary['check_data_total'] += $levelSummary['check_data'];

                // Top 5 ของระดับนี้ — NULL remaining_days ไปท้ายสุด (ตรง logic ฝั่ง frontend เดิม)
                $dataSql = "{$base['sql']} ORDER BY (remaining_days IS NULL), remaining_days ASC LIMIT 5";
                $dataStmt = $this->pdo->prepare($dataSql);
                $dataStmt->execute($base['params']);
                $rows = $dataStmt->fetchAll(PDO::FETCH_ASSOC);

                // Format fields ให้ตรงกับ data row ของ computeForLevel + ระบุระดับเป้าหมาย
                foreach ($rows as &$r) {
                    $r['target_level'] = $level;
                    $r['qualification_date_thai'] = formatThaiDate($r['qualification_date']);
                    $r['level_start_date_thai'] = formatThaiDate($r['current_level_start_date']);
                    $r['current_level_name'] = getLevelName($r['current_level_code'] ?? '');
                    $r['remaining_days'] = $r['remaining_days'] !== null ? (int) $r['remaining_days'] : null;
                    $r['min_years'] = $r['min_years'] !== null ? (float) $r['min_years'] : null;
                    $r['supportive_days'] = (int) $r['supportive_days'];
                    $r['equivalence_days'] = (int) $r['equivalence_days'];
                    $r['diverse_diff_count'] = (int) $r['diverse_diff_count'];
                }
                unset($r);

                $top5Pool = array_merge($top5Pool, $rows);
            }
        }

        // รวมทุกระดับ → เรียง remaining_days น้อยสุดก่อน (NULL ท้ายสุด) → ตัด 5 อันดับแรก
        usort($top5Pool, function (array $a, array $b): int {
            if ($a['remaining_days'] === null && $b['remaining_days'] === null) {
                return 0;
            }
            if ($a['remaining_days'] === null) {
                return 1;
            }
            if ($b['remaining_days'] === null) {
                return -1;
            }
            return $a['remaining_days'] <=> $b['remaining_days'];
        });

        return [
            'success' => true,
            'summary' => $summary,
            'by_level' => $byLevel,
            'top5' => array_slice($top5Pool, 0, 5),
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
                COALESCE(dex.max_diff_count, 0) AS diverse_diff_count,
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
            ) dex ON dex.personnel_id = p.personnel_id
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
