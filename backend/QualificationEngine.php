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

    /** @var array<string, list<string>>|null */
    private ?array $criteriaSourceCache = null;

    /** @var array<string, array{sql:string,params:array}|null>|null */
    private ?array $builtQueryCache = null;

    /** ระดับเป้าหมายทั้งหมดที่แสดงในภาพรวม แยกตามประเภทตำแหน่ง */
    private const OVERVIEW_LEVELS = [
        'general' => ['O2', 'O3'],
        'academic' => ['K2', 'K3', 'K4'],
        'supportive' => ['M1', 'M2'],
        'management' => ['S1', 'S2'],
    ];

    /**
     * ระดับสายอำนวยการ(M1/M2)/บริหาร(S1/S2) — ใช้ buildExecutiveQuery (multi-path combination)
     * แทน buildBaseQuery (linear) เพราะเกณฑ์อ้าง "ระดับก่อนหน้า" + gate (3 ต่าง / เทียบตำแหน่ง)
     */
    private const EXECUTIVE_LEVELS = ['M1', 'M2', 'S1', 'S2'];

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
        $sourceLevels = $this->getSourceLevelsForTarget($targetLevel);

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
                COALESCE(mult.total_multiplier_days, 0) AS multiplier_days,
                CASE
                    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN NULL
                    ELSE DATE_SUB(
                        DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
                        INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0) + COALESCE(mult.total_multiplier_days, 0)) AS UNSIGNED) DAY
                    )
                END AS qualification_date,
                CASE
                    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN NULL
                    ELSE DATEDIFF(
                        DATE_SUB(
                            DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
                            INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0) + COALESCE(mult.total_multiplier_days, 0)) AS UNSIGNED) DAY
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
                            INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0) + COALESCE(mult.total_multiplier_days, 0)) AS UNSIGNED) DAY
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
            LEFT JOIN (
                SELECT personnel_id, SUM(bonus_days) AS total_multiplier_days
                FROM multiplier_experience
                GROUP BY personnel_id
            ) mult ON mult.personnel_id = p.personnel_id
            WHERE p.current_level_code IN ({$placeholders})
                AND p.is_active = 1
        ";

        // Build params: targetLevel for JOIN, then source levels for IN clause
        $params = array_merge([$targetLevel], $sourceLevels);

        return ['sql' => $baseSelect, 'params' => $params];
    }

    /**
     * เลือก query builder ตามประเภทระดับเป้าหมาย
     * M/S (อำนวยการ/บริหาร) = multi-path combination; K/O (วิชาการ/ทั่วไป) = linear
     */
    private function buildQuery(string $targetLevel): ?array
    {
        if ($this->builtQueryCache !== null && array_key_exists($targetLevel, $this->builtQueryCache)) {
            return $this->builtQueryCache[$targetLevel];
        }

        $built = in_array($targetLevel, self::EXECUTIVE_LEVELS, true)
            ? $this->buildExecutiveQuery($targetLevel)
            : $this->buildBaseQuery($targetLevel);

        if ($this->builtQueryCache !== null) {
            $this->builtQueryCache[$targetLevel] = $built;
        }

        return $built;
    }

    /**
     * โหลด promotion_criteria ครั้งเดียวต่อ request overview — ลด N+1 lookup
     *
     * @return list<string>
     */
    private function getSourceLevelsForTarget(string $targetLevel): array
    {
        if ($this->criteriaSourceCache === null) {
            $this->criteriaSourceCache = [];
            $stmt = $this->pdo->query(
                'SELECT target_level_code, source_level_code
                 FROM promotion_criteria
                 WHERE is_active = 1'
            );
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $target = (string) $row['target_level_code'];
                $source = (string) $row['source_level_code'];
                $this->criteriaSourceCache[$target][] = $source;
            }
        }

        $levels = $this->criteriaSourceCache[$targetLevel] ?? [];
        return array_values(array_unique($levels));
    }

    /**
     * สร้าง query สำหรับสายอำนวยการ(M1/M2)/บริหาร(S1/S2) — multi-path combination
     *
     * ต่างจาก buildBaseQuery (linear) ตรงที่:
     *   - แต่ละระดับมีได้หลาย "เส้นทาง" (path) ที่ผ่านเกณฑ์ → เลือกวันที่ "เร็วสุด" (MIN) = วันมีคุณสมบัติ
     *   - บาง path อ้าง "ระดับก่อนหน้า" (prev-level) จาก personnel_position_history (combination)
     *   - gate: M1 ต้องผ่าน 3 ต่าง (diverse_experience), S1(K4) ต้องมีเทียบตำแหน่ง (position_equivalence)
     *     ถ้าขาด precondition → ไม่มี path → status = check_data
     *
     * เกณฑ์ pin จาก Excel master-prep (ชีท to-M1/M2/S1/S2) — ดู research/executive-track-criteria.md
     * คืน column shape เดียวกับ buildBaseQuery เพื่อให้ computeForLevel/computeOverview reuse ได้
     *
     * @param string $targetLevel M1, M2, S1, S2
     * @return array|null ['sql' => ..., 'params' => []] (constant ทั้งหมด ไม่มี user input → ปลอดภัยจาก injection)
     */
    private function buildExecutiveQuery(string $targetLevel): ?array
    {
        // gate: ผ่าน 3 ต่าง (วันครบ = MIN(qualified_date) ที่ diff_count >= 3)
        $div = "JOIN (
                    SELECT personnel_id, MIN(qualified_date) AS diverse_date
                    FROM diverse_experience
                    WHERE diff_count >= 3 AND qualified_date IS NOT NULL
                    GROUP BY personnel_id
                ) dv ON dv.personnel_id = e.personnel_id";
        // gate: มีเทียบตำแหน่ง (อำนวยการ) ที่อนุมัติแล้ว
        $eqGate = "JOIN (
                    SELECT personnel_id
                    FROM position_equivalence
                    WHERE approval_status = 'APPROVED'
                    GROUP BY personnel_id
                ) eqx ON eqx.personnel_id = e.personnel_id";
        // prev-level start date (combination) — วันเข้าระดับก่อนหน้าจากประวัติการดำรงตำแหน่ง
        $histK3 = "JOIN (
                    SELECT personnel_id, MIN(effective_date) AS level_start
                    FROM personnel_position_history WHERE position_level = 'K3'
                    GROUP BY personnel_id
                ) hk3 ON hk3.personnel_id = e.personnel_id";
        $histO3 = "JOIN (
                    SELECT personnel_id, MIN(effective_date) AS level_start
                    FROM personnel_position_history WHERE position_level = 'O3'
                    GROUP BY personnel_id
                ) ho3 ON ho3.personnel_id = e.personnel_id";
        // วันเทียบตำแหน่งสะสม (อนุมัติแล้ว) — gate + ค่า สำหรับ S2 paths (บต/ทว + เทียบ)
        $eqvSum = "JOIN (
                    SELECT personnel_id, SUM(approved_total_days) AS eqv_days
                    FROM position_equivalence
                    WHERE approval_status = 'APPROVED'
                    GROUP BY personnel_id
                ) eqs ON eqs.personnel_id = e.personnel_id AND eqs.eqv_days > 0";
        // วันดำรง M1/M2 สะสม (ช่วงปิด end_date NOT NULL) — S2 path บต/ทว + อต-อส + เทียบ
        $msTenure = "LEFT JOIN (
                    SELECT personnel_id, SUM(DATEDIFF(end_date, effective_date)) AS ms_days
                    FROM personnel_position_history
                    WHERE position_level IN ('M1','M2') AND end_date IS NOT NULL
                    GROUP BY personnel_id
                ) mst ON mst.personnel_id = e.personnel_id";

        // current_level_start_date ต้องไม่ NULL สำหรับ path ที่นับจากระดับปัจจุบัน
        $curOk = "e.is_active = 1 AND e.current_level_start_date IS NOT NULL";

        // S2 backdate combination (Excel: today หักล้าง → start − Σวันหักลบ + 3ปี, พื้น = start+1วัน)
        $s2Backdate = static fn (string $subtractDays): string =>
            "GREATEST(
                DATE_ADD(DATE_SUB(e.current_level_start_date, INTERVAL ({$subtractDays}) DAY), INTERVAL 3 YEAR),
                DATE_ADD(e.current_level_start_date, INTERVAL 1 DAY)
            )";

        switch ($targetLevel) {
            case 'M1': // ดำรง K3 +3ปี หรือ O3 +6ปี + ผ่าน 3 ต่าง; วันมีคุณสมบัติ = MAX(วันดำรงครบ, วันครบ3ต่าง)
                $sources = ['K3', 'O3'];
                $paths = [
                    "SELECT e.personnel_id, GREATEST(DATE_ADD(e.current_level_start_date, INTERVAL 3 YEAR), dv.diverse_date) AS qual_date
                     FROM personnel e {$div} WHERE e.current_level_code = 'K3' AND {$curOk}",
                    "SELECT e.personnel_id, GREATEST(DATE_ADD(e.current_level_start_date, INTERVAL 6 YEAR), dv.diverse_date) AS qual_date
                     FROM personnel e {$div} WHERE e.current_level_code = 'O3' AND {$curOk}",
                ];
                break;

            case 'M2': // M1+1 / M1+K3รวม4 / M1+O3รวม7 / K3+4 / O3+7 / K4+3ต่าง (เลือก path เร็วสุด)
                $sources = ['M1', 'K3', 'O3', 'K4'];
                $paths = [
                    "SELECT e.personnel_id, DATE_ADD(e.current_level_start_date, INTERVAL 1 YEAR) AS qual_date
                     FROM personnel e WHERE e.current_level_code = 'M1' AND {$curOk}",
                    // combination นับจาก level_start ใน history (ไม่ใช้ current_level_start_date);
                    // effective_date เป็น NOT NULL → level_start ไม่มีทางเป็น NULL แต่ guard ไว้กัน data สกปรก
                    "SELECT e.personnel_id, DATE_ADD(hk3.level_start, INTERVAL 4 YEAR) AS qual_date
                     FROM personnel e {$histK3} WHERE e.current_level_code = 'M1' AND e.is_active = 1 AND hk3.level_start IS NOT NULL",
                    "SELECT e.personnel_id, DATE_ADD(ho3.level_start, INTERVAL 7 YEAR) AS qual_date
                     FROM personnel e {$histO3} WHERE e.current_level_code = 'M1' AND e.is_active = 1 AND ho3.level_start IS NOT NULL",
                    "SELECT e.personnel_id, DATE_ADD(e.current_level_start_date, INTERVAL 4 YEAR) AS qual_date
                     FROM personnel e WHERE e.current_level_code = 'K3' AND {$curOk}",
                    "SELECT e.personnel_id, DATE_ADD(e.current_level_start_date, INTERVAL 7 YEAR) AS qual_date
                     FROM personnel e WHERE e.current_level_code = 'O3' AND {$curOk}",
                    "SELECT e.personnel_id, GREATEST(e.current_level_start_date, dv.diverse_date) AS qual_date
                     FROM personnel e {$div} WHERE e.current_level_code = 'K4' AND {$curOk}",
                ];
                break;

            case 'S1': // M1/M2/K4 ดำรง +2ปี (K4 ต้องมีเทียบตำแหน่งอำนวยการ)
                $sources = ['M1', 'M2', 'K4'];
                $paths = [
                    "SELECT e.personnel_id, DATE_ADD(e.current_level_start_date, INTERVAL 2 YEAR) AS qual_date
                     FROM personnel e WHERE e.current_level_code = 'M1' AND {$curOk}",
                    "SELECT e.personnel_id, DATE_ADD(e.current_level_start_date, INTERVAL 2 YEAR) AS qual_date
                     FROM personnel e WHERE e.current_level_code = 'M2' AND {$curOk}",
                    "SELECT e.personnel_id, DATE_ADD(e.current_level_start_date, INTERVAL 2 YEAR) AS qual_date
                     FROM personnel e {$eqGate} WHERE e.current_level_code = 'K4' AND {$curOk}",
                ];
                break;

            case 'S2': // S1+1ปี / บต+เทียบ / บต+อต-อส+เทียบ / ทว(K5)+อต-อส+เทียบ ≥3ปี (เลือก path เร็วสุด)
                $sources = ['S1', 'K5'];
                $ac3 = $s2Backdate('eqs.eqv_days');                              // บต + เทียบ
                $ag3 = $s2Backdate('eqs.eqv_days + COALESCE(mst.ms_days, 0)');   // บต + อต/อส + เทียบ
                $paths = [
                    // W3: บต ดำรง 1 ปี
                    "SELECT e.personnel_id, DATE_ADD(e.current_level_start_date, INTERVAL 1 YEAR) AS qual_date
                     FROM personnel e WHERE e.current_level_code = 'S1' AND {$curOk}",
                    // AC3: บต + เทียบตำแหน่ง รวม ≥ 3 ปี (gate: มีเทียบ)
                    "SELECT e.personnel_id, {$ac3} AS qual_date
                     FROM personnel e {$eqvSum} WHERE e.current_level_code = 'S1' AND {$curOk}",
                    // AG3: บต + อต/อส (prev M1/M2) + เทียบ รวม ≥ 3 ปี
                    "SELECT e.personnel_id, {$ag3} AS qual_date
                     FROM personnel e {$eqvSum} {$msTenure} WHERE e.current_level_code = 'S1' AND {$curOk}",
                    // AK3: ทว(K5) + อต/อส + เทียบ รวม ≥ 3 ปี
                    "SELECT e.personnel_id, {$ag3} AS qual_date
                     FROM personnel e {$eqvSum} {$msTenure} WHERE e.current_level_code = 'K5' AND {$curOk}",
                ];
                break;

            default:
                return null;
        }

        $pathsUnion = implode("\n            UNION ALL\n            ", $paths);
        $sourceList = "'" . implode("','", $sources) . "'";
        $minYearsCase = $this->executiveMinYearsCase($targetLevel);

        $sql = "
            SELECT
                p.personnel_id,
                CONCAT(p.first_name, ' ', p.last_name) AS full_name,
                pos.position_name AS current_position,
                p.current_level_code,
                p.current_level_start_date,
                COALESCE(p.education_level, 'BACHELOR') AS education_level,
                {$minYearsCase} AS min_years,
                o.org_name AS department,
                COALESCE(sup.total_supportive_days, 0) AS supportive_days,
                COALESCE(eq.total_equivalence_days, 0) AS equivalence_days,
                COALESCE(dex.max_diff_count, 0) AS diverse_diff_count,
                pa.qual_date AS qualification_date,
                CASE WHEN pa.qual_date IS NULL THEN NULL ELSE DATEDIFF(pa.qual_date, CURDATE()) END AS remaining_days,
                CASE
                    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN 'check_data'
                    WHEN pa.qual_date IS NULL THEN 'check_data'
                    WHEN DATEDIFF(pa.qual_date, CURDATE()) <= 0 THEN 'qualified'
                    ELSE 'not_yet'
                END AS status
            FROM personnel p
            LEFT JOIN position pos ON p.current_position_id = pos.position_id
            LEFT JOIN organization o ON p.current_org_id = o.org_id
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
            LEFT JOIN (
                SELECT personnel_id, MIN(qual_date) AS qual_date
                FROM (
            {$pathsUnion}
                ) u
                GROUP BY personnel_id
            ) pa ON pa.personnel_id = p.personnel_id
            WHERE p.current_level_code IN ({$sourceList})
                AND p.is_active = 1
        ";

        return ['sql' => $sql, 'params' => []];
    }

    /**
     * เกณฑ์ขั้นต่ำ (ปี) สำหรับแสดงผล — อิง path ตรงตามระดับปัจจุบัน (ไม่รวม combination)
     */
    private function executiveMinYearsCase(string $targetLevel): string
    {
        switch ($targetLevel) {
            case 'M1':
                return "CASE p.current_level_code WHEN 'K3' THEN 3.0 WHEN 'O3' THEN 6.0 ELSE NULL END";
            case 'M2':
                return "CASE p.current_level_code WHEN 'M1' THEN 1.0 WHEN 'K3' THEN 4.0 WHEN 'O3' THEN 7.0 WHEN 'K4' THEN 0.0 ELSE NULL END";
            case 'S1':
                return "2.0";
            case 'S2':
                return "1.0";
            default:
                return "NULL";
        }
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
        // Step 1-2: สร้าง base query (แชร์ logic กับ computeOverview) — dispatch K/O linear vs M/S combination
        $base = $this->buildQuery($targetLevel);

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
            $row['multiplier_days'] = (int)($row['multiplier_days'] ?? 0);
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
     * สรุปภาพรวมบัญชีรายชื่อทุกระดับ จาก full dataset
     * ใช้ UNION ALL ทุกระดับ + aggregate/window (~3 queries รวม criteria cache)
     * แทนการยิง summary+top5 ทีละระดับ (~18 queries)
     *
     * @return array summary รวมทุกระดับ, by_level รายระดับ, top5 ใกล้ครบเกณฑ์ที่สุดข้ามระดับ
     */
    public function computeOverview(): array
    {
        $this->criteriaSourceCache = null;
        $this->builtQueryCache = [];

        $summary = [
            'general_total' => 0,
            'academic_total' => 0,
            'supportive_total' => 0,
            'management_total' => 0,
            'qualified_total' => 0,
            'near_qualified_total' => 0,
            'not_yet_total' => 0,
            'check_data_total' => 0,
        ];
        $byLevel = [];
        $levelCategory = [];

        foreach (self::OVERVIEW_LEVELS as $category => $levels) {
            foreach ($levels as $level) {
                $levelCategory[$level] = $category;
                $byLevel[$level] = [
                    'total' => 0,
                    'qualified' => 0,
                    'not_yet' => 0,
                    'check_data' => 0,
                    'near_qualified' => 0,
                ];
            }
        }

        $union = $this->buildOverviewUnionSql();
        if ($union === null) {
            return [
                'success' => true,
                'summary' => $summary,
                'by_level' => $byLevel,
                'top5' => [],
            ];
        }

        $near = self::NEAR_THRESHOLD_DAYS;
        $summarySql = "
            SELECT
                target_level,
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) AS qualified,
                SUM(CASE WHEN status = 'not_yet' THEN 1 ELSE 0 END) AS not_yet,
                SUM(CASE WHEN status = 'check_data' THEN 1 ELSE 0 END) AS check_data,
                SUM(CASE WHEN remaining_days BETWEEN 1 AND {$near} THEN 1 ELSE 0 END) AS near_qualified
            FROM ({$union['sql']}) AS all_levels
            GROUP BY target_level
        ";
        $summaryStmt = $this->pdo->prepare($summarySql);
        $summaryStmt->execute($union['params']);
        foreach ($summaryStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $level = (string) $row['target_level'];
            $levelSummary = [
                'total' => (int) ($row['total'] ?? 0),
                'qualified' => (int) ($row['qualified'] ?? 0),
                'not_yet' => (int) ($row['not_yet'] ?? 0),
                'check_data' => (int) ($row['check_data'] ?? 0),
                'near_qualified' => (int) ($row['near_qualified'] ?? 0),
            ];
            $byLevel[$level] = $levelSummary;

            $category = $levelCategory[$level] ?? null;
            if ($category !== null) {
                $summary[$category . '_total'] += $levelSummary['total'];
            }
            $summary['qualified_total'] += $levelSummary['qualified'];
            $summary['near_qualified_total'] += $levelSummary['near_qualified'];
            $summary['not_yet_total'] += $levelSummary['not_yet'];
            $summary['check_data_total'] += $levelSummary['check_data'];
        }

        // Top 5 ข้ามระดับ — NULL remaining_days ท้ายสุด (ตรง logic เดิม)
        $top5Sql = "
            SELECT *
            FROM (
                SELECT
                    all_levels.*,
                    ROW_NUMBER() OVER (
                        ORDER BY (remaining_days IS NULL), remaining_days ASC
                    ) AS overview_rank
                FROM ({$union['sql']}) AS all_levels
            ) AS ranked
            WHERE overview_rank <= 5
            ORDER BY overview_rank
        ";
        $top5Stmt = $this->pdo->prepare($top5Sql);
        $top5Stmt->execute($union['params']);
        $top5 = $top5Stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($top5 as &$r) {
            unset($r['overview_rank']);
            $r['qualification_date_thai'] = formatThaiDate($r['qualification_date']);
            $r['level_start_date_thai'] = formatThaiDate($r['current_level_start_date']);
            $r['current_level_name'] = getLevelName($r['current_level_code'] ?? '');
            $r['remaining_days'] = $r['remaining_days'] !== null ? (int) $r['remaining_days'] : null;
            $r['min_years'] = $r['min_years'] !== null ? (float) $r['min_years'] : null;
            $r['supportive_days'] = (int) $r['supportive_days'];
            $r['equivalence_days'] = (int) $r['equivalence_days'];
            $r['diverse_diff_count'] = (int) $r['diverse_diff_count'];
            $r['multiplier_days'] = (int) ($r['multiplier_days'] ?? 0);
        }
        unset($r);

        return [
            'success' => true,
            'summary' => $summary,
            'by_level' => $byLevel,
            'top5' => $top5,
        ];
    }

    /**
     * รวม base query ทุกระดับใน OVERVIEW_LEVELS เป็น UNION ALL
     * โปรเจกต์คอลัมน์ร่วม — M/S ยังไม่มี multiplier_days ใน buildExecutiveQuery → ใส่ 0
     *
     * @return array{sql:string,params:array}|null
     */
    private function buildOverviewUnionSql(): ?array
    {
        $branches = [];
        $params = [];
        $aliasIndex = 0;

        foreach (self::OVERVIEW_LEVELS as $levels) {
            foreach ($levels as $level) {
                $base = $this->buildQuery($level);
                if ($base === null) {
                    continue;
                }

                $alias = 'ov' . $aliasIndex++;
                $isExecutive = in_array($level, self::EXECUTIVE_LEVELS, true);
                $multiplierExpr = $isExecutive
                    ? '0 AS multiplier_days'
                    : "{$alias}.multiplier_days AS multiplier_days";

                // คอลัมน์ร่วม + target_level (bind เป็น param กัน hardcode ซ้ำ)
                $branches[] = "
                    SELECT
                        {$alias}.personnel_id AS personnel_id,
                        {$alias}.full_name AS full_name,
                        {$alias}.current_position AS current_position,
                        {$alias}.current_level_code AS current_level_code,
                        {$alias}.current_level_start_date AS current_level_start_date,
                        {$alias}.education_level AS education_level,
                        {$alias}.min_years AS min_years,
                        {$alias}.department AS department,
                        {$alias}.supportive_days AS supportive_days,
                        {$alias}.equivalence_days AS equivalence_days,
                        {$alias}.diverse_diff_count AS diverse_diff_count,
                        {$multiplierExpr},
                        {$alias}.qualification_date AS qualification_date,
                        {$alias}.remaining_days AS remaining_days,
                        {$alias}.status AS status,
                        ? AS target_level
                    FROM ({$base['sql']}) AS {$alias}
                ";
                foreach ($base['params'] as $param) {
                    $params[] = $param;
                }
                $params[] = $level;
            }
        }

        if ($branches === []) {
            return null;
        }

        return [
            'sql' => implode("\nUNION ALL\n", $branches),
            'params' => $params,
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
        // M/S (อำนวยการ/บริหาร) ใช้ multi-path เดียวกับ list — detail ต้องตรงกับ list เสมอ (legal)
        if (in_array($targetLevel, self::EXECUTIVE_LEVELS, true)) {
            return $this->computeExecutiveDetail($targetLevel, $personnelId);
        }

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
                COALESCE(mult.total_multiplier_days, 0) AS multiplier_days,
                CASE
                    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN NULL
                    ELSE DATE_SUB(
                        DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
                        INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0) + COALESCE(mult.total_multiplier_days, 0)) AS UNSIGNED) DAY
                    )
                END AS qualification_date,
                CASE
                    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN NULL
                    ELSE DATEDIFF(
                        DATE_SUB(
                            DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
                            INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0) + COALESCE(mult.total_multiplier_days, 0)) AS UNSIGNED) DAY
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
                            INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0) + COALESCE(mult.total_multiplier_days, 0)) AS UNSIGNED) DAY
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
            LEFT JOIN (
                SELECT personnel_id, SUM(bonus_days) AS total_multiplier_days
                FROM multiplier_experience
                GROUP BY personnel_id
            ) mult ON mult.personnel_id = p.personnel_id
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
        $row['multiplier_days'] = (int)($row['multiplier_days'] ?? 0);

        return [
            'success' => true,
            'data' => $row,
        ];
    }

    /**
     * รายละเอียดรายบุคคลสำหรับสายอำนวยการ/บริหาร — ใช้ buildExecutiveQuery เดียวกับ list
     * เพื่อให้ qualification_date/status ใน detail ตรงกับ list เสมอ (ไม่คำนวณซ้ำคนละสูตร)
     */
    private function computeExecutiveDetail(string $targetLevel, int $personnelId): ?array
    {
        $base = $this->buildExecutiveQuery($targetLevel);
        if ($base === null) {
            return null;
        }

        // กรองรายบุคคลจาก query เดียวกับ list
        $sql = "SELECT * FROM ({$base['sql']}) AS sub WHERE sub.personnel_id = ?";
        $params = array_merge($base['params'], [$personnelId]);
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        // เติม field เฉพาะ detail ที่ไม่อยู่ใน list query
        $extraStmt = $this->pdo->prepare(
            'SELECT citizen_id, first_name, last_name, hire_date FROM personnel WHERE personnel_id = ?'
        );
        $extraStmt->execute([$personnelId]);
        $extra = $extraStmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $row = array_merge($extra, $row);

        // Formatted fields (ให้ตรงกับ computeDetail ของ K/O)
        $row['qualification_date_thai'] = formatThaiDate($row['qualification_date'] ?? null);
        $row['level_start_date_thai'] = formatThaiDate($row['current_level_start_date'] ?? null);
        $row['hire_date_thai'] = formatThaiDate($row['hire_date'] ?? null);
        $row['current_level_name'] = getLevelName($row['current_level_code'] ?? '');
        $row['education_condition'] = 'ANY'; // M/S ไม่ผูกเงื่อนไขวุฒิ
        $row['remaining_days'] = $row['remaining_days'] !== null ? (int) $row['remaining_days'] : null;
        $row['min_years'] = $row['min_years'] !== null ? (float) $row['min_years'] : null;
        $row['supportive_days'] = (int) $row['supportive_days'];
        $row['equivalence_days'] = (int) $row['equivalence_days'];
        $row['diverse_diff_count'] = (int) $row['diverse_diff_count'];
        $row['multiplier_days'] = (int) ($row['multiplier_days'] ?? 0);

        return [
            'success' => true,
            'data' => $row,
        ];
    }
}
