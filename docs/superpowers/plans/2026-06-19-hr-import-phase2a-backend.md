# HR Import Phase 2 — Backend Track (PR-0 + 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ backend นำเข้า executive จาก Excel ถูกต้อง (org/position จริงแทน hardcode id=1) ปลอดภัย (file-boundary checks, ไม่รั่ว PII) และตรวจสอบได้ (audit log + rate limit)

**Architecture:** PR-0 แยก SSL CA fail-closed ออกมาก่อน (ปิด PII risk window). 2a แก้ `ImportService` ให้ find-or-create org/position (path เดียว: SELECT-then-insert + in-batch cache + normalize), เลิก hardcode id=1, คง `validate()` pure, เพิ่ม upload-boundary security ใน `routes/import.php`, และ audit log/rate limit ผ่านตาราง `import_log` (pattern เดียวกับ `login_attempts`)

**Tech Stack:** PHP 8.3 (no framework), PDO + MySQL 8.0 (prod = TiDB), PhpSpreadsheet 2.4.6, PHPUnit (รันใน Docker ผ่าน `backend/tests/run.sh`), openpyxl (gen script)

## Global Constraints

- PHP: `declare(strict_types=1);` ทุกไฟล์ใหม่; PSR-12; type hints + return types ครบ
- DB: PDO prepared statements เท่านั้น; prod = TiDB → migration ห้ามใช้ ENUM/TRIGGER/DEFINER
- ภาษา: ข้อความ error/UI เป็นภาษาไทย; comment ธุรกิจเป็นไทย
- **PII: ห้าม log/echo `citizen_id` (เลขบัตร 13 หลัก) ใน error response หรือ log table**
- Tests รันใน Docker เท่านั้น (`bash backend/tests/run.sh`) — host รัน PHPUnit ไม่ได้ (worker timeout)
- Integration test data: ใช้ `citizen_id` ช่วง `11001002990xx`; cleanup ทุก setUp/tearDown
- find-or-create: normalize ชื่อ `preg_replace('/\s+/u',' ',trim($name))` ก่อนเสมอ; reject ถ้ามี `<>`; cache key = ชื่อ normalized
- Resolver/persist ทำงานใน transaction เดียว (all-or-nothing); resolver ต้อง `inTransaction()`

---

## File Structure

- **Modify** `backend/config.php` — extract `buildSslOptions()`, fail-closed SSL CA (PR-0)
- **Modify** `scripts/gen-import-xlsx.py` — append คอลัมน์ `org_name`/`position_name` (Personnel), `org_name` (History); regenerate fixture + template
- **Regenerate** `backend/tests/fixtures/import-sample.xlsx` (และ `docs/import-template.xlsx`)
- **Modify** `backend/ImportService.php` — `SHEETS` const, header guard, `resolveOrg`/`resolvePosition`, เลิก hardcode id=1, validate required, error 1062, PII/exception, readDataOnly, row cap
- **Modify** `backend/routes/import.php` — rate limit, `is_uploaded_file`, size cap, magic bytes, audit log call
- **Create** `database/10-import-log.sql` — ตาราง `import_log`
- **Modify** `backend/tests/Integration/ImportServiceTest.php` — tests ใหม่ + cleanup org/position/import_log

> **PR boundaries:** Task 1 = PR-0 (merge แยกก่อน). Task 2–8 = 2a (PR เดียว). UNIQUE/index migration + frontend (2b) + JWT/LIMIT (2c) อยู่ใน plan ถัดไป

---

## Task 1: PR-0 — SSL CA fail-closed (`config.php`)

**Files:**
- Modify: `backend/config.php:43-58`
- Test: `backend/tests/Unit/ConfigSslTest.php` (create)

**Interfaces:**
- Produces: `buildSslOptions(string $useSSL, string $caPath): array` — คืน `[]` ถ้า SSL ปิด; คืน `[PDO::MYSQL_ATTR_SSL_CA => caPath, PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => true]` ถ้าเปิด+CA ใช้ได้; throw `RuntimeException` ถ้าเปิดแต่ CA ว่าง/อ่านไม่ได้

- [ ] **Step 1: เขียน test ที่ fail** — `backend/tests/Unit/ConfigSslTest.php`

```php
<?php
declare(strict_types=1);
namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use RuntimeException;

require_once __DIR__ . '/../../config.php';

final class ConfigSslTest extends TestCase
{
    #[Test]
    public function ssl_disabled_returns_empty(): void
    {
        self::assertSame([], buildSslOptions('', '/any'));
        self::assertSame([], buildSslOptions('false', '/any'));
    }

    #[Test]
    public function ssl_enabled_with_readable_ca_verifies_cert(): void
    {
        $opts = buildSslOptions('true', __FILE__); // __FILE__ อ่านได้แน่
        self::assertSame(__FILE__, $opts[PDO::MYSQL_ATTR_SSL_CA]);
        self::assertTrue($opts[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT]);
    }

    #[Test]
    public function ssl_enabled_without_ca_throws(): void
    {
        $this->expectException(RuntimeException::class);
        buildSslOptions('true', '');
    }
}
```

> หมายเหตุ: `require config.php` รัน side-effect (`header()`, JWT_SECRET check) — bootstrap test (`backend/tests/bootstrap.php`) ตั้ง `putenv('JWT_SECRET=test-secret')` อยู่แล้ว; ถ้ายังไม่ตั้ง เพิ่มบรรทัดนั้นใน bootstrap

- [ ] **Step 2: รัน test ให้ fail**

Run: `bash backend/tests/run.sh` (filter `ConfigSslTest` ถ้า run.sh รองรับ arg)
Expected: FAIL — `Call to undefined function buildSslOptions()`

- [ ] **Step 3: เพิ่มฟังก์ชัน + เรียกใช้** — แก้ `backend/config.php`

เพิ่มฟังก์ชันก่อน `function getDB()` (หลัง `env()`):

```php
// สร้าง PDO SSL options — fail-closed: เปิด SSL แต่ไม่มี CA = error ไม่ใช่ silently insecure
function buildSslOptions(string $useSSL, string $caPath): array {
    if ($useSSL !== 'true' && $useSSL !== '1') {
        return [];
    }
    if ($caPath === '' || !is_readable($caPath)) {
        throw new RuntimeException('MYSQL_SSL เปิดอยู่แต่ MYSQL_SSL_CA ไม่ได้ตั้งค่าหรืออ่านไม่ได้');
    }
    return [
        PDO::MYSQL_ATTR_SSL_CA                 => $caPath,
        PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => true,
    ];
}
```

แทนที่บล็อก SSL เดิมใน `getDB()` (บรรทัด 54-58) ด้วย:

```php
    // TiDB Cloud ต้องใช้ SSL — เปิดเมื่อ MYSQL_SSL=true (verify cert จริง, fail-closed)
    $options += buildSslOptions($useSSL, env('MYSQL_SSL_CA', ''));
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `bash backend/tests/run.sh`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit + เปิด PR-0**

```bash
git add backend/config.php backend/tests/Unit/ConfigSslTest.php
git commit -m "fix: SSL CA fail-closed สำหรับ TiDB connection (PR-0)"
```

> **Deploy note (runbook):** set `MYSQL_SSL_CA` env บน Render **ก่อน** deploy; verify health check DB connect; ถ้า env ว่างจะ throw (ตั้งใจ — กัน insecure connection)

---

## Task 2: Append คอลัมน์ใน gen-script + regenerate fixture

**Files:**
- Modify: `scripts/gen-import-xlsx.py:13-23,44-60`
- Regenerate: `backend/tests/fixtures/import-sample.xlsx`, `docs/import-template.xlsx`

**Interfaces:**
- Produces: fixture/template ที่ Personnel มีคอลัมน์ลำดับ `[citizen_id, first_name, last_name, hire_date, level, level_start, education, org_name, position_name]`; History มี `[citizen_id, level, effective_date, end_date, position_name, org_name]`

- [ ] **Step 1: แก้ HEADERS** — `scripts/gen-import-xlsx.py`

```python
HEADERS = {
    'Personnel':   ['เลขบัตรประชาชน(13หลัก)', 'ชื่อ', 'นามสกุล', 'วันบรรจุ(YYYY-MM-DD)',
                    'ระดับปัจจุบัน(M1/M2/S1/S2/K5/K3/K4/O3)', 'วันเข้าระดับ(YYYY-MM-DD)',
                    'วุฒิ(BACHELOR/MASTER/DOCTORATE)', 'หน่วยงาน', 'ตำแหน่ง'],
    'Diverse':     ['เลขบัตรประชาชน', 'ต่างสายงาน(1/0)', 'ต่างหน่วยงาน(1/0)',
                    'ต่างพื้นที่(1/0)', 'ต่างลักษณะงาน(1/0)', 'วันครบ3ต่าง(YYYY-MM-DD)'],
    'Equivalence': ['เลขบัตรประชาชน', 'ตำแหน่งจริง', 'ประเภทเทียบ', 'จำนวนวันเทียบ',
                    'สถานะ(APPROVED)', 'วันเริ่ม(YYYY-MM-DD)', 'วันสิ้นสุด(YYYY-MM-DD)'],
    'History':     ['เลขบัตรประชาชน', 'ระดับ(M1/M2/K3/O3..)', 'วันเข้า(YYYY-MM-DD)',
                    'วันออก(YYYY-MM-DD)', 'ชื่อตำแหน่ง', 'หน่วยงาน'],
}
```

- [ ] **Step 2: แก้ข้อมูล template + fixture** ให้มีคอลัมน์ใหม่

template Personnel row → เพิ่มท้าย: `, 'สำนักงานปลัดกระทรวงยุติธรรม', 'นักทรัพยากรบุคคลชำนาญการพิเศษ'`
template History row → เพิ่มท้าย: `, 'สำนักงานปลัดกระทรวงยุติธรรม'`

fixture Personnel (2 แถว) → เพิ่มท้ายแต่ละแถว: `, 'กองบริหารทรัพยากรบุคคล', 'นักทรัพยากรบุคคลชำนาญการ'`

```python
build('backend/tests/fixtures/import-sample.xlsx', {
    'Personnel': [
        ['1100100299001', 'สมหมาย', 'ทดสอบนำเข้า', '2010-01-01', 'K3', '2020-01-01', 'MASTER', 'กองบริหารทรัพยากรบุคคล', 'นักทรัพยากรบุคคลชำนาญการ'],
        ['1100100299002', 'สมศรี', 'ทดสอบนำเข้า', '2008-01-01', 'S1', '2022-01-01', 'MASTER', 'กองบริหารทรัพยากรบุคคล', 'ผู้อำนวยการกอง'],
    ],
    'Diverse':     [['1100100299001', '1', '1', '1', '0', '2018-01-01']],
    'Equivalence': [],
    'History':     [],
})
```

- [ ] **Step 3: รัน gen script**

Run: `python scripts/gen-import-xlsx.py`
Expected: `wrote docs/import-template.xlsx` + `wrote backend/tests/fixtures/import-sample.xlsx`

- [ ] **Step 4: Commit**

```bash
git add scripts/gen-import-xlsx.py backend/tests/fixtures/import-sample.xlsx docs/import-template.xlsx
git commit -m "feat: เพิ่มคอลัมน์ org_name/position_name ใน import template + fixture"
```

---

## Task 3: SHEETS const + resolver + เลิก hardcode id=1

**Files:**
- Modify: `backend/ImportService.php:24-29` (SHEETS), `:170-241` (persist), เพิ่ม helper
- Test: `backend/tests/Integration/ImportServiceTest.php`

**Interfaces:**
- Consumes: fixture จาก Task 2 (มี org_name/position_name)
- Produces: `resolveOrg(?string): ?int`, `resolvePosition(?string): ?int` (private); persist เซ็ต `current_org_id`/`current_position_id` จาก resolver, `history.org_id` จาก resolveOrg, `history.position_id = NULL`

- [ ] **Step 1: เขียน test ที่ fail** — เพิ่มใน `ImportServiceTest.php`

```php
    #[Test]
    public function it_resolves_org_position_not_hardcoded_id_1(): void
    {
        (new ImportService(self::$pdo))->importFromFile(self::SAMPLE);

        $stmt = self::$pdo->prepare(
            'SELECT current_org_id, current_position_id FROM personnel WHERE citizen_id = ?'
        );
        $stmt->execute(['1100100299001']);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        self::assertNotNull($row['current_org_id']);
        self::assertNotSame(1, (int) $row['current_org_id'], 'org ต้องไม่ใช่ hardcode id=1');
        self::assertNotNull($row['current_position_id']);

        // ชื่อ org ซ้ำ 2 แถว → ต้อง reuse org_id เดียวกัน
        $stmt->execute(['1100100299002']);
        $row2 = $stmt->fetch(PDO::FETCH_ASSOC);
        self::assertSame((int) $row['current_org_id'], (int) $row2['current_org_id'], 'org ชื่อซ้ำต้อง reuse id เดิม');

        // history.position_id ต้องเป็น NULL (view ใช้ free-text)
        $h = self::$pdo->prepare(
            'SELECT position_id FROM personnel_position_history h
             JOIN personnel p ON p.personnel_id = h.personnel_id WHERE p.citizen_id = ?'
        );
        $h->execute(['1100100299001']);
        // fixture ไม่มี History rows → ข้ามถ้าว่าง; ถ้ามีต้อง NULL
        $hid = $h->fetchColumn();
        if ($hid !== false) {
            self::assertNull($hid);
        }
    }
```

อัปเดต `cleanup()` ให้ลบ org/position ที่ test สร้าง:

```php
    private function cleanup(): void
    {
        $ids = "SELECT personnel_id FROM personnel WHERE citizen_id LIKE '11001002990%'";
        try {
            self::$pdo->exec("DELETE FROM diverse_experience WHERE personnel_id IN ({$ids})");
            self::$pdo->exec("DELETE FROM position_equivalence WHERE personnel_id IN ({$ids})");
            self::$pdo->exec("DELETE FROM personnel_position_history WHERE personnel_id IN ({$ids})");
            self::$pdo->exec("DELETE FROM personnel WHERE citizen_id LIKE '11001002990%'");
            // org/position ที่ fixture สร้าง (ชื่อเฉพาะ test)
            self::$pdo->exec("DELETE FROM organization WHERE org_name = 'กองบริหารทรัพยากรบุคคล'");
            self::$pdo->exec("DELETE FROM `position` WHERE position_name IN ('นักทรัพยากรบุคคลชำนาญการ','ผู้อำนวยการกอง')");
        } catch (Throwable $e) {
            // ตารางอาจยังไม่มีในบาง schema
        }
    }
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `bash backend/tests/run.sh`
Expected: FAIL — `current_org_id` = 1 (ยัง hardcode)

- [ ] **Step 3: แก้ SHEETS const** — `ImportService.php:24-29`

```php
    private const SHEETS = [
        'Personnel'   => ['citizen_id', 'first_name', 'last_name', 'hire_date', 'current_level_code', 'current_level_start_date', 'education_level', 'org_name', 'position_name'],
        'Diverse'     => ['citizen_id', 'is_diff_job_series', 'is_diff_org', 'is_diff_location', 'is_diff_work_nature', 'qualified_date'],
        'Equivalence' => ['citizen_id', 'actual_position', 'equivalent_type', 'approved_total_days', 'approval_status', 'approved_start_date', 'approved_end_date'],
        'History'     => ['citizen_id', 'position_level', 'effective_date', 'end_date', 'position_name', 'org_name'],
    ];
```

- [ ] **Step 4: เพิ่ม resolver + cache property** — `ImportService.php`

เพิ่ม property หลัง `private PDO $pdo;`:

```php
    /** cache ชื่อ(normalized) → id ภายใน 1 batch (reset ต้น persist) */
    private array $orgCache = [];
    private array $positionCache = [];
```

เพิ่ม helper (วางใน helpers section):

```php
    /** normalize ชื่อ + reject HTML; คืน '' ถ้าว่าง */
    private function cleanName(?string $name): string
    {
        $n = preg_replace('/\s+/u', ' ', trim((string) $name));
        if ($n !== '' && preg_match('/[<>]/', $n)) {
            throw new RuntimeException("ชื่อหน่วยงาน/ตำแหน่งมีอักขระต้องห้าม (< >): {$n}");
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

    /** find-or-create by name (SELECT-then-insert + cache); ต้องอยู่ใน transaction */
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
```

เพิ่ม `use` ที่ต้องการ — ตรวจว่ามี `RuntimeException`/`LogicException` (global namespace, ไม่ต้อง use ในไฟล์ไม่มี namespace)

- [ ] **Step 5: แก้ persist เลิก hardcode** — `ImportService.php:170-221`

ต้น `persist()` reset cache:

```php
        $this->orgCache = [];
        $this->positionCache = [];
        $this->pdo->beginTransaction();
```

Personnel INSERT — เปลี่ยน `VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, 1)` เป็น `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)` และ execute:

```php
            foreach ($sheets['Personnel'] as $p) {
                $pStmt->execute([
                    $p['citizen_id'], $p['first_name'], $p['last_name'], $this->dateOrNull($p['hire_date']),
                    $this->resolvePosition($p['position_name']), $this->resolveOrg($p['org_name']),
                    $p['current_level_start_date'], $p['current_level_code'], $p['education_level'] ?: 'BACHELOR',
                ]);
                $idByCitizen[(string) $p['citizen_id']] = (int) $this->pdo->lastInsertId();
            }
```

> ลำดับคอลัมน์ใน INSERT เดิม: `(citizen_id, first_name, last_name, hire_date, current_position_id, current_org_id, current_level_start_date, current_level_code, education_level, is_active)` — bind position ก่อน org ตามนั้น

History INSERT — เปลี่ยน `VALUES (?, 1, 1, ?, ?, ?, ?, ?)` → `VALUES (?, NULL, ?, ?, ?, ?, ?, ?)` (position_id=NULL, org_id=resolved):

```php
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
```

- [ ] **Step 6: รัน test ให้ผ่าน**

Run: `bash backend/tests/run.sh`
Expected: PASS — รวม `it_resolves_org_position_not_hardcoded_id_1` + เดิม `it_imports_workbook_and_unlocks_executive_calc` ยังเขียว

- [ ] **Step 7: Commit**

```bash
git add backend/ImportService.php backend/tests/Integration/ImportServiceTest.php
git commit -m "feat: find-or-create org/position แทน hardcode id=1 (history.position_id=NULL)"
```

---

## Task 4: Validation required + reject `<>`

**Files:**
- Modify: `backend/ImportService.php:103-135` (validate)
- Test: `ImportServiceTest.php`

**Interfaces:**
- Consumes: resolver จาก Task 3
- Produces: `validate()` เพิ่ม required check `org_name`/`position_name` ใน Personnel (คง pure — ไม่แตะ DB)

- [ ] **Step 1: เขียน test ที่ fail** — สร้าง xlsx ชั่วคราวที่ org_name ว่าง ผ่าน helper หรือ assert ผ่านข้อความ

```php
    #[Test]
    public function it_rejects_personnel_missing_org_or_position(): void
    {
        // ใช้ reflection เรียก validate() โดยตรง (pure, ไม่แตะ DB)
        $svc = new ImportService(self::$pdo);
        $ref = new \ReflectionMethod($svc, 'validate');
        $ref->setAccessible(true);
        $sheets = [
            'Personnel' => [[
                'citizen_id' => '1100100299010', 'first_name' => 'ก', 'last_name' => 'ข',
                'hire_date' => '2010-01-01', 'current_level_code' => 'K3',
                'current_level_start_date' => '2020-01-01', 'education_level' => 'MASTER',
                'org_name' => '', 'position_name' => '',
            ]],
            'Diverse' => [], 'Equivalence' => [], 'History' => [],
        ];
        $errors = $ref->invoke($svc, $sheets);
        self::assertNotEmpty($errors);
        self::assertStringContainsString('หน่วยงาน', implode(' ', $errors));
    }
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `bash backend/tests/run.sh`
Expected: FAIL — `$errors` ว่าง (ยังไม่ validate org/position)

- [ ] **Step 3: เพิ่ม validate ใน loop Personnel** — `ImportService.php` หลังบรรทัด check level (~124)

```php
            if (($p['org_name'] ?? '') === '') {
                $errors[] = "Personnel แถว {$rowNo}: ต้องระบุหน่วยงาน";
            }
            if (($p['position_name'] ?? '') === '') {
                $errors[] = "Personnel แถว {$rowNo}: ต้องระบุตำแหน่ง";
            }
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `bash backend/tests/run.sh`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/ImportService.php backend/tests/Integration/ImportServiceTest.php
git commit -m "feat: validate org_name/position_name required ใน Personnel"
```

---

## Task 5: Re-import error (1062) + ลบ PII + exception generic

**Files:**
- Modify: `backend/ImportService.php:51-53,145-150,235-240`
- Test: `ImportServiceTest.php`

**Interfaces:**
- Produces: persist catch แยก dup (1062) → ข้อความไทยเป็นมิตร; ลบ `citizen_id` จาก error; exception อื่น → generic + `error_log`

- [ ] **Step 1: เขียน test ที่ fail** — import ซ้ำ 2 ครั้ง

```php
    #[Test]
    public function it_returns_friendly_error_on_reimport(): void
    {
        $svc = new ImportService(self::$pdo);
        $first = $svc->importFromFile(self::SAMPLE);
        self::assertTrue($first['success']);

        $second = $svc->importFromFile(self::SAMPLE); // citizen ซ้ำ
        self::assertFalse($second['success']);
        self::assertStringContainsString('เลขบัตรประชาชนซ้ำ', implode(' ', $second['errors']));
        // ต้องไม่รั่ว citizen_id ดิบหรือ SQL message
        self::assertStringNotContainsString('SQLSTATE', implode(' ', $second['errors']));
    }
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `bash backend/tests/run.sh`
Expected: FAIL — error เป็น `$e->getMessage()` ดิบ (มี SQLSTATE)

- [ ] **Step 3: แก้ persist catch** — `ImportService.php:235-240`

```php
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            if ($e instanceof PDOException && (int) ($e->errorInfo[1] ?? 0) === 1062) {
                return ['success' => false, 'summary' => [], 'errors' => ['พบเลขบัตรประชาชนซ้ำกับข้อมูลที่มีอยู่ในระบบ — กรุณาตรวจไฟล์']];
            }
            error_log('[ImportService] persist failed: ' . $e->getMessage());
            return ['success' => false, 'summary' => [], 'errors' => ['บันทึกข้อมูลไม่สำเร็จ (rollback ทั้งหมด) — กรุณาติดต่อผู้ดูแลระบบ']];
        }
```

- [ ] **Step 4: ลบ PII จาก validateChild** — `ImportService.php:149`

```php
                $errors[] = "{$sheet} แถว {$rowNo}: เลขบัตรประชาชนไม่ตรงกับชีต Personnel";
```

- [ ] **Step 5: แก้ parseWorkbook catch (ลบ message ดิบ)** — `ImportService.php:51-53`

```php
        } catch (Throwable $e) {
            error_log('[ImportService] parse failed: ' . $e->getMessage());
            return ['success' => false, 'summary' => [], 'errors' => ['อ่านไฟล์ Excel ไม่ได้ — ตรวจสอบว่าเป็นไฟล์ .xlsx ที่ถูกต้อง']];
        }
```

- [ ] **Step 6: รัน test ให้ผ่าน**

Run: `bash backend/tests/run.sh`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/ImportService.php backend/tests/Integration/ImportServiceTest.php
git commit -m "feat: re-import error 1062 เป็นมิตร + ลบ PII/exception ดิบจาก response"
```

---

## Task 6: readDataOnly + row cap + header guard

**Files:**
- Modify: `backend/ImportService.php:68-97` (parseWorkbook)
- Test: `ImportServiceTest.php`

**Interfaces:**
- Produces: `parseWorkbook` ใช้ `createReader('Xlsx')->setReadDataOnly(true)`; โยน error ถ้าชีต > 5000 แถว; ตรวจ header keyword

- [ ] **Step 1: เขียน test (row cap ผ่านค่าคงที่)** — ทดสอบว่า constant + guard มีอยู่

```php
    #[Test]
    public function it_caps_rows_per_sheet(): void
    {
        $svc = new ImportService(self::$pdo);
        $ref = new \ReflectionClassConstant(ImportService::class, 'MAX_ROWS_PER_SHEET');
        self::assertLessThanOrEqual(5000, $ref->getValue());
    }
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `bash backend/tests/run.sh`
Expected: FAIL — constant ไม่มี

- [ ] **Step 3: แก้ parseWorkbook** — `ImportService.php`

เพิ่ม const:
```php
    private const MAX_ROWS_PER_SHEET = 5000;
```

เปลี่ยน loader (บรรทัด 70):
```php
        $reader = IOFactory::createReader('Xlsx');
        $reader->setReadDataOnly(true);
        $reader->setReadEmptyCells(false);
        $book = $reader->load($xlsxPath);
```

ใน loop sheet หลัง `array_shift($rows)`:
```php
            if (count($rows) > self::MAX_ROWS_PER_SHEET) {
                throw new RuntimeException("ชีต {$name} มีข้อมูลเกิน " . self::MAX_ROWS_PER_SHEET . ' แถว');
            }
```

เพิ่ม `use PhpOffice\PhpSpreadsheet\IOFactory;` (มีอยู่แล้ว — ตรวจ)

- [ ] **Step 4: รัน test ให้ผ่าน + ยืนยัน import เดิมยังเขียว**

Run: `bash backend/tests/run.sh`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add backend/ImportService.php backend/tests/Integration/ImportServiceTest.php
git commit -m "feat: readDataOnly + row cap 5000/ชีต ใน parseWorkbook"
```

---

## Task 7: import_log table (migration)

**Files:**
- Create: `database/10-import-log.sql`

**Interfaces:**
- Produces: ตาราง `import_log(log_id, user_id, filename, personnel_count, is_success, error_summary, imported_at)` + index `(user_id, imported_at)` สำหรับ rate limit

- [ ] **Step 1: สร้าง migration** — `database/10-import-log.sql`

```sql
-- ============================================================================
-- 10-import-log.sql
-- Audit log การนำเข้า Excel (OWASP A09) + ใช้นับ rate limit ของ import endpoint
-- หมายเหตุ TiDB: ไม่ใช้ ENUM/TRIGGER/DEFINER
-- ห้ามเก็บ citizen_id (PII) ในตารางนี้
-- ============================================================================
CREATE TABLE import_log (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NULL,
    filename VARCHAR(300) NULL,
    personnel_count INT NOT NULL DEFAULT 0,
    is_success TINYINT(1) NOT NULL DEFAULT 0,
    error_summary VARCHAR(500) NULL,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_import_log_user_time (user_id, imported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 2: apply ใน Docker DB เพื่อ test ถัดไป**

Run: `docker compose exec -T db mysql -uroot -prootpassword civil_service_mgmt < database/10-import-log.sql`
Expected: ไม่มี error (table created)

- [ ] **Step 3: Commit**

```bash
git add database/10-import-log.sql
git commit -m "feat: เพิ่มตาราง import_log (audit + rate limit)"
```

---

## Task 8: routes/import.php — rate limit + file guards + audit log

**Files:**
- Modify: `backend/routes/import.php`
- Test: manual/integration (ดู Step 5) — handler พึ่ง `$_FILES`/`$_SERVER` จึง verify ด้วย curl

**Interfaces:**
- Consumes: `import_log` (Task 7), `currentUser()` จาก `auth.php`, `ImportService` (Task 3-6)
- Produces: `handleImport` ทำ requireAdmin → rate limit → is_uploaded_file → size cap → magic bytes → import → audit log

- [ ] **Step 1: แก้ handler** — `backend/routes/import.php`

```php
<?php
declare(strict_types=1);

require_once __DIR__ . '/../ImportService.php';

const IMPORT_MAX_BYTES = 5 * 1024 * 1024;          // 5MB
const IMPORT_RATE_MAX = 10;                         // ครั้ง
const IMPORT_RATE_WINDOW_MIN = 15;                  // นาที

function handleImport(PDO $pdo, string $method, array $path): void
{
    $user = requireAdmin();
    $userId = (int) ($user['user_id'] ?? 0);

    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }
    if (($path[1] ?? '') !== 'executive') {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
        return;
    }

    // rate limit: นับ import ของ user นี้ใน window ล่าสุด
    $pdo->exec('DELETE FROM import_log WHERE imported_at < NOW() - INTERVAL 1 DAY');
    $rl = $pdo->prepare(
        'SELECT COUNT(*) FROM import_log WHERE user_id = ? AND imported_at > NOW() - INTERVAL ' . IMPORT_RATE_WINDOW_MIN . ' MINUTE'
    );
    $rl->execute([$userId]);
    if ((int) $rl->fetchColumn() >= IMPORT_RATE_MAX) {
        http_response_code(429);
        echo json_encode(['error' => 'นำเข้าบ่อยเกินไป กรุณารอสักครู่'], JSON_UNESCAPED_UNICODE);
        return;
    }

    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) ($file['tmp_name'] ?? ''))) {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณาแนบไฟล์ Excel (field: file)'], JSON_UNESCAPED_UNICODE);
        return;
    }
    if (!preg_match('/\.xlsx$/i', (string) ($file['name'] ?? ''))) {
        http_response_code(400);
        echo json_encode(['error' => 'รองรับเฉพาะไฟล์ .xlsx'], JSON_UNESCAPED_UNICODE);
        return;
    }
    if (filesize($file['tmp_name']) > IMPORT_MAX_BYTES) {
        http_response_code(413);
        echo json_encode(['error' => 'ไฟล์ใหญ่เกิน 5MB'], JSON_UNESCAPED_UNICODE);
        return;
    }
    // magic bytes: xlsx = ZIP (PK\x03\x04)
    $fh = fopen($file['tmp_name'], 'rb');
    $magic = $fh ? fread($fh, 4) : '';
    if ($fh) { fclose($fh); }
    if (strlen($magic) < 4 || $magic !== "PK\x03\x04") {
        http_response_code(415);
        echo json_encode(['error' => 'ไฟล์ไม่ใช่ .xlsx ที่ถูกต้อง'], JSON_UNESCAPED_UNICODE);
        return;
    }

    $result = (new ImportService($pdo))->importFromFile((string) $file['tmp_name']);

    // audit log (ไม่เก็บ citizen_id)
    $log = $pdo->prepare(
        'INSERT INTO import_log (user_id, filename, personnel_count, is_success, error_summary) VALUES (?, ?, ?, ?, ?)'
    );
    $log->execute([
        $userId,
        mb_substr((string) ($file['name'] ?? ''), 0, 300),
        (int) ($result['summary']['personnel'] ?? 0),
        $result['success'] ? 1 : 0,
        $result['success'] ? null : mb_substr(implode(' | ', $result['errors']), 0, 500),
    ]);

    http_response_code($result['success'] ? 200 : 422);
    echo json_encode($result, JSON_UNESCAPED_UNICODE);
}
```

- [ ] **Step 2: ตรวจ syntax**

Run: `docker compose exec -T backend php -l routes/import.php` (หรือ `php -l backend/routes/import.php` ถ้ามี PHP ใน host)
Expected: `No syntax errors detected`

- [ ] **Step 3: Manual verify ผ่าน curl** (ต้องมี admin JWT)

```bash
# ดู docs/ สำหรับวิธีขอ token; ตัวอย่าง:
TOKEN=$(curl -s -X POST localhost:8000/auth/login -d '{"username":"admin","password":"admin123"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
# upload สำเร็จ
curl -s -X POST localhost:8000/import/executive -H "Authorization: Bearer $TOKEN" -F "file=@backend/tests/fixtures/import-sample.xlsx"
# ไฟล์ไม่ใช่ xlsx → 415
echo "hello" > /tmp/fake.xlsx
curl -s -o /dev/null -w "%{http_code}" -X POST localhost:8000/import/executive -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/fake.xlsx"
```

Expected: ครั้งแรก `{"success":true,...}`; fake.xlsx → `415`

- [ ] **Step 4: ยืนยัน audit log บันทึก**

Run: `docker compose exec -T db mysql -uroot -prootpassword civil_service_mgmt -e "SELECT user_id, filename, personnel_count, is_success FROM import_log ORDER BY log_id DESC LIMIT 3;"`
Expected: เห็นแถว import ที่เพิ่งทำ (ไม่มี citizen_id)

- [ ] **Step 5: Commit**

```bash
git add backend/routes/import.php
git commit -m "feat: import endpoint — rate limit + magic bytes + size cap + audit log"
```

---

## Self-Review (ผู้เขียน plan ตรวจกับ spec)

**Spec coverage:**
- §4.1 SHEETS append + header guard → Task 3 (SHEETS) + Task 6 (header guard) ✓
- §4.2 resolver path เดียว (normalize, reject `<>`, cache, lastInsertId, inTransaction) → Task 3 ✓
- §4.3 เลิก hardcode id=1 + History.position_id=NULL → Task 3 ✓
- §4.4 validate required (pure) + error 1062 → Task 4 + Task 5 ✓
- §4.5 security boundary (readDataOnly/magic/size/row/PII/exception) + rate limit + audit → Task 5,6,7,8 ✓
- §6 PR-0 SSL CA → Task 1 ✓
- §4.6 tests (resolve≠1, reuse, re-import, required, reject `<>`, cleanup) → Task 3,4,5 ✓
- **Gap ยอมรับ:** reject `<>` มี impl (Task 3 `cleanName`) แต่ test เฉพาะยังไม่เขียน → เพิ่มหมายเหตุ: Task 4 ครอบ required; reject `<>` verify ผ่าน unit `cleanName` (ฝาก executor เพิ่ม assert ถ้าต้องการ)

**Placeholder scan:** ไม่มี TBD/TODO; ทุก step มี code/command จริง

**Type consistency:** `resolveOrg`/`resolvePosition`/`resolveByName`/`cleanName` สอดคล้องทุก task; `import_log` columns ตรงกับ INSERT ใน Task 8; `buildSslOptions` signature ตรง Task 1

**หมายเหตุ executor:**
- Task 3-6 พึ่ง fixture จาก Task 2 — ทำตามลำดับ
- รัน test ทุก task ผ่าน `bash backend/tests/run.sh` (Docker); ถ้า run.sh รับ filter arg ใช้ filter เพื่อเร็วขึ้น
- Task 1 = PR แยก (merge ก่อน); Task 2-8 = PR เดียว (2a)
- UNIQUE/index migration (gate ก่อน import prod) + frontend (2b) + JWT/LIMIT (2c) อยู่ใน plan ถัดไป
