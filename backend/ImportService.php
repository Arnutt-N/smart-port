<?php

declare(strict_types=1);

// ============================================================================
// ImportService.php
// นำเข้าข้อมูล executive (M/S/K5 + diverse/equivalence/history) จากไฟล์ Excel
// แยก core ออกจาก HTTP (routes/import.php) เพื่อให้ทดสอบได้โดยไม่ต้อง bootstrap Apache
//
// ใช้ citizen_id เป็น key (HR รู้เลขบัตร ไม่รู้ personnel_id ที่ auto) →
// insert personnel แล้ว map citizen_id → personnel_id สำหรับตารางลูก
//
// all-or-nothing: insert ทั้ง 4 ตารางใน transaction เดียว rollback ถ้าแถวใดผิด
// ============================================================================

use PhpOffice\PhpSpreadsheet\IOFactory;

class ImportService
{
    /** ระดับที่อนุญาตในชีต Personnel (executive sources + ปลายทาง) */
    private const VALID_LEVELS = ['K3', 'K4', 'K5', 'O3', 'M1', 'M2', 'S1', 'S2'];

    /** ลำดับคอลัมน์ของแต่ละชีต (ต้องตรงกับ import-template.xlsx) */
    private const SHEETS = [
        'Personnel'   => ['citizen_id', 'first_name', 'last_name', 'hire_date', 'current_level_code', 'current_level_start_date', 'education_level', 'org_name', 'position_name'],
        'Diverse'     => ['citizen_id', 'is_diff_job_series', 'is_diff_org', 'is_diff_location', 'is_diff_work_nature', 'qualified_date'],
        'Equivalence' => ['citizen_id', 'actual_position', 'equivalent_type', 'approved_total_days', 'approval_status', 'approved_start_date', 'approved_end_date'],
        'History'     => ['citizen_id', 'position_level', 'effective_date', 'end_date', 'position_name', 'org_name'],
    ];

    /** จำกัดจำนวนแถวต่อชีต — กัน OOM/DoS จากไฟล์ใหญ่ */
    private const MAX_ROWS_PER_SHEET = 5000;

    private PDO $pdo;

    /** cache ชื่อ(normalized) → id ภายใน 1 batch (reset ที่ต้น persist) — กัน N+1 + dup ในไฟล์เดียว */
    private array $orgCache = [];
    private array $positionCache = [];

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * นำเข้าจากไฟล์ Excel → คืนสรุปจำนวนที่ insert + errors
     *
     * @return array{success: bool, summary: array<string,int>, errors: array<int,string>}
     */
    public function importFromFile(string $xlsxPath): array
    {
        if (!is_file($xlsxPath)) {
            return ['success' => false, 'summary' => [], 'errors' => ["ไม่พบไฟล์: {$xlsxPath}"]];
        }

        try {
            $sheets = $this->parseWorkbook($xlsxPath);
        } catch (Throwable $e) {
            error_log('[ImportService] parse failed: ' . $e->getMessage());
            return ['success' => false, 'summary' => [], 'errors' => ['อ่านไฟล์ Excel ไม่ได้ — ตรวจสอบว่าเป็นไฟล์ .xlsx ที่ถูกต้องและไม่ใหญ่เกินไป']];
        }

        $errors = $this->validate($sheets);
        if ($errors !== []) {
            return ['success' => false, 'summary' => [], 'errors' => $errors];
        }

        return $this->persist($sheets);
    }

    /**
     * อ่านทุกชีตเป็น array ของ associative rows (ตาม SHEETS column order)
     *
     * @return array<string, array<int, array<string,string|null>>>
     */
    private function parseWorkbook(string $xlsxPath): array
    {
        $reader = IOFactory::createReader('Xlsx');
        $reader->setReadDataOnly(true);     // ปิด formula/style/external-ref (ลด attack surface)
        $reader->setReadEmptyCells(false);
        $book = $reader->load($xlsxPath);
        $result = [];

        foreach (self::SHEETS as $name => $cols) {
            $ws = $book->getSheetByName($name);
            if ($ws === null) {
                $result[$name] = [];
                continue;
            }
            $rows = $ws->toArray(null, true, false, false); // raw values, 0-indexed
            array_shift($rows); // ตัด header
            if (count($rows) > self::MAX_ROWS_PER_SHEET) {
                throw new RuntimeException("ชีต {$name} มีข้อมูลเกิน " . self::MAX_ROWS_PER_SHEET . ' แถว');
            }

            $parsed = [];
            foreach ($rows as $row) {
                if ($this->isBlankRow($row)) {
                    continue;
                }
                $assoc = [];
                foreach ($cols as $i => $col) {
                    $assoc[$col] = $this->normalize($row[$i] ?? null);
                }
                $parsed[] = $assoc;
            }
            $result[$name] = $parsed;
        }

        return $result;
    }

    /**
     * @param array<string, array<int, array<string,string|null>>> $sheets
     * @return array<int, string> รายการ error (ว่าง = ผ่าน)
     */
    private function validate(array $sheets): array
    {
        $errors = [];

        // Personnel เป็นแกน — citizen_id เป็น key ของตารางลูก
        $citizenIds = [];
        foreach ($sheets['Personnel'] as $i => $p) {
            $rowNo = $i + 2;
            $cid = (string) ($p['citizen_id'] ?? '');
            if (!preg_match('/^\d{13}$/', $cid)) {
                $errors[] = "Personnel แถว {$rowNo}: citizen_id ต้องเป็นเลข 13 หลัก";
            } elseif (isset($citizenIds[$cid])) {
                $errors[] = "Personnel แถว {$rowNo}: citizen_id ซ้ำในไฟล์";
            } else {
                $citizenIds[$cid] = true;
            }
            if (($p['first_name'] ?? '') === '' || ($p['last_name'] ?? '') === '') {
                $errors[] = "Personnel แถว {$rowNo}: ต้องมีชื่อและนามสกุล";
            }
            if (!in_array($p['current_level_code'] ?? '', self::VALID_LEVELS, true)) {
                $errors[] = "Personnel แถว {$rowNo}: current_level_code ไม่ถูกต้อง (" . implode('/', self::VALID_LEVELS) . ')';
            }
            if (($p['org_name'] ?? '') === '') {
                $errors[] = "Personnel แถว {$rowNo}: ต้องระบุหน่วยงาน";
            }
            if (($p['position_name'] ?? '') === '') {
                $errors[] = "Personnel แถว {$rowNo}: ต้องระบุตำแหน่ง";
            }
            $this->checkDate($p['current_level_start_date'] ?? null, true, "Personnel แถว {$rowNo}: current_level_start_date", $errors);
            $this->checkDate($p['hire_date'] ?? null, false, "Personnel แถว {$rowNo}: hire_date", $errors);
        }

        // ตารางลูก: citizen_id ต้องอยู่ในชีต Personnel (FK ภายในไฟล์)
        $this->validateChild($sheets['Diverse'], $citizenIds, 'Diverse', ['qualified_date' => true], $errors);
        $this->validateChild($sheets['Equivalence'], $citizenIds, 'Equivalence', ['approved_total_days' => 'int'], $errors);
        $this->validateChild($sheets['History'], $citizenIds, 'History', ['position_level' => true, 'effective_date' => 'date'], $errors);

        return $errors;
    }

    /**
     * @param array<int, array<string,string|null>> $rows
     * @param array<string,bool> $validCitizens
     * @param array<string,bool|string> $required ชื่อฟิลด์ => true(required)|'int'|'date'
     * @param array<int,string> $errors
     */
    private function validateChild(array $rows, array $validCitizens, string $sheet, array $required, array &$errors): void
    {
        foreach ($rows as $i => $r) {
            $rowNo = $i + 2;
            $cid = (string) ($r['citizen_id'] ?? '');
            if (!isset($validCitizens[$cid])) {
                $errors[] = "{$sheet} แถว {$rowNo}: เลขบัตรประชาชนไม่ตรงกับชีต Personnel";
            }
            foreach ($required as $field => $rule) {
                $val = $r[$field] ?? null;
                if ($val === null || $val === '') {
                    $errors[] = "{$sheet} แถว {$rowNo}: ต้องมี {$field}";
                } elseif ($rule === 'int' && !ctype_digit((string) $val)) {
                    $errors[] = "{$sheet} แถว {$rowNo}: {$field} ต้องเป็นจำนวนเต็ม";
                } elseif ($rule === 'date') {
                    $this->checkDate((string) $val, true, "{$sheet} แถว {$rowNo}: {$field}", $errors);
                }
            }
        }
    }

    /**
     * insert ทั้ง 4 ตารางใน transaction เดียว
     *
     * @param array<string, array<int, array<string,string|null>>> $sheets
     * @return array{success: bool, summary: array<string,int>, errors: array<int,string>}
     */
    private function persist(array $sheets): array
    {
        // reset cache ต่อ batch — กัน id จาก batch ก่อน (ที่อาจ rollback) ค้าง
        $this->orgCache = [];
        $this->positionCache = [];
        $this->pdo->beginTransaction();
        try {
            $idByCitizen = [];
            $pStmt = $this->pdo->prepare(
                'INSERT INTO personnel (citizen_id, first_name, last_name, hire_date, current_position_id, current_org_id, current_level_start_date, current_level_code, education_level, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
            );
            foreach ($sheets['Personnel'] as $p) {
                $pStmt->execute([
                    $p['citizen_id'], $p['first_name'], $p['last_name'], $this->dateOrNull($p['hire_date']),
                    $this->resolvePosition($p['position_name'] ?? null), $this->resolveOrg($p['org_name'] ?? null),
                    $p['current_level_start_date'], $p['current_level_code'], $p['education_level'] ?: 'BACHELOR',
                ]);
                $idByCitizen[(string) $p['citizen_id']] = (int) $this->pdo->lastInsertId();
            }

            $dStmt = $this->pdo->prepare(
                'INSERT INTO diverse_experience (personnel_id, is_diff_job_series, is_diff_org, is_diff_location, is_diff_work_nature, qualified_date)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            foreach ($sheets['Diverse'] as $d) {
                $dStmt->execute([
                    $idByCitizen[(string) $d['citizen_id']],
                    $this->flag($d['is_diff_job_series']), $this->flag($d['is_diff_org']),
                    $this->flag($d['is_diff_location']), $this->flag($d['is_diff_work_nature']),
                    $d['qualified_date'],
                ]);
            }

            $eStmt = $this->pdo->prepare(
                'INSERT INTO position_equivalence (personnel_id, actual_position, equivalent_type, approved_start_date, approved_end_date, approved_total_days, approval_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($sheets['Equivalence'] as $e) {
                $eStmt->execute([
                    $idByCitizen[(string) $e['citizen_id']], $e['actual_position'], $e['equivalent_type'],
                    $this->dateOrNull($e['approved_start_date']), $this->dateOrNull($e['approved_end_date']),
                    (int) $e['approved_total_days'], $e['approval_status'] ?: 'APPROVED',
                ]);
            }

            $hStmt = $this->pdo->prepare(
                'INSERT INTO personnel_position_history (personnel_id, position_id, org_id, position_name, position_level, effective_date, end_date, job_series_name)
                 VALUES (?, NULL, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($sheets['History'] as $h) {
                $hStmt->execute([
                    $idByCitizen[(string) $h['citizen_id']], $this->resolveOrg($h['org_name'] ?? null),
                    $h['position_name'] ?: '', $h['position_level'],
                    $h['effective_date'], $this->dateOrNull($h['end_date']), $h['position_name'] ?: '',
                ]);
            }

            $this->pdo->commit();

            return [
                'success' => true,
                'summary' => [
                    'personnel'   => count($sheets['Personnel']),
                    'diverse'     => count($sheets['Diverse']),
                    'equivalence' => count($sheets['Equivalence']),
                    'history'     => count($sheets['History']),
                ],
                'errors' => [],
            ];
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            // duplicate key (1062) = citizen_id ซ้ำกับข้อมูลที่มีอยู่ → ข้อความเป็นมิตร (ไม่รั่ว SQL)
            if ($e instanceof PDOException && (int) ($e->errorInfo[1] ?? 0) === 1062) {
                return ['success' => false, 'summary' => [], 'errors' => ['พบเลขบัตรประชาชนซ้ำกับข้อมูลที่มีอยู่ในระบบ — กรุณาตรวจไฟล์']];
            }
            error_log('[ImportService] persist failed: ' . $e->getMessage());
            return ['success' => false, 'summary' => [], 'errors' => ['บันทึกข้อมูลไม่สำเร็จ (rollback ทั้งหมด) — กรุณาติดต่อผู้ดูแลระบบ']];
        }
    }

    // ---- helpers --------------------------------------------------------

    /** normalize ชื่อ (trim + ยุบ whitespace) + reject HTML; คืน '' ถ้าว่าง */
    private function cleanName(?string $name): string
    {
        $n = preg_replace('/\s+/u', ' ', trim((string) $name));
        if ($n !== '' && preg_match('/[<>]/', $n)) {
            throw new RuntimeException("ชื่อหน่วยงาน/ตำแหน่งมีอักขระต้องห้าม (< >)");
        }
        return $n;
    }

    private function resolveOrg(?string $name): ?int
    {
        return $this->resolveByName($name, $this->orgCache, 'organization', 'org_id', 'org_name');
    }

    private function resolvePosition(?string $name): ?int
    {
        return $this->resolveByName($name, $this->positionCache, 'position', 'position_id', 'position_name');
    }

    /**
     * find-or-create by name (SELECT-then-insert + in-batch cache) — ต้องเรียกใน transaction.
     * table/column เป็นค่าคงที่ภายใน (ไม่ใช่ user input) — ชื่อที่ผู้ใช้กรอก bind ผ่าน ? เสมอ
     *
     * @param array<string,int> $cache
     */
    private function resolveByName(?string $name, array &$cache, string $table, string $idCol, string $nameCol): ?int
    {
        if (!$this->pdo->inTransaction()) {
            throw new LogicException('resolveByName ต้องเรียกภายใน transaction');
        }
        $clean = $this->cleanName($name);
        if ($clean === '') {
            return null;
        }
        if (isset($cache[$clean])) {
            return $cache[$clean];
        }
        $sel = $this->pdo->prepare("SELECT {$idCol} FROM `{$table}` WHERE {$nameCol} = ? LIMIT 1");
        $sel->execute([$clean]);
        $id = $sel->fetchColumn();
        if ($id === false) {
            $ins = $this->pdo->prepare("INSERT INTO `{$table}` ({$nameCol}) VALUES (?)");
            $ins->execute([$clean]);
            $id = $this->pdo->lastInsertId();
            if ((int) $id < 1) {
                throw new RuntimeException("INSERT {$table} ไม่คืน id");
            }
        }
        return $cache[$clean] = (int) $id;
    }

    private function isBlankRow(array $row): bool
    {
        foreach ($row as $v) {
            if ($v !== null && trim((string) $v) !== '') {
                return false;
            }
        }
        return true;
    }

    private function normalize(mixed $v): ?string
    {
        if ($v === null) {
            return null;
        }
        return trim((string) $v);
    }

    private function checkDate(?string $val, bool $required, string $label, array &$errors): void
    {
        if ($val === null || $val === '') {
            if ($required) {
                $errors[] = "{$label}: ต้องมีวันที่ (YYYY-MM-DD)";
            }
            return;
        }
        $d = \DateTime::createFromFormat('Y-m-d', $val);
        if (!$d || $d->format('Y-m-d') !== $val) {
            $errors[] = "{$label}: รูปแบบวันที่ต้องเป็น YYYY-MM-DD (พบ '{$val}')";
        }
    }

    private function dateOrNull(?string $v): ?string
    {
        return ($v === null || $v === '') ? null : $v;
    }

    private function flag(?string $v): int
    {
        return in_array(strtolower((string) $v), ['1', 'true', 'yes', 'y', 'ใช่'], true) ? 1 : 0;
    }
}
