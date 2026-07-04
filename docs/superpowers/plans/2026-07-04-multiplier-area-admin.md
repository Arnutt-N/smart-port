# Multiplier Area Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR (admin) เพิ่มพื้นที่ทวีคูณและปิด/เปิดใช้งานได้เองผ่านหน้าจอ พร้อมกำหนด `multiplier_ratio` อิสระ (≥ 100%, ≤ 999.99)

**Architecture:** เพิ่ม 2 endpoint ใน `backend/routes/multiplier.php` เดิม (อยู่ใต้ `requireAdmin()` gate อัตโนมัติ) + หน้า Vue ใหม่ `MultiplierAreasPage.vue` (route แยก, admin-only) + ALTER TABLE เพิ่ม `created_by`. **ไม่แตะ** `computeMultiplierFields()` / `QualificationEngine` — สูตรรองรับ ratio ≥ 100 ใดๆ อยู่แล้ว

**Tech Stack:** PHP 8.3 (no framework, PDO), MySQL 8.0, Vue 3 `<script setup>` + Tailwind, PHPUnit 11 (Docker harness `backend/tests/run.sh`), Vitest

**Spec:** `docs/superpowers/specs/2026-07-04-multiplier-area-admin-design.md`

## Global Constraints

- UI text ภาษาไทยทั้งหมด; error message จาก backend เป็นภาษาไทย
- `multiplier_ratio` รับค่า `>= 100` และ `<= 999.99` (เพดาน `DECIMAL(5,2)`) — validate ทั้ง client และ server
- ใช้ **PUT ไม่ใช่ PATCH** (CORS ใน `api.php` อนุญาตแค่ GET/POST/PUT/DELETE; `useApi()` มีแค่ `get/post/put/del`)
- Master data เป็น immutable: **ไม่มี edit / ไม่มี hard delete** — มีแค่ create + toggle `is_active`
- ทุก endpoint อยู่ใต้ `requireAdmin()` ที่ต้น `handleMultiplier()` (มีอยู่แล้ว — ห้ามย้าย/ลบ)
- API payload keys เป็น snake_case (ตาม convention backend เดิม); frontend map เป็น camelCase ใน composable
- Prepared statements เท่านั้น — ห้าม string-build SQL จาก input
- Frontend route ใช้ `/time-multiplier/areas` (ตาม naming เดิม `/time-multiplier`); backend API path คือ `/multiplier/areas`
- เครื่อง dev **ไม่มี PHP CLI บน host** — lint ผ่าน container: `docker run --rm -v "/d/00 hrProject/smart-port:/app" php:8.3-cli php -l /app/backend/routes/multiplier.php`
- Integration suite รันด้วย `bash backend/tests/run.sh --testsuite Integration` (ต้อง `docker compose up -d db` ก่อน; ถ้า schema เปลี่ยนต้อง `docker compose down -v` ก่อน up เพื่อ re-init)
- Commit message: conventional commits ภาษาไทยผสมอังกฤษ, **ไม่มี Co-Authored-By trailer** (attribution disabled)

---

### Task 1: Schema 14 — เพิ่ม `created_by` + mount ใน docker-compose

**Files:**
- Create: `database/14-multiplier-area-admin.sql`
- Modify: `docker-compose.yaml` (volumes ของ service `db`, หลังบรรทัด mount ไฟล์ 13)

**Interfaces:**
- Produces: คอลัมน์ `special_area_multiplier.created_by BIGINT NULL` — Task 3 INSERT ลงคอลัมน์นี้

- [ ] **Step 1: สร้างไฟล์ migration**

```sql
-- ============================================================================
-- 14-multiplier-area-admin.sql
-- จัดการพื้นที่ทวีคูณ (master data admin) — audit column
--
-- เพิ่ม created_by ให้ special_area_multiplier ตาม pattern
-- multiplier_experience.created_by (บันทึกว่า user_id ไหนเป็นคนเพิ่ม master data)
--
-- Prod (TiDB Cloud) ต้อง apply มือ — Docker init รันเฉพาะ fresh volume
-- ============================================================================

ALTER TABLE special_area_multiplier ADD COLUMN created_by BIGINT NULL;
```

- [ ] **Step 2: เพิ่ม mount ใน `docker-compose.yaml`**

หาบรรทัด (อยู่ใน `services.db.volumes`):

```yaml
      - ./database/13-multiplier-time-counting.sql:/docker-entrypoint-initdb.d/13-multiplier-time-counting.sql
```

เพิ่มบรรทัดถัดไป:

```yaml
      - ./database/14-multiplier-area-admin.sql:/docker-entrypoint-initdb.d/14-multiplier-area-admin.sql
```

- [ ] **Step 3: ตรวจ YAML ไม่พัง**

Run: `docker compose config --quiet && echo OK`
Expected: `OK` (ไม่มี error)

- [ ] **Step 4: Commit**

```bash
git add database/14-multiplier-area-admin.sql docker-compose.yaml
git commit -m "feat: schema 14 — created_by บน special_area_multiplier (audit ผู้เพิ่ม master data)"
```

---

### Task 2: `validateAreaInput()` — pure validation (TDD)

**Files:**
- Modify: `backend/routes/multiplier.php` (เพิ่ม function ท้ายไฟล์)
- Test: `backend/tests/Unit/MultiplierAreaValidationTest.php` (ไฟล์ใหม่)

**Interfaces:**
- Produces: `validateAreaInput(array $data): array` — คืน `['error' => ?string, 'values' => ?array]`
  - `error !== null` → input ผิด (ข้อความไทยพร้อมใช้ตอบ 400)
  - `values` = normalized: `province` (string), `district` (?string — '' กลายเป็น null), `basis_type` (string), `multiplier_ratio` (float), `effective_start_date` ('Y-m-d'), `effective_end_date` (?string), `legal_reference` (?string), `source_reference` (?string)
- Task 3 เรียกใช้ function นี้ใน `createMultiplierArea()`

**หมายเหตุการ include:** `routes/multiplier.php` define functions อย่างเดียว (ไม่มี side effect ตอน include) และ `include_once helpers.php` ข้างในซ้ำกับ bootstrap ได้อย่างปลอดภัย (PHP dedupe ด้วย realpath)

- [ ] **Step 1: เขียน failing test**

สร้าง `backend/tests/Unit/MultiplierAreaValidationTest.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/multiplier.php';

/**
 * Unit tests สำหรับ validateAreaInput() — pure function, ไม่ใช้ DB
 * กติกา: ratio 100–999.99, วันที่ Y-m-d เข้มงวด (ไม่รับ overflow เช่น เดือน 13),
 * end >= start, district ว่าง = ทั้งจังหวัด (null)
 */
final class MultiplierAreaValidationTest extends TestCase
{
    private static function validInput(): array
    {
        return [
            'province' => ' สตูล ',
            'district' => 'ควนโดน',
            'basis_type' => 'MARTIAL_LAW',
            'multiplier_ratio' => '150',
            'effective_start_date' => '2004-01-26',
            'effective_end_date' => '2004-09-30',
            'legal_reference' => 'ประกาศ กห. ลง 26 ม.ค. 2547',
            'source_reference' => 'หนังสือเวียน xyz',
        ];
    }

    #[Test]
    public function it_accepts_valid_input_and_normalizes_values(): void
    {
        $result = validateAreaInput(self::validInput());

        self::assertNull($result['error']);
        self::assertSame('สตูล', $result['values']['province']); // trim แล้ว
        self::assertSame('ควนโดน', $result['values']['district']);
        self::assertSame(150.0, $result['values']['multiplier_ratio']);
        self::assertSame('2004-01-26', $result['values']['effective_start_date']);
        self::assertSame('2004-09-30', $result['values']['effective_end_date']);
    }

    #[Test]
    public function it_converts_blank_district_and_optional_fields_to_null(): void
    {
        $input = self::validInput();
        $input['district'] = '  ';
        unset($input['effective_end_date'], $input['legal_reference'], $input['source_reference']);

        $result = validateAreaInput($input);

        self::assertNull($result['error']);
        self::assertNull($result['values']['district']);
        self::assertNull($result['values']['effective_end_date']);
        self::assertNull($result['values']['legal_reference']);
        self::assertNull($result['values']['source_reference']);
    }

    /**
     * @return array<string, array{mixed, bool}>  [ratio, ควรผ่านไหม]
     */
    public static function ratioProvider(): array
    {
        return [
            'ต่ำกว่า 100 (80)'        => [80, false],
            'ต่ำกว่า 100 (99.99)'     => ['99.99', false],
            'ขอบล่างพอดี (100)'       => [100, true],
            'ทศนิยม (150.5)'          => [150.5, true],
            'ขอบบนพอดี (999.99)'      => ['999.99', true],
            'เกินเพดาน DECIMAL (1000)' => [1000, false],
            'ไม่ใช่ตัวเลข'             => ['สองเท่า', false],
        ];
    }

    #[Test]
    #[DataProvider('ratioProvider')]
    public function it_enforces_ratio_bounds(mixed $ratio, bool $shouldPass): void
    {
        $input = self::validInput();
        $input['multiplier_ratio'] = $ratio;

        $result = validateAreaInput($input);

        if ($shouldPass) {
            self::assertNull($result['error']);
        } else {
            self::assertNotNull($result['error']);
            self::assertNull($result['values']);
        }
    }

    #[Test]
    public function it_rejects_missing_province(): void
    {
        $input = self::validInput();
        $input['province'] = '';

        self::assertNotNull(validateAreaInput($input)['error']);
    }

    #[Test]
    public function it_rejects_missing_basis_type(): void
    {
        $input = self::validInput();
        unset($input['basis_type']);

        self::assertNotNull(validateAreaInput($input)['error']);
    }

    #[Test]
    public function it_rejects_end_date_before_start_date(): void
    {
        $input = self::validInput();
        $input['effective_end_date'] = '2004-01-25';

        self::assertNotNull(validateAreaInput($input)['error']);
    }

    #[Test]
    public function it_rejects_overflow_date_like_month_13(): void
    {
        $input = self::validInput();
        $input['effective_start_date'] = '2004-13-45'; // createFromFormat จะ overflow เป็น 2005-02-14 ถ้าไม่เช็ค warning

        self::assertNotNull(validateAreaInput($input)['error']);
    }
}
```

- [ ] **Step 2: รันให้ fail**

Run: `bash backend/tests/run.sh --filter MultiplierAreaValidationTest`
Expected: **Error** — `Call to undefined function validateAreaInput()`

- [ ] **Step 3: implement function**

เพิ่มท้ายไฟล์ `backend/routes/multiplier.php` (หลัง `minDate()`):

```php
/**
 * ตรวจ + normalize input สำหรับเพิ่มพื้นที่ทวีคูณ (pure function — unit-testable)
 * ratio ต้องอยู่ใน [100, 999.99] (เพดาน DECIMAL(5,2)); วันที่ต้องเป็น Y-m-d จริง
 * (เช็ค warning ของ createFromFormat กัน overflow เช่น '2004-13-45')
 *
 * @return array{error: ?string, values: ?array}
 */
function validateAreaInput(array $data): array
{
    $province = trim((string) ($data['province'] ?? ''));
    if ($province === '') {
        return ['error' => 'กรุณาระบุ province', 'values' => null];
    }

    $basisType = trim((string) ($data['basis_type'] ?? ''));
    if ($basisType === '') {
        return ['error' => 'กรุณาระบุ basis_type', 'values' => null];
    }

    $ratioRaw = $data['multiplier_ratio'] ?? null;
    if (!is_numeric($ratioRaw)) {
        return ['error' => 'กรุณาระบุ multiplier_ratio เป็นตัวเลข', 'values' => null];
    }
    $ratio = (float) $ratioRaw;
    if ($ratio < 100.0 || $ratio > 999.99) {
        return ['error' => 'multiplier_ratio ต้องอยู่ระหว่าง 100 ถึง 999.99', 'values' => null];
    }

    $start = parseStrictDate((string) ($data['effective_start_date'] ?? ''));
    if ($start === null) {
        return ['error' => 'effective_start_date ต้องเป็นรูปแบบ YYYY-MM-DD', 'values' => null];
    }

    $end = null;
    $endRaw = trim((string) ($data['effective_end_date'] ?? ''));
    if ($endRaw !== '') {
        $end = parseStrictDate($endRaw);
        if ($end === null) {
            return ['error' => 'effective_end_date ต้องเป็นรูปแบบ YYYY-MM-DD', 'values' => null];
        }
        if ($end < $start) {
            return ['error' => 'effective_end_date ต้องไม่น้อยกว่า effective_start_date', 'values' => null];
        }
    }

    $legal = trim((string) ($data['legal_reference'] ?? ''));
    if (mb_strlen($legal) > 300) {
        return ['error' => 'legal_reference ยาวเกิน 300 ตัวอักษร', 'values' => null];
    }

    $source = trim((string) ($data['source_reference'] ?? ''));
    if (mb_strlen($source) > 500) {
        return ['error' => 'source_reference ยาวเกิน 500 ตัวอักษร', 'values' => null];
    }

    $district = trim((string) ($data['district'] ?? ''));

    return ['error' => null, 'values' => [
        'province' => $province,
        'district' => $district === '' ? null : $district,
        'basis_type' => $basisType,
        'multiplier_ratio' => $ratio,
        'effective_start_date' => $start->format('Y-m-d'),
        'effective_end_date' => $end?->format('Y-m-d'),
        'legal_reference' => $legal === '' ? null : $legal,
        'source_reference' => $source === '' ? null : $source,
    ]];
}

/**
 * parse Y-m-d แบบเข้มงวด — คืน null ถ้า format ผิดหรือมี overflow (เดือน 13, วัน 45)
 * ('Y-m-d|' reset เวลาเป็น 00:00:00 ตาม pattern เดิมใน computeMultiplierFields)
 */
function parseStrictDate(string $value): ?DateTime
{
    $date = DateTime::createFromFormat('Y-m-d|', $value);
    $errors = DateTime::getLastErrors();
    if (
        $date === false
        || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
    ) {
        return null;
    }
    return $date;
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `bash backend/tests/run.sh --filter MultiplierAreaValidationTest`
Expected: `OK (13 tests, ...)` (7 named tests + 7 ratio provider cases − ratio test นับเป็น 7 → รวม 13)

- [ ] **Step 5: Lint + commit**

```bash
docker run --rm -v "/d/00 hrProject/smart-port:/app" php:8.3-cli php -l /app/backend/routes/multiplier.php
git add backend/routes/multiplier.php backend/tests/Unit/MultiplierAreaValidationTest.php
git commit -m "feat: validateAreaInput — validation กติกา ratio/วันที่ สำหรับเพิ่มพื้นที่ทวีคูณ (TDD)"
```

---

### Task 3: `POST /multiplier/areas` — create endpoint

**Files:**
- Modify: `backend/routes/multiplier.php`
  - แก้ `case 'POST':` ใน `handleMultiplier()` (~บรรทัด 36)
  - แก้ loop decorate ใน `getMultiplierAreas()` (~บรรทัด 106-117)
  - เพิ่ม `decorateAreaRow()`, `fetchAreaRow()`, `createMultiplierArea()`

**Interfaces:**
- Consumes: `validateAreaInput()` จาก Task 2; คอลัมน์ `created_by` จาก Task 1
- Produces:
  - `decorateAreaRow(array &$row): void` — เติม `area_label`, `*_thai`, `source_pending`, cast types (Task 4 ใช้ด้วย)
  - `fetchAreaRow(PDO $pdo, int $id): ?array` — SELECT row เดียว + decorate (Task 4 ใช้ด้วย)
  - HTTP: `POST /multiplier/areas` → 201 `{success, area_multiplier_id, data}` | 400 | 409 (ซ้ำ unique index)

- [ ] **Step 1: extract `decorateAreaRow()` (DRY กับ getMultiplierAreas เดิม)**

ใน `getMultiplierAreas()` แทน loop เดิม:

```php
    foreach ($rows as &$row) {
        $row['area_multiplier_id'] = (int) $row['area_multiplier_id'];
        $row['multiplier_ratio'] = (float) $row['multiplier_ratio'];
        $row['is_active'] = (int) $row['is_active'];
        $row['effective_start_date_thai'] = formatThaiDate($row['effective_start_date']);
        $row['effective_end_date_thai'] = $row['effective_end_date'] ? formatThaiDate($row['effective_end_date']) : null;
        $row['area_label'] = $row['district']
            ? "{$row['province']} / {$row['district']}"
            : "{$row['province']} / ทั้งจังหวัด";
        $row['source_pending'] = str_contains((string) $row['legal_reference'], 'SOURCE_PENDING');
    }
    unset($row);
```

ด้วย:

```php
    foreach ($rows as &$row) {
        decorateAreaRow($row);
    }
    unset($row);
```

แล้วเพิ่ม function ใหม่ (วางเหนือ `decorateMultiplierRow()` เพื่อจัดกลุ่ม area helpers ด้วยกัน):

```php
function decorateAreaRow(array &$row): void
{
    $row['area_multiplier_id'] = (int) $row['area_multiplier_id'];
    $row['multiplier_ratio'] = (float) $row['multiplier_ratio'];
    $row['is_active'] = (int) $row['is_active'];
    $row['effective_start_date_thai'] = formatThaiDate($row['effective_start_date']);
    $row['effective_end_date_thai'] = $row['effective_end_date'] ? formatThaiDate($row['effective_end_date']) : null;
    $row['area_label'] = $row['district']
        ? "{$row['province']} / {$row['district']}"
        : "{$row['province']} / ทั้งจังหวัด";
    $row['source_pending'] = str_contains((string) $row['legal_reference'], 'SOURCE_PENDING');
}

/**
 * ดึงพื้นที่ 1 แถว (รวมที่ปิดใช้งาน) พร้อม decorate — คืน null ถ้าไม่พบ
 */
function fetchAreaRow(PDO $pdo, int $areaId): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM special_area_multiplier WHERE area_multiplier_id = ?');
    $stmt->execute([$areaId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }
    decorateAreaRow($row);
    return $row;
}
```

- [ ] **Step 2: เพิ่ม `createMultiplierArea()`**

วางถัดจาก `fetchAreaRow()`:

```php
function createMultiplierArea(PDO $pdo, array $user): void
{
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'รูปแบบข้อมูลไม่ถูกต้อง']);
        return;
    }

    $validated = validateAreaInput($data);
    if ($validated['error'] !== null) {
        http_response_code(400);
        echo json_encode(['error' => $validated['error']]);
        return;
    }
    $v = $validated['values'];

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO special_area_multiplier
                (province, district, basis_type, multiplier_ratio,
                 effective_start_date, effective_end_date,
                 legal_reference, source_reference, is_active, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
        );
        $stmt->execute([
            $v['province'],
            $v['district'],
            $v['basis_type'],
            $v['multiplier_ratio'],
            $v['effective_start_date'],
            $v['effective_end_date'],
            $v['legal_reference'],
            $v['source_reference'],
            $user['user_id'] ?? null,
        ]);
    } catch (PDOException $e) {
        // unique index uq_area_multiplier_exact_period = source of truth เรื่องซ้ำ (กัน race — ไม่ pre-check)
        if ($e->getCode() === '23000') {
            http_response_code(409);
            echo json_encode(['error' => 'มีพื้นที่/ฐานประกาศ/วันเริ่มมีผลชุดนี้อยู่แล้ว']);
            return;
        }
        throw $e; // ให้ catch กลางใน handleMultiplier ตอบ 500 generic
    }

    $areaId = (int) $pdo->lastInsertId();
    http_response_code(201);
    echo json_encode([
        'success' => true,
        'area_multiplier_id' => $areaId,
        'data' => fetchAreaRow($pdo, $areaId),
    ]);
}
```

- [ ] **Step 3: route POST ใน `handleMultiplier()`**

แทน:

```php
            case 'POST':
                createMultiplier($pdo, $user);
                return;
```

ด้วย:

```php
            case 'POST':
                if (($path[1] ?? '') === 'areas') {
                    createMultiplierArea($pdo, $user);
                    return;
                }
                createMultiplier($pdo, $user);
                return;
```

- [ ] **Step 4: Lint + regression (unit suite เดิมต้องยังผ่าน)**

```bash
docker run --rm -v "/d/00 hrProject/smart-port:/app" php:8.3-cli php -l /app/backend/routes/multiplier.php
bash backend/tests/run.sh --filter MultiplierAreaValidationTest
```

Expected: `No syntax errors` + `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/routes/multiplier.php
git commit -m "feat: POST /multiplier/areas — เพิ่มพื้นที่ทวีคูณ (409 กันซ้ำผ่าน unique index, บันทึก created_by)"
```

---

### Task 4: `PUT /multiplier/areas/{id}/status` — toggle endpoint

**Files:**
- Modify: `backend/routes/multiplier.php` — เพิ่ม `case 'PUT':` ใน `handleMultiplier()` + function `setMultiplierAreaStatus()`

**Interfaces:**
- Consumes: `fetchAreaRow()` จาก Task 3
- Produces: HTTP `PUT /multiplier/areas/{id}/status` body `{"is_active": 0|1}` → 200 `{success, data}` | 400 (ค่าอื่น) | 404 (id ไม่พบ) — idempotent (ตั้งค่าซ้ำได้)

- [ ] **Step 1: เพิ่ม function**

วางถัดจาก `createMultiplierArea()`:

```php
function setMultiplierAreaStatus(PDO $pdo, int $areaId): void
{
    $data = json_decode(file_get_contents('php://input'), true);
    $isActive = is_array($data) ? ($data['is_active'] ?? null) : null;
    // รับเฉพาะ 0/1 (int หรือ string) — ค่าอื่นตอบ 400
    if (!in_array($isActive, [0, 1, '0', '1'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณาระบุ is_active เป็น 0 หรือ 1']);
        return;
    }

    // UPDATE ก่อนแล้วค่อยอ่านกลับ — idempotent โดยธรรมชาติ (ตั้งค่าเดิมซ้ำ = 200 ปกติ)
    $pdo->prepare('UPDATE special_area_multiplier SET is_active = ? WHERE area_multiplier_id = ?')
        ->execute([(int) $isActive, $areaId]);

    $row = fetchAreaRow($pdo, $areaId);
    if ($row === null) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบพื้นที่ตามรหัสที่ระบุ']);
        return;
    }

    echo json_encode(['success' => true, 'data' => $row]);
}
```

- [ ] **Step 2: route PUT ใน `handleMultiplier()`**

เพิ่ม case ใหม่ระหว่าง `case 'POST':` กับ `default:`:

```php
            case 'PUT':
                if (
                    ($path[1] ?? '') === 'areas'
                    && ctype_digit($path[2] ?? '')
                    && ($path[3] ?? '') === 'status'
                ) {
                    setMultiplierAreaStatus($pdo, (int) $path[2]);
                    return;
                }
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
                return;
```

- [ ] **Step 3: Lint + commit**

```bash
docker run --rm -v "/d/00 hrProject/smart-port:/app" php:8.3-cli php -l /app/backend/routes/multiplier.php
git add backend/routes/multiplier.php
git commit -m "feat: PUT /multiplier/areas/{id}/status — ปิด/เปิดใช้งานพื้นที่ทวีคูณ (idempotent)"
```

---

### Task 5: Integration tests — ratio 150 ไหลถูกทั้งสาย (compute → engine)

**Files:**
- Test: `backend/tests/Integration/MultiplierAreaRatioTest.php` (ไฟล์ใหม่)

**Interfaces:**
- Consumes: `computeMultiplierFields(PDO, int, string, string): array` (มีอยู่แล้ว — ไม่แก้), `QualificationEngine::computeDetail(string, int): array`, `testPdo(): ?PDO` จาก bootstrap
- ข้อเท็จจริงที่ใช้ assert: ช่วง 2004-01-26 → 2004-09-30 นับรวมปลายทั้งสอง = **249 วัน** (ก.พ. 2004 = 29); ratio 150 → `effective = 373.5`, `bonus = 124.5`; engine `FLOOR(124.5) = 124`

- [ ] **Step 1: re-init DB ให้มี schema 14** (ทำก่อนเขียน test — column `created_by` ต้องมีจริง)

```bash
docker compose down -v && docker compose up -d --build db
```

รอ healthy: `docker compose ps db` จน STATUS เป็น `healthy` (~30-60 วิ)

- [ ] **Step 2: เขียน failing test**

สร้าง `backend/tests/Integration/MultiplierAreaRatioTest.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use QualificationEngine;

require_once __DIR__ . '/../../routes/multiplier.php';

/**
 * พิสูจน์ว่า multiplier_ratio อื่นนอกจาก 200 (จาก master data ที่ HR เพิ่มเอง)
 * ไหลถูกทั้งสาย: computeMultiplierFields → multiplier_experience → QualificationEngine
 *
 * ช่วงทดสอบ 2004-01-26 → 2004-09-30 = 249 วัน (นับรวมปลายทั้งสอง, ก.พ. 2004 มี 29 วัน)
 * ratio 150 → effective 373.5 / bonus 124.5 → engine ลด qualification_date = FLOOR(124.5) = 124 วัน
 *
 * pattern เดียวกับ it_subtracts_multiplier_bonus_days_... ใน QualificationEngineTest:
 * insert ชั่วคราว → วัด → cleanup ใน finally (ไม่กระทบ golden values)
 */
final class MultiplierAreaRatioTest extends TestCase
{
    private static ?PDO $pdo = null;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
    }

    private function insertTestArea(float $ratio): int
    {
        $stmt = self::$pdo->prepare(
            "INSERT INTO special_area_multiplier
                (province, district, basis_type, multiplier_ratio,
                 effective_start_date, effective_end_date, legal_reference, is_active)
             VALUES ('ทดสอบ-ratio', NULL, 'TEST_RATIO', ?, '2004-01-26', '2004-09-30', 'TEST-ONLY', 1)"
        );
        $stmt->execute([$ratio]);
        return (int) self::$pdo->lastInsertId();
    }

    private function deleteTestArea(int $areaId): void
    {
        self::$pdo->prepare('DELETE FROM multiplier_experience WHERE area_multiplier_id = ?')
            ->execute([$areaId]);
        self::$pdo->prepare('DELETE FROM special_area_multiplier WHERE area_multiplier_id = ?')
            ->execute([$areaId]);
    }

    #[Test]
    public function compute_uses_area_ratio_150_for_bonus_days(): void
    {
        $areaId = $this->insertTestArea(150.00);
        try {
            $computed = computeMultiplierFields(self::$pdo, $areaId, '2004-01-26', '2004-09-30');

            self::assertSame(249, $computed['eligible_days']);
            self::assertSame(150.0, $computed['multiplier_ratio']);
            self::assertSame(373.5, $computed['effective_days']); // 249 × 1.5
            self::assertSame(124.5, $computed['bonus_days']);     // 249 × 0.5
        } finally {
            $this->deleteTestArea($areaId);
        }
    }

    #[Test]
    public function engine_shifts_qualification_date_by_floored_ratio150_bonus(): void
    {
        $target = 'K2';
        $personnelId = 1; // K1 golden case — ไม่มีทวีคูณใน seed
        $areaId = $this->insertTestArea(150.00);
        $engine = new QualificationEngine(self::$pdo);

        try {
            $before = $engine->computeDetail($target, $personnelId);
            self::assertSame(0, $before['data']['multiplier_days'], 'baseline ต้องไม่มีทวีคูณ');
            $baseDate = $before['data']['qualification_date'];
            self::assertNotNull($baseDate);

            $computed = computeMultiplierFields(self::$pdo, $areaId, '2004-01-26', '2004-09-30');
            self::$pdo->prepare(
                'INSERT INTO multiplier_experience
                    (personnel_id, area_multiplier_id, province, basis_type,
                     start_date, end_date, eligible_start_date, eligible_end_date,
                     eligible_days, multiplier_ratio, effective_days, bonus_days)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $personnelId, $areaId, $computed['province'], $computed['basis_type'],
                '2004-01-26', '2004-09-30',
                $computed['eligible_start_date'], $computed['eligible_end_date'],
                $computed['eligible_days'], $computed['multiplier_ratio'],
                $computed['effective_days'], $computed['bonus_days'],
            ]);

            $after = $engine->computeDetail($target, $personnelId);
            // engine cast (int) ของ SUM(124.50) = 124 และ FLOOR ในสูตรวันที่ก็ตัดเป็น 124
            self::assertSame(124, $after['data']['multiplier_days']);

            $shift = (new \DateTime($baseDate))
                ->diff(new \DateTime($after['data']['qualification_date']))->days;
            self::assertSame(124, $shift, 'qualification_date ต้องเลื่อนเข้ามา 124 วัน (FLOOR 124.5)');
        } finally {
            $this->deleteTestArea($areaId);
        }
    }
}
```

- [ ] **Step 3: รัน test — ต้องผ่านเลย** (test นี้ยืนยัน behavior เดิมกับข้อมูล ratio ใหม่ — โค้ด compute ไม่ได้แก้ ถ้า fail แปลว่าความเข้าใจผิด ห้าม "แก้ให้ผ่าน" โดยไม่วิเคราะห์)

Run: `bash backend/tests/run.sh --filter MultiplierAreaRatioTest`
Expected: `OK (2 tests, 8 assertions)`

- [ ] **Step 4: รัน Integration suite ทั้งหมด — golden values เดิมห้าม regress**

Run: `bash backend/tests/run.sh --testsuite Integration`
Expected: `OK (28 tests, ...)` (26 เดิม + 2 ใหม่) — ไม่มี failure

- [ ] **Step 5: Commit**

```bash
git add backend/tests/Integration/MultiplierAreaRatioTest.php
git commit -m "test: integration — ratio 150 จาก master data ไหลถูกทั้งสาย compute→engine (FLOOR 124.5→124)"
```

---

### Task 6: Frontend composable — `createArea` / `setAreaStatus` (TDD)

**Files:**
- Modify: `frontend/src/composables/useMultiplier.js`
- Test: `frontend/src/__tests__/composables/useMultiplier.test.js` (ไฟล์ใหม่)

**Interfaces:**
- Consumes: `useApi()` (`post`, `put`), `mapArea()` (มีอยู่แล้วในไฟล์)
- Produces (Task 7 เรียกใช้):
  - `createArea(data: object): Promise<{success, areaMultiplierId: number, data: <mapped area>}>` — POST `/multiplier/areas`
  - `setAreaStatus(areaMultiplierId: number, isActive: boolean): Promise<{success, data: <mapped area>}>` — PUT `/multiplier/areas/{id}/status` body `{is_active: 1|0}`

- [ ] **Step 1: เขียน failing test**

สร้าง `frontend/src/__tests__/composables/useMultiplier.test.js` (pattern เดียวกับ `useUsers.test.js`):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useApi ก่อน import useMultiplier
const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, post: mockPost, put: mockPut }),
}))

const { useMultiplier } = await import('@/composables/useMultiplier.js')

const serverAreaRow = {
  area_multiplier_id: 8,
  province: 'สตูล',
  district: 'ควนโดน',
  area_label: 'สตูล / ควนโดน',
  basis_type: 'MARTIAL_LAW',
  multiplier_ratio: 150,
  effective_start_date: '2004-01-26',
  effective_end_date: null,
  effective_start_date_thai: '26 ม.ค. 2547',
  effective_end_date_thai: null,
  legal_reference: 'ประกาศทดสอบ',
  source_reference: null,
  is_active: 1,
  source_pending: false,
}

describe('useMultiplier — area admin', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
  })

  it('createArea posts to /multiplier/areas and maps returned row to camelCase', async () => {
    mockPost.mockResolvedValue({ success: true, area_multiplier_id: 8, data: serverAreaRow })

    const { createArea } = useMultiplier()
    const result = await createArea({
      province: 'สตูล',
      district: 'ควนโดน',
      basis_type: 'MARTIAL_LAW',
      multiplier_ratio: 150,
      effective_start_date: '2004-01-26',
    })

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith(
      '/multiplier/areas',
      expect.objectContaining({ province: 'สตูล', multiplier_ratio: 150 }),
    )
    expect(result.areaMultiplierId).toBe(8)
    expect(result.data.areaMultiplierId).toBe(8)
    expect(result.data.multiplierRatio).toBe(150)
    expect(result.data.isActive).toBe(true)
  })

  it('setAreaStatus puts is_active 0 when deactivating', async () => {
    mockPut.mockResolvedValue({ success: true, data: { ...serverAreaRow, is_active: 0 } })

    const { setAreaStatus } = useMultiplier()
    const result = await setAreaStatus(8, false)

    expect(mockPut).toHaveBeenCalledWith('/multiplier/areas/8/status', { is_active: 0 })
    expect(result.data.isActive).toBe(false)
  })

  it('setAreaStatus puts is_active 1 when reactivating', async () => {
    mockPut.mockResolvedValue({ success: true, data: serverAreaRow })

    const { setAreaStatus } = useMultiplier()
    const result = await setAreaStatus(8, true)

    expect(mockPut).toHaveBeenCalledWith('/multiplier/areas/8/status', { is_active: 1 })
    expect(result.data.isActive).toBe(true)
  })
})
```

- [ ] **Step 2: รันให้ fail**

Run: `cd frontend && npx vitest run src/__tests__/composables/useMultiplier.test.js`
Expected: FAIL — `createArea is not a function`

- [ ] **Step 3: implement ใน `useMultiplier.js`**

เพิ่มหลัง `create()` (ก่อน `mapRow()`):

```js
  async function createArea(data) {
    const result = await api.post('/multiplier/areas', data)
    return {
      success: result.success,
      areaMultiplierId: result.area_multiplier_id,
      data: mapArea(result.data),
    }
  }

  async function setAreaStatus(areaMultiplierId, isActive) {
    const result = await api.put(`/multiplier/areas/${areaMultiplierId}/status`, {
      is_active: isActive ? 1 : 0,
    })
    return { success: result.success, data: mapArea(result.data) }
  }
```

แก้บรรทัด return ท้าย composable:

```js
  return { fetchList, fetchAreas, create, createArea, setAreaStatus }
```

- [ ] **Step 4: รันให้ผ่าน + suite เดิมไม่พัง**

```bash
cd frontend && npx vitest run src/__tests__/composables/useMultiplier.test.js && npm test
```

Expected: 3 passed ใหม่ + 86 เดิมยังผ่าน

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useMultiplier.js frontend/src/__tests__/composables/useMultiplier.test.js
git commit -m "feat: useMultiplier — createArea/setAreaStatus สำหรับหน้า admin พื้นที่ทวีคูณ (TDD)"
```

---

### Task 7: หน้า `MultiplierAreasPage.vue` + router + sidebar + ลิงก์จากหน้าเดิม

**Files:**
- Create: `frontend/src/pages/MultiplierAreasPage.vue`
- Modify: `frontend/src/router/index.js` (เพิ่ม route หลัง `time-multiplier`)
- Modify: `frontend/src/components/AppSidebar.vue` (children ของกลุ่ม `time-extra`)
- Modify: `frontend/src/pages/MultiplierPage.vue` (header ตาราง master data + import auth store)

**Interfaces:**
- Consumes: `useMultiplier().fetchAreas/createArea/setAreaStatus` จาก Task 6; components เดิม `StatCard`, `SkeletonLoader`, `EmptyState`, `ThaiDatePicker`
- Produces: route name `time-multiplier-areas` path `/time-multiplier/areas` (`meta.requiresAdmin` — guard เด้ง operator กลับ dashboard มีอยู่แล้วใน `router.beforeEach`)

- [ ] **Step 1: สร้าง `frontend/src/pages/MultiplierAreasPage.vue`**

```vue
<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <nav class="flex items-center gap-2 text-sm text-gray-500 mb-4">
      <Home class="w-4 h-4" />
      <span>/</span>
      <RouterLink to="/time-multiplier" class="hover:text-gray-700">การนับทวีคูณ</RouterLink>
      <span>/</span>
      <span>จัดการพื้นที่พิเศษ</span>
    </nav>

    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">จัดการพื้นที่พิเศษ (ทวีคูณ)</h1>
        <p class="text-sm text-gray-500 mt-1">
          เพิ่มพื้นที่และกำหนดอัตราทวีคูณ — ข้อมูลเดิมแก้ไขไม่ได้ หากผิดให้ปิดใช้งานแล้วเพิ่มรายการใหม่แทน
        </p>
      </div>
      <button
        class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
        @click="openCreateModal"
      >
        <Plus class="w-4 h-4" />
        เพิ่มพื้นที่
      </button>
    </div>

    <SkeletonLoader v-if="loading && areas.length === 0" type="stat-cards" />
    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard
        label="พื้นที่ทั้งหมด"
        :value="areas.length"
        :icon="MapPinned"
        icon-bg-class="bg-blue-50"
        icon-class="text-blue-600"
      />
      <StatCard
        label="ใช้งานอยู่"
        :value="activeCount"
        :icon="CheckCircle2"
        icon-bg-class="bg-green-50"
        icon-class="text-green-600"
      />
      <StatCard
        label="รออ้างอิงแหล่งที่มา"
        :value="pendingCount"
        :icon="AlertTriangle"
        icon-bg-class="bg-amber-50"
        icon-class="text-amber-600"
      />
    </div>

    <div
      v-if="actionError"
      class="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      <span>{{ actionError }}</span>
      <button class="text-red-500 hover:text-red-700" aria-label="ปิดข้อความ" @click="actionError = ''">
        <X class="w-4 h-4" />
      </button>
    </div>

    <SkeletonLoader v-if="loading && areas.length === 0" type="table" :rows="5" />

    <EmptyState
      v-else-if="error"
      :icon="AlertCircle"
      title="เกิดข้อผิดพลาด"
      :description="error"
    >
      <button
        class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
        @click="fetchData"
      >
        ลองใหม่อีกครั้ง
      </button>
    </EmptyState>

    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <div class="border-b border-gray-100 px-6 py-4">
        <h2 class="text-base font-semibold text-gray-900">พื้นที่พิเศษทั้งหมด (รวมที่ปิดใช้งาน)</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">พื้นที่</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ฐานประกาศ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">อัตรา</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ช่วงมีผล</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">อ้างอิง</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="area in areas"
              :key="area.areaMultiplierId"
              class="border-b border-gray-100 hover:bg-gray-50"
              :class="{ 'opacity-60': !area.isActive }"
            >
              <td class="px-6 py-3 text-sm text-gray-900 font-medium">{{ area.areaLabel }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ basisTypeLabel(area.basisType) }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ area.multiplierRatio }}%</td>
              <td class="px-6 py-3 text-sm text-gray-700">
                {{ area.effectiveStartDateThai }} - {{ area.effectiveEndDateThai || 'ไม่กำหนด' }}
              </td>
              <td class="px-6 py-3 text-sm">
                <span
                  class="inline-flex items-center rounded px-2 py-1 text-xs font-medium"
                  :class="area.sourcePending ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'"
                >
                  {{ area.sourcePending ? 'รอเอกสาร' : 'ยืนยันแล้ว' }}
                </span>
              </td>
              <td class="px-6 py-3 text-sm">
                <span
                  class="inline-flex items-center rounded px-2 py-1 text-xs font-medium"
                  :class="area.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'"
                >
                  {{ area.isActive ? 'ใช้งาน' : 'ปิดใช้งาน' }}
                </span>
              </td>
              <td class="px-6 py-3 text-sm">
                <button
                  class="px-3 py-1 rounded-md border text-xs transition-colors disabled:opacity-50"
                  :class="area.isActive
                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                    : 'border-green-200 text-green-600 hover:bg-green-50'"
                  :disabled="togglingId === area.areaMultiplierId"
                  @click="toggleStatus(area)"
                >
                  {{ togglingId === area.areaMultiplierId ? 'กำลังบันทึก...' : area.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน' }}
                </button>
              </td>
            </tr>
            <tr v-if="areas.length === 0">
              <td colspan="7">
                <EmptyState
                  title="ยังไม่มีพื้นที่พิเศษ"
                  description="กดปุ่ม เพิ่มพื้นที่ เพื่อสร้าง master data รายการแรก"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="area-modal-title"
    >
      <div class="fixed inset-0 bg-black bg-opacity-50" @click="closeModal"></div>
      <div class="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h3 id="area-modal-title" class="text-lg font-semibold text-gray-900">เพิ่มพื้นที่พิเศษ</h3>
          <button class="text-gray-400 hover:text-gray-600" aria-label="ปิด" @click="closeModal">
            <X class="w-5 h-5" />
          </button>
        </div>

        <form class="p-6 space-y-4" @submit.prevent="handleSubmit">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">จังหวัด <span class="text-red-500">*</span></label>
              <input
                v-model="formData.province"
                type="text"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="formErrors.province ? 'border-red-500' : 'border-gray-300'"
              />
              <p v-if="formErrors.province" class="text-xs text-red-500 mt-1">กรุณาระบุจังหวัด</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">อำเภอ</label>
              <input
                v-model="formData.district"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="เว้นว่าง = ทั้งจังหวัด"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">ฐานประกาศ <span class="text-red-500">*</span></label>
              <input
                v-model="formData.basis_type"
                type="text"
                list="basis-type-options"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="formErrors.basis_type ? 'border-red-500' : 'border-gray-300'"
                placeholder="เช่น MARTIAL_LAW"
              />
              <datalist id="basis-type-options">
                <option v-for="basis in basisOptions" :key="basis" :value="basis" />
              </datalist>
              <p v-if="formErrors.basis_type" class="text-xs text-red-500 mt-1">กรุณาระบุฐานประกาศ</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">อัตราทวีคูณ (%) <span class="text-red-500">*</span></label>
              <input
                v-model="formData.multiplier_ratio"
                type="number"
                min="100"
                max="999.99"
                step="0.01"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="formErrors.multiplier_ratio ? 'border-red-500' : 'border-gray-300'"
              />
              <div class="flex gap-2 mt-2">
                <button
                  v-for="preset in RATIO_PRESETS"
                  :key="preset"
                  type="button"
                  class="px-2 py-1 rounded border text-xs transition-colors"
                  :class="Number(formData.multiplier_ratio) === preset
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'"
                  @click="formData.multiplier_ratio = preset"
                >
                  {{ preset }}%
                </button>
              </div>
              <p v-if="formErrors.multiplier_ratio" class="text-xs text-red-500 mt-1">อัตราต้องอยู่ระหว่าง 100 ถึง 999.99</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">วันเริ่มมีผล <span class="text-red-500">*</span></label>
              <ThaiDatePicker
                v-model="formData.effective_start_date"
                :error="formErrors.effective_start_date ? 'กรุณาระบุวันเริ่มมีผล' : ''"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด (เว้นว่าง = ไม่กำหนด)</label>
              <ThaiDatePicker
                v-model="formData.effective_end_date"
                :error="formErrors.effective_end_date ? 'วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่ม' : ''"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">อ้างอิงกฎหมาย</label>
            <input
              v-model="formData.legal_reference"
              type="text"
              maxlength="300"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="ประกาศ/คำสั่งที่รองรับอัตรานี้ — เว้นว่างจะติดสถานะรอเอกสาร"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">แหล่งที่มา</label>
            <input
              v-model="formData.source_reference"
              type="text"
              maxlength="500"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="เอกสาร/หนังสือเวียน/ลิงก์อ้างอิง"
            />
          </div>

          <div v-if="submitError" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {{ submitError }}
          </div>

          <div class="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              @click="closeModal"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              :disabled="saving"
            >
              {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useMultiplier } from '@/composables/useMultiplier.js'
import StatCard from '@/components/StatCard.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ThaiDatePicker from '@/components/ThaiDatePicker.vue'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Home,
  MapPinned,
  Plus,
  X,
} from 'lucide-vue-next'

const { fetchAreas, createArea, setAreaStatus } = useMultiplier()

const RATIO_PRESETS = [150, 200, 300]

const loading = ref(false)
const saving = ref(false)
const togglingId = ref(null)
const error = ref(null)        // โหลดข้อมูลไม่ได้ทั้งหน้า
const actionError = ref('')    // toggle ล้มเหลว — banner ไม่บังตาราง
const submitError = ref('')
const areas = ref([])
const showModal = ref(false)
const formErrors = ref({})
const formData = ref(emptyForm())

const activeCount = computed(() => areas.value.filter((area) => area.isActive).length)
const pendingCount = computed(() => areas.value.filter((area) => area.sourcePending).length)
const basisOptions = computed(() => [...new Set(areas.value.map((area) => area.basisType).filter(Boolean))])

async function fetchData() {
  loading.value = true
  error.value = null
  try {
    const result = await fetchAreas({ activeOnly: false })
    areas.value = result.data
  } catch (err) {
    error.value = err.message || 'ไม่สามารถโหลดข้อมูลพื้นที่พิเศษได้'
  } finally {
    loading.value = false
  }
}

async function toggleStatus(area) {
  const nextActive = !area.isActive
  const message = nextActive
    ? `เปิดใช้งาน "${area.areaLabel}" อีกครั้ง?`
    : `ปิดใช้งาน "${area.areaLabel}"?\nพื้นที่ที่ปิดจะไม่ขึ้นให้เลือกตอนบันทึกรายการใหม่ — รายการที่บันทึกไปแล้วไม่ได้รับผลกระทบ`
  if (!window.confirm(message)) return

  togglingId.value = area.areaMultiplierId
  actionError.value = ''
  try {
    await setAreaStatus(area.areaMultiplierId, nextActive)
    await fetchData()
  } catch (err) {
    actionError.value = err.message || 'ไม่สามารถเปลี่ยนสถานะพื้นที่ได้'
  } finally {
    togglingId.value = null
  }
}

function openCreateModal() {
  formData.value = emptyForm()
  formErrors.value = {}
  submitError.value = ''
  showModal.value = true
}

function closeModal() {
  if (saving.value) return
  showModal.value = false
}

async function handleSubmit() {
  formErrors.value = validateForm()
  submitError.value = ''
  if (Object.keys(formErrors.value).length > 0) return

  saving.value = true
  try {
    await createArea({
      ...formData.value,
      multiplier_ratio: Number(formData.value.multiplier_ratio),
    })
    showModal.value = false
    await fetchData()
  } catch (err) {
    submitError.value = err.message || 'ไม่สามารถเพิ่มพื้นที่ได้'
  } finally {
    saving.value = false
  }
}

function validateForm() {
  const errors = {}
  if (!formData.value.province.trim()) errors.province = true
  if (!formData.value.basis_type.trim()) errors.basis_type = true
  const ratio = Number(formData.value.multiplier_ratio)
  if (!Number.isFinite(ratio) || ratio < 100 || ratio > 999.99) errors.multiplier_ratio = true
  if (!formData.value.effective_start_date) errors.effective_start_date = true
  if (
    formData.value.effective_start_date &&
    formData.value.effective_end_date &&
    formData.value.effective_end_date < formData.value.effective_start_date
  ) {
    errors.effective_end_date = true
  }
  return errors
}

function emptyForm() {
  return {
    province: '',
    district: '',
    basis_type: '',
    multiplier_ratio: 200,
    effective_start_date: '',
    effective_end_date: '',
    legal_reference: '',
    source_reference: '',
  }
}

function basisTypeLabel(value) {
  const labels = {
    MARTIAL_LAW: 'กฎอัยการศึก',
    EMERGENCY_DECREE: 'พ.ร.ก.ฉุกเฉิน',
    OTHER: 'อื่น ๆ',
  }
  return labels[value] || value
}

function onGlobalKeydown(e) {
  if (e.key === 'Escape' && showModal.value) closeModal()
}

onMounted(() => {
  fetchData()
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>
```

- [ ] **Step 2: เพิ่ม route ใน `frontend/src/router/index.js`**

หลัง block `time-multiplier` (~บรรทัด 71-75) เพิ่ม:

```js
      {
        path: 'time-multiplier/areas',
        name: 'time-multiplier-areas',
        component: () => import('@/pages/MultiplierAreasPage.vue'),
        meta: { requiresAdmin: true },
      },
```

(guard `requiresAdmin` เด้ง operator กลับ `/dashboard` มีอยู่แล้วใน `router.beforeEach` — ไม่ต้องแก้)

- [ ] **Step 3: เพิ่มเมนู sidebar (admin เท่านั้น) ใน `AppSidebar.vue`**

ใน children ของกลุ่ม `time-extra` แทน:

```js
      { id: 'time-multiplier', label: 'การนับทวีคูณ', to: '/time-multiplier' },
```

ด้วย:

```js
      { id: 'time-multiplier', label: 'การนับทวีคูณ', to: '/time-multiplier' },
      // จัดการ master data พื้นที่ทวีคูณ — admin เท่านั้น (ตรงกับ meta.requiresAdmin ของ route)
      ...(auth.user?.role === 'admin'
        ? [{ id: 'time-multiplier-areas', label: 'จัดการพื้นที่พิเศษ', to: '/time-multiplier/areas' }]
        : []),
```

(ตัวแปร `auth` อยู่ใน scope แล้ว — computed เดียวกันใช้ spread pattern นี้กับเมนู `data-import`/`user-management` อยู่แล้ว)

- [ ] **Step 4: ลิงก์จากหน้าเดิม `MultiplierPage.vue`**

4a) แก้ header ตาราง master data — แทน:

```html
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="border-b border-gray-100 px-6 py-4">
          <h2 class="text-base font-semibold text-gray-900">Master data พื้นที่พิเศษ</h2>
        </div>
```

ด้วย:

```html
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900">Master data พื้นที่พิเศษ</h2>
          <RouterLink
            v-if="isAdmin"
            to="/time-multiplier/areas"
            class="text-sm text-blue-600 hover:text-blue-700"
          >
            จัดการพื้นที่ →
          </RouterLink>
        </div>
```

4b) ใน `<script setup>` ของ `MultiplierPage.vue` — เพิ่ม import + computed:

หลังบรรทัด `import { useMultiplier } from '@/composables/useMultiplier.js'` เพิ่ม:

```js
import { useAuthStore } from '@/stores/auth.js'
```

หลังบรรทัด `const { fetchList, fetchAreas, create } = useMultiplier()` เพิ่ม:

```js
const auth = useAuthStore()
const isAdmin = computed(() => auth.user?.role === 'admin')
```

(`RouterLink` เป็น global component ของ vue-router — ไม่ต้อง import)

- [ ] **Step 5: Build + test ทั้ง suite**

```bash
cd frontend && npm run build && npm test
```

Expected: build สำเร็จ, tests ผ่านทั้งหมด (86 เดิม + 3 จาก Task 6)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/MultiplierAreasPage.vue frontend/src/router/index.js frontend/src/components/AppSidebar.vue frontend/src/pages/MultiplierPage.vue
git commit -m "feat: หน้าจัดการพื้นที่พิเศษ (ทวีคูณ) — เพิ่มพื้นที่/ratio อิสระ + toggle is_active (admin-only)"
```

---

### Task 8: Verification รวม + HTTP smoke

**Files:** ไม่มีไฟล์ใหม่ — ตรวจของจริงทั้งระบบ

- [ ] **Step 1: PHP lint ทุกไฟล์ที่แตะ**

```bash
docker run --rm -v "/d/00 hrProject/smart-port:/app" php:8.3-cli php -l /app/backend/routes/multiplier.php
```

Expected: `No syntax errors detected`

- [ ] **Step 2: Backend suite เต็ม (Unit + Integration)**

```bash
docker compose up -d db   # ถ้ายังไม่รัน
bash backend/tests/run.sh
```

Expected: OK ทั้งหมด — unit ใหม่ 13, integration 28 (26 เดิม + 2 ใหม่), golden ไม่ regress

- [ ] **Step 3: HTTP smoke (route handler ไม่มี harness — ยิงจริง)**

```bash
docker compose up -d --build db backend
# login (dev seed: admin/admin123 — override ได้ด้วย env USER/PASS)
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# 1) POST สำเร็จ → 201 + ratio 150 echo กลับ
curl -s -o /tmp/a.json -w "%{http_code}\n" -X POST http://localhost:8000/multiplier/areas \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"province":"ทดสอบ-smoke","basis_type":"TEST_SMOKE","multiplier_ratio":150,"effective_start_date":"2004-01-26","effective_end_date":"2004-09-30"}'
cat /tmp/a.json

# 2) POST ซ้ำชุดเดิม → 409
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/multiplier/areas \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"province":"ทดสอบ-smoke","basis_type":"TEST_SMOKE","multiplier_ratio":150,"effective_start_date":"2004-01-26"}'

# 3) ratio 80 → 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/multiplier/areas \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"province":"ทดสอบ-80","basis_type":"TEST_SMOKE","multiplier_ratio":80,"effective_start_date":"2004-01-26"}'

# 4) PUT ปิดใช้งาน (ใช้ area_multiplier_id จากข้อ 1) → 200, is_active = 0
AREA_ID=$(grep -o '"area_multiplier_id":[0-9]*' /tmp/a.json | head -1 | cut -d: -f2)
curl -s -w "\n%{http_code}\n" -X PUT "http://localhost:8000/multiplier/areas/${AREA_ID}/status" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"is_active":0}'

# 5) PUT id ไม่มีจริง → 404
curl -s -o /dev/null -w "%{http_code}\n" -X PUT http://localhost:8000/multiplier/areas/999999/status \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"is_active":1}'

# cleanup แถว smoke
docker compose exec -T db mysql -uroot -prootpassword civil_service_mgmt \
  -e "DELETE FROM special_area_multiplier WHERE province LIKE 'ทดสอบ-%';"
```

Expected ตามลำดับ: `201` (+JSON มี `"multiplier_ratio":150`), `409`, `400`, `200` (+`"is_active":0`), `404`

- [ ] **Step 4: Browser check หน้าใหม่** (manual — เปิด `http://localhost:5174` ผ่าน `npm run dev`)

- login ด้วย admin → sidebar เห็น "จัดการพื้นที่พิเศษ" ใต้กลุ่มการนับเวลาเพิ่มเติม
- เพิ่มพื้นที่ ratio 300 → ขึ้นในตาราง + badge "รอเอกสาร" (ไม่กรอก legal_reference)
- ปิดใช้งาน → confirm → แถวจาง + สถานะเปลี่ยน; ไปหน้า "การนับทวีคูณ" → dropdown ไม่มีพื้นที่ที่ปิด
- เปิดใช้งานกลับ → dropdown เห็นอีกครั้ง
- login ด้วย operator (ถ้ามี) → ไม่เห็นเมนู, เข้า URL ตรงถูกเด้งกลับ dashboard

- [ ] **Step 5: Commit สุดท้าย (ถ้ามีแก้จาก smoke) + สรุปผลให้ user**

รายงาน: ผล lint / test counts / smoke status codes / ข้อจำกัดที่พบ

---

## Deviations & Notes

- Frontend route = `/time-multiplier/areas` (ไม่ใช่ `/multiplier/areas` ตาม spec ฉบับแรก) — ปรับให้ตรง naming เดิมของ SPA (`/time-multiplier`); backend API ยังเป็น `/multiplier/areas` ตาม spec (spec ได้รับการแก้ให้ตรงแล้ว)
- ปุ่ม toggle ใช้ `window.confirm` — เรียบง่าย ไม่เพิ่ม modal ซ้อน; ถ้าอยากได้ confirm modal สวยงามเป็นงานตกแต่งภายหลัง
- `basis_type` เป็น free text + datalist — ไม่ hardcode หมวดกฎหมาย (YAGNI จนกว่าจะมีความต้องการ enum จริง)
