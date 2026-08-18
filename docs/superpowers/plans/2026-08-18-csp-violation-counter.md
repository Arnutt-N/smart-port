# CSP Violation Counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้เกณฑ์ "0 CSP violation ใน N วัน" เป็นสิ่งที่ query ผ่าน HTTP ได้และตัดสินด้วย exit code ได้ แทนการเปิด Render log เพ่งด้วยตา

**Architecture:** handler `csp-report` เดิม (`backend/api.php`) เพิ่มการเขียนตัวนับรายวันลง TiDB ต่อท้าย `error_log()` เดิม โดยกลืน error ทุกชนิดเพื่อรักษาสัญญา "ตอบ 204 เสมอ" — ตารางเก็บแบบ aggregate ราย (วัน, directive, blocked_host) พร้อมเพดานจำนวน key ต่อวันในตัว schema เพราะ endpoint นี้เปิดสาธารณะและ rate limiter ปัจจุบัน bypass ได้ด้วยการปลอม XFF ฝั่งอ่านเป็น endpoint ใหม่ `GET /api/csp-report/summary` ที่ยืนยันตัวตนด้วย shared secret ใน header และมีสคริปต์ `scripts/check-csp-violations.mjs` เป็น gate

**Tech Stack:** PHP 8 (ไม่มี framework, PDO + prepared statements) · MySQL/TiDB · PHPUnit (รันผ่าน Docker ด้วย `backend/tests/run.sh`) · Node 24 `node:test` สำหรับสคริปต์

**Spec:** `docs/superpowers/specs/2026-08-18-csp-violation-counter-design.md`

## Global Constraints

- **handler `POST /api/csp-report` ต้องตอบ 204 เสมอ** ไม่ว่า DB จะเป็นอย่างไร — ห้าม throw ออกไปถึง client
- **ห้ามลบ `error_log()` เดิม** — หลักฐานสองทาง (DB ล่มยังมี log / log หายยังมี DB)
- **ไม่เก็บ payload ของ report** เก็บเฉพาะ `directive` + `blocked_host` ที่ผ่าน `sanitizeLogValue()` แล้ว
- `MAX_KEYS_PER_DAY = 200` · `CSP_OVERFLOW_HOST = '__overflow__'` · `CSP_RETENTION_DAYS = 120`
- endpoint สรุปรับ `days` ได้ **1–90** เท่านั้น
- env ที่ใช้ชื่อ **`CSP_SUMMARY_TOKEN`** — ไม่ได้ตั้ง = ตอบ 503 (fail-closed ห้ามเปิดสาธารณะโดยอุบัติเหตุ)
- ทุก query ใช้ prepared statement (โปรเจกต์ตั้ง `ATTR_EMULATE_PREPARES => false` อยู่แล้ว)
- migration ใหม่ต้องแตะ 4 จุด และ `node scripts/validate-schema-parity.mjs` ต้อง exit 0
- โค้ดคอมเมนต์และข้อความ error เป็นภาษาไทย ตามแบบไฟล์ข้างเคียง

---

### Task 1: Migration + schema parity wiring

**Files:**
- Create: `database/31-csp-violation-daily.sql`
- Modify: `database/tidb-init.sql` (แทรกก่อนบรรทัดสุดท้าย `SET FOREIGN_KEY_CHECKS = 1;`)
- Modify: `docker-compose.yaml` (บล็อก volumes ของ service `db` — ต่อจากบรรทัด `./database/30-photo-blob-storage.sql`)
- Modify: `.github/workflows/ci.yml` (บล็อก `-v "$PWD/database/..."` ของ job `backend-tests` — ต่อจากบรรทัดของ `30-photo-blob-storage.sql`)

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces: ตาราง `csp_violation_daily` คอลัมน์ `day DATE`, `directive VARCHAR(64)`, `blocked_host VARCHAR(128)`, `hits INT UNSIGNED`, `first_seen TIMESTAMP`, `last_seen TIMESTAMP`, PK `(day, directive, blocked_host)`

- [ ] **Step 1: รัน gate ก่อนแก้ เพื่อยืนยันว่าตอนนี้ผ่าน**

```bash
node scripts/validate-schema-parity.mjs
```
Expected: exit 0 (`OK ไม่พบ schema drift`)

- [ ] **Step 2: สร้างไฟล์ migration**

สร้าง `database/31-csp-violation-daily.sql`:

```sql
-- ============================================================================
-- 31-csp-violation-daily.sql
-- ตัวนับ CSP violation รายวัน (issue #113) — Render/TiDB: filesystem ไม่ persist
-- จึงเก็บใน DB เหมือน api_rate_limit_hits
--
-- เก็บแบบ aggregate ไม่ใช่ append ทุก event เพราะ /api/csp-report เป็น public
-- endpoint: การ append เปิดช่องให้ใครก็ได้เขียนแถวเข้า production ไม่จำกัด
-- PK สามคอลัมน์ทำหน้าที่ทั้ง unique key ของ UPSERT และ index ของ query ตามช่วงวัน
-- ============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS csp_violation_daily (
    day           DATE NOT NULL,
    directive     VARCHAR(64)  NOT NULL,
    blocked_host  VARCHAR(128) NOT NULL,
    hits          INT UNSIGNED NOT NULL DEFAULT 1,
    first_seen    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (day, directive, blocked_host)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 3: รัน gate เพื่อดูว่ามัน fail (พิสูจน์ว่า gate ทำงานจริง)**

```bash
node scripts/validate-schema-parity.mjs
```
Expected: FAIL — บอกว่า `csp_violation_daily` ไม่มีใน `database/tidb-init.sql` และ migration ไม่ถูก mount

- [ ] **Step 4: เติม DDL เดียวกันลง `database/tidb-init.sql`**

แทรก **ก่อน** บรรทัดสุดท้าย `SET FOREIGN_KEY_CHECKS = 1;`:

```sql
-- ตัวนับ CSP violation รายวัน (issue #113) — ดู database/31-csp-violation-daily.sql
CREATE TABLE IF NOT EXISTS csp_violation_daily (
    day           DATE NOT NULL,
    directive     VARCHAR(64)  NOT NULL,
    blocked_host  VARCHAR(128) NOT NULL,
    hits          INT UNSIGNED NOT NULL DEFAULT 1,
    first_seen    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (day, directive, blocked_host)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 5: เพิ่ม mount ใน `docker-compose.yaml`**

ต่อจากบรรทัดของ `30-photo-blob-storage.sql` ในบล็อก `volumes:` ของ service `db`:

```yaml
      - ./database/31-csp-violation-daily.sql:/docker-entrypoint-initdb.d/31-csp-violation-daily.sql
```

- [ ] **Step 6: เพิ่ม mount ใน `.github/workflows/ci.yml`**

ต่อจากบรรทัดของ `30-photo-blob-storage.sql` ในชุด `-v` ของ job `backend-tests`:

```yaml
            -v "$PWD/database/31-csp-violation-daily.sql:/docker-entrypoint-initdb.d/31-csp-violation-daily.sql" \
```

- [ ] **Step 7: รัน gate ให้กลับมาเขียว**

```bash
node scripts/validate-schema-parity.mjs
```
Expected: exit 0

- [ ] **Step 8: Commit**

```bash
git add database/31-csp-violation-daily.sql database/tidb-init.sql docker-compose.yaml .github/workflows/ci.yml
git commit -m "feat(db): ตาราง csp_violation_daily สำหรับตัวนับ CSP violation รายวัน"
```

---

### Task 2: Write path — บันทึกตัวนับตอนรับ report

**Files:**
- Create: `backend/csp_violations.php`
- Create: `backend/tests/Integration/CspViolationCounterTest.php`
- Modify: `backend/api.php` (case `csp-report` — บล็อก `error_log()` ราวบรรทัด 242)

**Interfaces:**
- Consumes: ตาราง `csp_violation_daily` จาก Task 1 · `tryGetDB(): ?PDO` (`backend/config.php`) · `sanitizeLogValue(?string, int $maxLength = 100): string` (`backend/helpers.php`)
- Produces:
  - `recordCspViolation(?PDO $pdo, string $directive, string $blockedHost): string` คืน `'recorded'` | `'overflow'` | `'skipped'`
  - ค่าคงที่ `CSP_MAX_KEYS_PER_DAY` (200), `CSP_OVERFLOW_HOST` (`'__overflow__'`), `CSP_RETENTION_DAYS` (120)
  - `cspTableReady(PDO $pdo): bool`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `backend/tests/Integration/CspViolationCounterTest.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../csp_violations.php';

/**
 * Integration tests ของตัวนับ CSP violation (issue #113)
 * เขียนลงตาราง csp_violation_daily จริงแล้วอ่านกลับมาตรวจ
 *
 * ใช้ directive ที่ขึ้นต้นด้วย TEST- เพื่อไม่ชนข้อมูลจริง และลบทิ้งใน tearDown
 */
final class CspViolationCounterTest extends TestCase
{
    private const TEST_DIRECTIVE = 'TEST-img-src';

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
        $exists = self::$pdo->query("SHOW TABLES LIKE 'csp_violation_daily'")->fetchColumn();
        if (!$exists) {
            self::markTestSkipped('ไม่พบตาราง csp_violation_daily — รัน database/31-csp-violation-daily.sql ก่อน');
        }
        $this->cleanUp();
    }

    protected function tearDown(): void
    {
        $this->cleanUp();
    }

    private function cleanUp(): void
    {
        self::$pdo->prepare('DELETE FROM csp_violation_daily WHERE directive = ?')
            ->execute([self::TEST_DIRECTIVE]);
    }

    private function hitsOf(string $blockedHost): int
    {
        $stmt = self::$pdo->prepare(
            'SELECT hits FROM csp_violation_daily WHERE day = CURDATE() AND directive = ? AND blocked_host = ?'
        );
        $stmt->execute([self::TEST_DIRECTIVE, $blockedHost]);
        return (int) $stmt->fetchColumn();
    }

    private function keyCount(): int
    {
        $stmt = self::$pdo->prepare(
            'SELECT COUNT(*) FROM csp_violation_daily WHERE day = CURDATE() AND directive = ?'
        );
        $stmt->execute([self::TEST_DIRECTIVE]);
        return (int) $stmt->fetchColumn();
    }

    #[Test]
    public function it_creates_a_row_with_one_hit_for_a_new_host(): void
    {
        $result = recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'example.invalid');

        $this->assertSame('recorded', $result);
        $this->assertSame(1, $this->hitsOf('example.invalid'));
    }

    #[Test]
    public function it_increments_instead_of_adding_a_row_for_a_repeated_host(): void
    {
        // เทสนี้จะพังทันทีถ้ามีคนเปิด PDO::MYSQL_ATTR_FOUND_ROWS ใน backend/config.php
        // เพราะ rowCount() จะไม่คืน 1/2 ตาม affected-rows semantics ที่ตรรกะ cap พึ่งอยู่
        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'example.invalid');
        $result = recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'example.invalid');

        $this->assertSame('recorded', $result);
        $this->assertSame(2, $this->hitsOf('example.invalid'));
        $this->assertSame(1, $this->keyCount());
    }

    #[Test]
    public function it_folds_new_hosts_into_the_overflow_row_past_the_daily_cap(): void
    {
        for ($i = 0; $i < CSP_MAX_KEYS_PER_DAY; $i++) {
            recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, "host{$i}.invalid");
        }
        $before = $this->keyCount();

        $result = recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'one-too-many.invalid');

        $this->assertSame('overflow', $result);
        $this->assertSame(0, $this->hitsOf('one-too-many.invalid'), 'host ที่เกิน cap ต้องไม่มีแถวของตัวเอง');
        $this->assertSame(1, $this->hitsOf(CSP_OVERFLOW_HOST));
        $this->assertSame($before + 1, $this->keyCount(), 'โตได้แค่แถว __overflow__ แถวเดียว');
    }

    #[Test]
    public function it_returns_skipped_when_there_is_no_database(): void
    {
        $this->assertSame('skipped', recordCspViolation(null, self::TEST_DIRECTIVE, 'example.invalid'));
    }

    #[Test]
    public function it_returns_skipped_when_the_table_is_missing(): void
    {
        // จำลองสถานะ production ก่อนรัน DDL — handler ต้องไม่พังและ contract 204 ต้องไม่เปลี่ยน
        $original = $GLOBALS['_csp_table_ready'];
        $GLOBALS['_csp_table_ready'] = false;
        try {
            $this->assertSame('skipped', recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'example.invalid'));
            $this->assertSame(0, $this->hitsOf('example.invalid'));
        } finally {
            $GLOBALS['_csp_table_ready'] = $original;
        }
    }

    #[Test]
    public function it_prunes_rows_past_the_retention_window_without_touching_recent_ones(): void
    {
        // prune เป็น DELETE ที่ถ้าเขียนผิดจะกินข้อมูลปัจจุบันทิ้ง — ต้องมีเทสยืนยันขอบเขต
        $stale = date('Y-m-d', time() - (CSP_RETENTION_DAYS + 30) * 86400);
        self::$pdo->prepare(
            'INSERT INTO csp_violation_daily (day, directive, blocked_host, hits) VALUES (?, ?, ?, 1)'
        )->execute([$stale, self::TEST_DIRECTIVE, 'old.invalid']);

        // prune ทำงานเฉพาะตอนสร้าง key ใหม่
        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'fresh.invalid');

        $stmt = self::$pdo->prepare(
            'SELECT COUNT(*) FROM csp_violation_daily WHERE directive = ? AND day = ?'
        );
        $stmt->execute([self::TEST_DIRECTIVE, $stale]);
        $this->assertSame(0, (int) $stmt->fetchColumn(), 'แถวเก่ากว่า retention ต้องถูกลบ');
        $this->assertSame(1, $this->hitsOf('fresh.invalid'), 'แถวของวันนี้ต้องไม่ถูกแตะ');
    }

    #[Test]
    public function it_truncates_values_to_column_width(): void
    {
        $longHost = str_repeat('a', 200) . '.invalid';

        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, $longHost);

        $this->assertSame(1, $this->hitsOf(substr($longHost, 0, 128)));
    }
}
```

- [ ] **Step 2: รันเทสให้เห็นว่า fail**

```bash
bash backend/tests/run.sh --filter CspViolationCounterTest
```
Expected: FAIL — `Failed opening required '.../csp_violations.php'`

- [ ] **Step 3: เขียน implementation ขั้นต่ำ**

สร้าง `backend/csp_violations.php`:

```php
<?php

declare(strict_types=1);

/**
 * ตัวนับ CSP violation รายวัน (issue #113)
 *
 * ทำไมถึง aggregate ไม่ใช่ append: POST /api/csp-report เป็น public endpoint
 * การเก็บ 1 แถวต่อ event เปิดช่องให้ใครก็ได้เขียนแถวเข้า DB production ไม่จำกัด และ
 * rate limit 60/นาที กันไม่ได้จริงเพราะ publicClientIp() อ่าน XFF ตัวแรกที่ client ปลอมได้
 * เพดานการเติบโตจึงต้องอยู่ในตัว schema เอง (CSP_MAX_KEYS_PER_DAY)
 *
 * ทุกฟังก์ชันในไฟล์นี้ห้าม throw ออกไปถึง handler — สัญญาของ endpoint คือตอบ 204 เสมอ
 */

const CSP_MAX_KEYS_PER_DAY = 200;
const CSP_OVERFLOW_HOST = '__overflow__';
const CSP_RETENTION_DAYS = 120;
const CSP_SELFTEST_LIKE = 'csp-selftest-%.invalid';

/** @var bool|null cache ต่อ request — ไม่ยิง SHOW TABLES ซ้ำ */
$GLOBALS['_csp_table_ready'] = null;

function cspTableReady(PDO $pdo): bool
{
    if ($GLOBALS['_csp_table_ready'] !== null) {
        return $GLOBALS['_csp_table_ready'];
    }
    try {
        $GLOBALS['_csp_table_ready'] = (bool) $pdo->query("SHOW TABLES LIKE 'csp_violation_daily'")->fetchColumn();
    } catch (Throwable $e) {
        error_log('[csp-report] table probe failed: ' . $e->getMessage());
        $GLOBALS['_csp_table_ready'] = false;
    }
    return $GLOBALS['_csp_table_ready'];
}

/**
 * บันทึก 1 violation ลงตัวนับของวันนี้
 *
 * @return string 'recorded' = นับแล้ว, 'overflow' = ชนเพดาน key ต่อวันจึงยุบเข้าแถวรวม,
 *                'skipped' = ไม่มี DB / ตารางยังไม่มี / DB error (ไม่ถือเป็นความผิดพลาดของ request)
 */
function recordCspViolation(?PDO $pdo, string $directive, string $blockedHost): string
{
    if ($pdo === null) {
        return 'skipped';
    }
    $directive = substr($directive, 0, 64);
    $blockedHost = substr($blockedHost, 0, 128);

    try {
        if (!cspTableReady($pdo)) {
            return 'skipped';
        }
        $isNewKey = cspUpsertHit($pdo, $directive, $blockedHost);
        if (!$isNewKey) {
            return 'recorded';
        }
        // เพิ่งสร้าง key ใหม่เท่านั้นที่ทำให้ตารางโต จึงเช็คเพดานเฉพาะตอนนี้
        if (cspKeyCountToday($pdo) > CSP_MAX_KEYS_PER_DAY) {
            cspFoldIntoOverflow($pdo, $directive, $blockedHost);
            cspPrune($pdo);
            return 'overflow';
        }
        cspPrune($pdo);
        return 'recorded';
    } catch (Throwable $e) {
        error_log('[csp-report] persist failed: ' . $e->getMessage());
        return 'skipped';
    }
}

/** @return bool true = เพิ่ง insert key ใหม่, false = บวกเข้า key เดิม */
function cspUpsertHit(PDO $pdo, string $directive, string $blockedHost): bool
{
    $stmt = $pdo->prepare(
        'INSERT INTO csp_violation_daily (day, directive, blocked_host, hits)
         VALUES (CURDATE(), ?, ?, 1)
         ON DUPLICATE KEY UPDATE hits = hits + 1'
    );
    $stmt->execute([$directive, $blockedHost]);
    // MySQL/TiDB affected-rows: 1 = insert ใหม่, 2 = update ของเดิม
    // (พึ่งค่านี้ได้เพราะ backend/config.php ไม่ได้ตั้ง PDO::MYSQL_ATTR_FOUND_ROWS)
    return $stmt->rowCount() === 1;
}

function cspKeyCountToday(PDO $pdo): int
{
    return (int) $pdo->query('SELECT COUNT(*) FROM csp_violation_daily WHERE day = CURDATE()')->fetchColumn();
}

/** ลบ key ที่เพิ่งสร้างแล้วโยน 1 hit เข้าแถวรวมแทน — จำนวนแถวต่อวันจึงมีเพดานตายตัว */
function cspFoldIntoOverflow(PDO $pdo, string $directive, string $blockedHost): void
{
    $pdo->prepare('DELETE FROM csp_violation_daily WHERE day = CURDATE() AND directive = ? AND blocked_host = ?')
        ->execute([$directive, $blockedHost]);
    $pdo->prepare(
        'INSERT INTO csp_violation_daily (day, directive, blocked_host, hits)
         VALUES (CURDATE(), ?, ?, 1)
         ON DUPLICATE KEY UPDATE hits = hits + 1'
    )->execute([$directive, CSP_OVERFLOW_HOST]);
}

/** ลบข้อมูลเก่ากว่า CSP_RETENTION_DAYS — ทำเฉพาะตอนสร้าง key ใหม่ ไม่ใช่ทุก request */
function cspPrune(PDO $pdo): void
{
    $pdo->exec(
        'DELETE FROM csp_violation_daily WHERE day < DATE_SUB(CURDATE(), INTERVAL ' . CSP_RETENTION_DAYS . ' DAY) LIMIT 100'
    );
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
bash backend/tests/run.sh --filter CspViolationCounterTest
```
Expected: PASS ทั้ง 7 เทส

- [ ] **Step 5: ต่อสายเข้า handler**

ใน `backend/api.php` case `csp-report` แก้บล็อกใน `if (is_array($body))` ให้เป็น:

```php
            // log เฉพาะ directive + host ของ blocked URI — ไม่มี PII
            // Issue #122: sanitize ก่อนเข้า log — ค่ามาจาก body ที่ attacker คุมได้ (กัน CRLF ปลอม log line)
            $safeDirective = sanitizeLogValue($directive);
            $safeBlocked = sanitizeLogValue($blocked);
            error_log('[csp-report] violation directive=' . $safeDirective . ' blocked-host=' . $safeBlocked);
            // Issue #113 (R1): เก็บตัวนับรายวันเพื่อให้เกณฑ์ enforce query ได้ — ไม่แทน error_log()
            // ข้างบน (หลักฐานสองทาง) และกลืน error ทุกชนิดเพื่อรักษาสัญญา "ตอบ 204 เสมอ"
            include_once __DIR__ . '/csp_violations.php';
            recordCspViolation(tryGetDB(), $safeDirective, $safeBlocked);
```

- [ ] **Step 6: ยืนยันว่าเทส anti-drift ของ R3 ยังผ่าน**

เทส `รูปแบบ log ที่สคริปต์บอกให้ค้นหา ...` บังคับว่า literal ทั้งสองต้องอยู่ใน `error_log()` บรรทัดเดียวกัน — การแยกตัวแปรข้างบนยังคงรูปนั้นไว้

```bash
node --test scripts/tests/csp-report-selftest.test.mjs
```
Expected: PASS 17/17

- [ ] **Step 7: รัน backend suite ทั้งหมดกันของเดิมพัง**

```bash
bash backend/tests/run.sh
```
Expected: PASS ทั้งหมด (เทสที่ต้องใช้ DB จะ skip เองถ้าไม่มี db service)

- [ ] **Step 8: Commit**

```bash
git add backend/csp_violations.php backend/api.php backend/tests/Integration/CspViolationCounterTest.php
git commit -m "feat(backend): นับ CSP violation รายวันลง DB โดยไม่แตะสัญญา 204"
```

---

### Task 3: Read path — `GET /api/csp-report/summary`

**Files:**
- Create: `backend/routes/csp_summary.php`
- Modify: `backend/csp_violations.php` (เพิ่ม `cspSummary()`)
- Modify: `backend/api.php` (ประกาศ public route + rate limit + แตก case `csp-report`)
- Create: `backend/tests/Integration/CspSummaryTest.php`
- Create: `backend/tests/Unit/CspSummaryAuthTest.php`

**Interfaces:**
- Consumes: `recordCspViolation()`, `cspTableReady()`, `CSP_OVERFLOW_HOST`, `CSP_SELFTEST_LIKE` จาก Task 2 · `respondMethodNotAllowed(): void` (`backend/api.php` ใช้อยู่แล้ว) · `checkRateLimitPublic(string $key, int $limit, int $windowSeconds): void` (`backend/middleware/rate_limit.php`)
- Produces:
  - `cspSummary(?PDO $pdo, int $days): array` — โครงสร้างตาม JSON ด้านล่าง
  - `handleCspSummary(?PDO $pdo, string $method, array $query): void`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `backend/tests/Integration/CspSummaryTest.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../csp_violations.php';

/**
 * Integration tests ของ cspSummary() — แยก violation จริงออกจาก marker ของ self-test
 * และรายงาน overflow แยกต่างหาก (ถ้ามี overflow แปลว่าข้อมูลไม่ครบ ห้ามสรุปว่าสะอาด)
 */
final class CspSummaryTest extends TestCase
{
    private const TEST_DIRECTIVE = 'TEST-summary-src';

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
        if (!self::$pdo->query("SHOW TABLES LIKE 'csp_violation_daily'")->fetchColumn()) {
            self::markTestSkipped('ไม่พบตาราง csp_violation_daily — รัน database/31-csp-violation-daily.sql ก่อน');
        }
        $this->cleanUp();
    }

    protected function tearDown(): void
    {
        $this->cleanUp();
    }

    private function cleanUp(): void
    {
        self::$pdo->prepare('DELETE FROM csp_violation_daily WHERE directive = ?')
            ->execute([self::TEST_DIRECTIVE]);
    }

    /** สรุปเฉพาะแถวของเทสนี้ — กรอง directive ของเทสออกจากผลรวมทั้งระบบ */
    private function summaryRowsForTest(array $summary): array
    {
        return array_values(array_filter(
            $summary['violations']['top'],
            static fn (array $row): bool => $row['directive'] === self::TEST_DIRECTIVE
        ));
    }

    #[Test]
    public function it_separates_selftest_markers_from_real_violations(): void
    {
        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'evil.example.invalid');
        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, 'csp-selftest-20260824-a3f9.invalid');

        $summary = cspSummary(self::$pdo, 7);

        $this->assertSame('ready', $summary['storage']);
        $rows = $this->summaryRowsForTest($summary);
        $this->assertCount(1, $rows, 'marker ของ self-test ต้องไม่ถูกนับเป็น violation');
        $this->assertSame('evil.example.invalid', $rows[0]['blocked_host']);

        $markers = array_column($summary['selftest']['markers'], 'blocked_host');
        $this->assertContains('csp-selftest-20260824-a3f9.invalid', $markers);
    }

    #[Test]
    public function it_reports_storage_unavailable_without_a_database(): void
    {
        $summary = cspSummary(null, 7);

        $this->assertSame('unavailable', $summary['storage']);
        $this->assertSame(0, $summary['violations']['total']);
    }

    #[Test]
    public function it_counts_overflow_hits_separately(): void
    {
        recordCspViolation(self::$pdo, self::TEST_DIRECTIVE, CSP_OVERFLOW_HOST);

        $summary = cspSummary(self::$pdo, 7);

        $this->assertGreaterThan(0, $summary['overflow_hits']);
        $rows = $this->summaryRowsForTest($summary);
        $this->assertCount(0, $rows, 'แถว __overflow__ ต้องไม่ปนใน violations');
    }

    #[Test]
    public function it_echoes_the_requested_window(): void
    {
        $summary = cspSummary(self::$pdo, 30);

        $this->assertSame(30, $summary['window_days']);
        $this->assertSame(date('Y-m-d', time() - 29 * 86400), $summary['since']);
    }
}
```

- [ ] **Step 2: รันเทสให้เห็นว่า fail**

```bash
bash backend/tests/run.sh --filter CspSummaryTest
```
Expected: FAIL — `Call to undefined function cspSummary()`

- [ ] **Step 3: เขียน `cspSummary()` ต่อท้าย `backend/csp_violations.php`**

```php
/**
 * สรุปตัวนับในหน้าต่าง N วันล่าสุด (รวมวันนี้)
 *
 * แยก 3 กอง: violation จริง / marker ของ self-test (ของทีม ไม่ใช่ของจริง) / overflow
 * ที่ต้องแยกเพราะแต่ละกองมีความหมายต่อการตัดสินใจ enforce คนละแบบ:
 *   violations > 0  → ยังมีของจริงค้าง ห้าม enforce
 *   selftest        → หลักฐานว่า pipeline ยังส่งถึงจริง (ไม่มี = สรุปไม่ได้)
 *   overflow > 0    → ข้อมูลไม่ครบเพราะชนเพดาน ต้องดู Render log ประกอบ
 *
 * @return array{window_days:int, since:string, storage:string, violations:array, selftest:array, overflow_hits:int}
 */
function cspSummary(?PDO $pdo, int $days): array
{
    $since = date('Y-m-d', time() - ($days - 1) * 86400);
    $summary = [
        'window_days' => $days,
        'since' => $since,
        'storage' => 'unavailable',
        'violations' => ['total' => 0, 'top' => []],
        'selftest' => ['total' => 0, 'markers' => []],
        'overflow_hits' => 0,
    ];
    if ($pdo === null) {
        return $summary;
    }
    try {
        if (!cspTableReady($pdo)) {
            return $summary;
        }
        $realWhere = 'day >= ? AND blocked_host <> ? AND blocked_host NOT LIKE ?';
        $realArgs = [$since, CSP_OVERFLOW_HOST, CSP_SELFTEST_LIKE];

        $total = $pdo->prepare("SELECT COALESCE(SUM(hits), 0) FROM csp_violation_daily WHERE {$realWhere}");
        $total->execute($realArgs);

        $top = $pdo->prepare(
            "SELECT directive, blocked_host, SUM(hits) AS hits, MAX(last_seen) AS last_seen
             FROM csp_violation_daily WHERE {$realWhere}
             GROUP BY directive, blocked_host ORDER BY hits DESC LIMIT 50"
        );
        $top->execute($realArgs);

        $markers = $pdo->prepare(
            'SELECT blocked_host, SUM(hits) AS hits, MAX(last_seen) AS last_seen
             FROM csp_violation_daily WHERE day >= ? AND blocked_host LIKE ?
             GROUP BY blocked_host ORDER BY last_seen DESC LIMIT 20'
        );
        $markers->execute([$since, CSP_SELFTEST_LIKE]);
        $markerRows = $markers->fetchAll();

        $overflow = $pdo->prepare(
            'SELECT COALESCE(SUM(hits), 0) FROM csp_violation_daily WHERE day >= ? AND blocked_host = ?'
        );
        $overflow->execute([$since, CSP_OVERFLOW_HOST]);

        $summary['storage'] = 'ready';
        $summary['violations'] = [
            'total' => (int) $total->fetchColumn(),
            'top' => array_map(static fn (array $r): array => [
                'directive' => $r['directive'],
                'blocked_host' => $r['blocked_host'],
                'hits' => (int) $r['hits'],
                'last_seen' => $r['last_seen'],
            ], $top->fetchAll()),
        ];
        $summary['selftest'] = [
            'total' => array_sum(array_map(static fn (array $r): int => (int) $r['hits'], $markerRows)),
            'markers' => array_map(static fn (array $r): array => [
                'blocked_host' => $r['blocked_host'],
                'hits' => (int) $r['hits'],
                'last_seen' => $r['last_seen'],
            ], $markerRows),
        ];
        $summary['overflow_hits'] = (int) $overflow->fetchColumn();
    } catch (Throwable $e) {
        error_log('[csp-report] summary failed: ' . $e->getMessage());
        return $summary;
    }
    return $summary;
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
bash backend/tests/run.sh --filter CspSummaryTest
```
Expected: PASS ทั้ง 4 เทส

- [ ] **Step 5: เขียนเทสของ auth ที่ยังไม่ผ่าน (ไม่ต้องใช้ DB — อยู่ใน Unit suite)**

สร้าง `backend/tests/Unit/CspSummaryAuthTest.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/csp_summary.php';

/**
 * auth + input validation ของ GET /api/csp-report/summary — ไม่แตะ DB (ส่ง $pdo = null)
 * เทสชุดนี้ล็อกพฤติกรรม fail-closed ไว้: ไม่ตั้ง env = 503 ไม่ใช่เปิดให้อ่านฟรี
 */
final class CspSummaryAuthTest extends TestCase
{
    protected function setUp(): void
    {
        putenv('CSP_SUMMARY_TOKEN');
        unset($_SERVER['HTTP_X_CSP_SUMMARY_TOKEN']);
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        putenv('CSP_SUMMARY_TOKEN');
        unset($_SERVER['HTTP_X_CSP_SUMMARY_TOKEN']);
    }

    /** @return array{status:int, body:array} */
    private function call(string $method, array $query): array
    {
        ob_start();
        handleCspSummary(null, $method, $query);
        $body = (string) ob_get_clean();
        return ['status' => http_response_code(), 'body' => json_decode($body, true) ?? []];
    }

    #[Test]
    public function it_returns_503_when_the_token_env_is_not_configured(): void
    {
        $result = $this->call('GET', []);

        $this->assertSame(503, $result['status']);
        $this->assertSame('summary endpoint not configured', $result['body']['error']);
    }

    #[Test]
    public function it_returns_401_when_the_token_does_not_match(): void
    {
        putenv('CSP_SUMMARY_TOKEN=correct-token');
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = 'wrong-token';

        $this->assertSame(401, $this->call('GET', [])['status']);
    }

    #[Test]
    public function it_returns_401_when_the_token_header_is_missing(): void
    {
        putenv('CSP_SUMMARY_TOKEN=correct-token');

        $this->assertSame(401, $this->call('GET', [])['status']);
    }

    #[Test]
    public function it_rejects_a_days_value_outside_the_allowed_range(): void
    {
        putenv('CSP_SUMMARY_TOKEN=correct-token');
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = 'correct-token';

        $this->assertSame(400, $this->call('GET', ['days' => '0'])['status']);
        http_response_code(200);
        $this->assertSame(400, $this->call('GET', ['days' => '91'])['status']);
    }

    #[Test]
    public function it_answers_with_the_summary_shape_when_the_token_matches(): void
    {
        putenv('CSP_SUMMARY_TOKEN=correct-token');
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = 'correct-token';

        $result = $this->call('GET', ['days' => '7']);

        $this->assertSame(200, $result['status']);
        // $pdo = null → storage ต้องเป็น unavailable ไม่ใช่ ready ที่มี 0 violation
        $this->assertSame('unavailable', $result['body']['storage']);
        $this->assertSame(7, $result['body']['window_days']);
    }

    #[Test]
    public function it_rejects_non_get_methods(): void
    {
        putenv('CSP_SUMMARY_TOKEN=correct-token');
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = 'correct-token';

        $this->assertSame(405, $this->call('POST', [])['status']);
    }
}
```

- [ ] **Step 6: รันเทสให้เห็นว่า fail**

```bash
bash backend/tests/run.sh --testsuite Unit --filter CspSummaryAuthTest
```
Expected: FAIL — `Failed opening required '.../routes/csp_summary.php'`

- [ ] **Step 7: สร้าง route handler**

สร้าง `backend/routes/csp_summary.php`:

```php
<?php

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../csp_violations.php';

/**
 * GET /api/csp-report/summary?days=7 — สรุปตัวนับ CSP violation (issue #113)
 *
 * ผู้อ่านหลักคือสคริปต์ gate จึงไม่ใช้ JWT (สคริปต์ไม่มีบัญชี) แต่ใช้ shared secret
 * ใน header แทน — และ fail-closed เป็น 503 เมื่อยังไม่ได้ตั้ง env เพื่อไม่ให้ endpoint
 * นี้เปิดสาธารณะโดยอุบัติเหตุ (ข้อมูล directive ที่ถูกละเมิดบอกใบ้คนที่กำลังทดสอบช่องโหว่)
 */
function handleCspSummary(?PDO $pdo, string $method, array $query): void
{
    if ($method !== 'GET') {
        respondMethodNotAllowed();
        return;
    }

    $expected = (string) getenv('CSP_SUMMARY_TOKEN');
    if ($expected === '') {
        http_response_code(503);
        echo json_encode(['error' => 'summary endpoint not configured']);
        return;
    }
    $provided = (string) ($_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] ?? '');
    if (!hash_equals($expected, $provided)) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $days = (int) ($query['days'] ?? 7);
    if ($days < 1 || $days > 90) {
        http_response_code(400);
        echo json_encode(['error' => 'days ต้องอยู่ระหว่าง 1-90'], JSON_UNESCAPED_UNICODE);
        return;
    }

    echo json_encode(cspSummary($pdo, $days), JSON_UNESCAPED_UNICODE);
}
```

- [ ] **Step 8: รันเทส auth ให้ผ่าน**

```bash
bash backend/tests/run.sh --testsuite Unit --filter CspSummaryAuthTest
```
Expected: PASS ทั้ง 6 เทส

- [ ] **Step 9: ต่อสายใน `backend/api.php`**

หลังบรรทัด `$isPublicCspReport = ...` (ราวบรรทัด 113) เพิ่ม:

```php
// Issue #113 (R1): endpoint สรุปตัวนับ — ไม่ใช้ JWT เพราะผู้อ่านคือสคริปต์ที่ไม่มีบัญชี
// ยืนยันตัวตนด้วย shared secret ใน handler แทน (ดู routes/csp_summary.php)
$isCspSummary = $path[0] === 'csp-report' && ($path[1] ?? '') === 'summary' && $method === 'GET';
```

ในบล็อก rate limit เพิ่มสาขา (ต่อจาก `} elseif ($isPublicCspReport) {`):

```php
} elseif ($isCspSummary) {
    // เข้มกว่าตัวอื่นเพราะ endpoint นี้มี secret ให้เดา — 10/นาที ทำ brute-force ไม่ไหว
    checkRateLimitPublic('csp-summary', 10, 60);
}
```

ในเงื่อนไขบังคับ JWT เพิ่ม `&& !$isCspSummary`:

```php
if (!$isPublicAuth && !$isPublicPhotoAsset && !$isPublicReadyz && !$isPublicCspReport && !$isCspSummary && $method !== 'OPTIONS') {
```

ใน `switch ($path[0])` แก้ `case 'csp-report':` ให้แตกทางก่อนโค้ดเดิม:

```php
    case 'csp-report':
        // GET /api/csp-report/summary — อ่านสรุปตัวนับ (issue #113)
        if (($path[1] ?? '') === 'summary') {
            include_once __DIR__ . '/routes/csp_summary.php';
            handleCspSummary(tryGetDB(), $method, $_GET);
            break;
        }
        // POST /api/csp-report — รับ violation report จาก browser (report-only phase)
        if ($method !== 'POST') {
```

- [ ] **Step 10: ตรวจด้วยมือบน stack ในเครื่อง**

```bash
docker compose up -d db backend
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/csp-report/summary
```
Expected: `503` (ยังไม่ได้ตั้ง env — พฤติกรรม fail-closed ที่ต้องการ)

```bash
docker compose exec -e CSP_SUMMARY_TOKEN=devtoken backend php -r 'echo getenv("CSP_SUMMARY_TOKEN");'
```
Expected: `devtoken` (ยืนยันว่า env ส่งเข้า container ได้ — ใช้ตอนตั้งค่าจริงบน Render)

- [ ] **Step 11: รัน backend suite ทั้งหมด**

```bash
bash backend/tests/run.sh
```
Expected: PASS ทั้งหมด

- [ ] **Step 12: Commit**

```bash
git add backend/csp_violations.php backend/routes/csp_summary.php backend/api.php backend/tests/Integration/CspSummaryTest.php backend/tests/Unit/CspSummaryAuthTest.php
git commit -m "feat(backend): endpoint สรุปตัวนับ CSP violation ที่ยืนยันตัวตนด้วย shared secret"
```

---

### Task 4: Gate script `check-csp-violations.mjs`

**Files:**
- Create: `scripts/check-csp-violations.mjs`
- Create: `scripts/tests/check-csp-violations.test.mjs`

**Interfaces:**
- Consumes: `GET /api/csp-report/summary?days=N` + header `X-CSP-Summary-Token` จาก Task 3
- Produces: CLI ที่ exit 0 เมื่อ "ข้อมูลพร้อมและสะอาด" · export `evaluateSummary(summary, { requireMarker }): {ok: boolean, reasons: string[]}` ให้เทสเรียกตรง

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `scripts/tests/check-csp-violations.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSummary } from '../check-csp-violations.mjs';

const clean = {
  window_days: 7,
  since: '2026-08-12',
  storage: 'ready',
  violations: { total: 0, top: [] },
  selftest: { total: 1, markers: [{ blocked_host: 'csp-selftest-20260824-a3f9.invalid', hits: 1, last_seen: '2026-08-24 05:10:38' }] },
  overflow_hits: 0,
};

test('ข้อมูลพร้อมและไม่มี violation → ผ่าน', () => {
  assert.equal(evaluateSummary(clean, {}).ok, true);
});

test('storage unavailable ต้องไม่ผ่าน — "ไม่มีข้อมูล" ไม่เท่ากับ "ไม่มี violation"', () => {
  const result = evaluateSummary({ ...clean, storage: 'unavailable' }, {});
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /ยังไม่มีตาราง|สรุปไม่ได้/);
});

test('มี violation จริงต้องไม่ผ่าน และบอกว่า host ไหน', () => {
  const result = evaluateSummary(
    { ...clean, violations: { total: 3, top: [{ directive: 'img-src', blocked_host: 'evil.example', hits: 3, last_seen: '2026-08-24 01:00:00' }] } },
    {}
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /evil\.example/);
});

test('overflow > 0 ต้องไม่ผ่าน เพราะข้อมูลไม่ครบ', () => {
  const result = evaluateSummary({ ...clean, overflow_hits: 5 }, {});
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /overflow/i);
});

test('--require-marker ที่ไม่เจอต้องไม่ผ่าน', () => {
  const result = evaluateSummary(clean, { requireMarker: 'csp-selftest-20260824-ffff.invalid' });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /marker/i);
});

test('--require-marker ที่เจอแล้วต้องผ่าน', () => {
  assert.equal(evaluateSummary(clean, { requireMarker: 'csp-selftest-20260824-a3f9.invalid' }).ok, true);
});
```

- [ ] **Step 2: รันเทสให้เห็นว่า fail**

```bash
node --test scripts/tests/check-csp-violations.test.mjs
```
Expected: FAIL — `Cannot find module .../check-csp-violations.mjs`

- [ ] **Step 3: เขียนสคริปต์**

สร้าง `scripts/check-csp-violations.mjs`:

```js
#!/usr/bin/env node
// CSP violation gate — issue #113 (R1)
//
// ถามสรุปตัวนับจาก backend แล้วตัดสินด้วย exit code แทนการเปิด Render log เพ่งด้วยตา
// exit 0 = ข้อมูลพร้อม + ไม่มี violation จากระบบจริงในหน้าต่างที่ขอ (+ เจอ marker ถ้าระบุ)
//
// **"ไม่มีข้อมูล" ไม่เท่ากับ "ไม่มี violation"** — storage: unavailable และ overflow_hits > 0
// ถือเป็น fail ทั้งคู่ เป็นบทเรียนเดียวกับ "log ว่าง ≠ ปลอดภัย"
//
// Usage: node scripts/check-csp-violations.mjs [--base-url <url>] [--days 7] [--require-marker <host>]
//   token อ่านจาก env CSP_SUMMARY_TOKEN เท่านั้น (argument โผล่ใน process list และ shell history)

import { pathToFileURL } from 'node:url';

const DEFAULT_BASE = 'https://smart-port.onrender.com';
const SUMMARY_PATH = '/api/csp-report/summary';
const FETCH_TIMEOUT_MS = 30_000;

const USAGE = `Usage: node scripts/check-csp-violations.mjs [--base-url <url>] [--days 7] [--require-marker <host>]

  --base-url <url>        origin ที่จะถาม (default = ${DEFAULT_BASE})
  --days <1-90>           ขนาดหน้าต่างที่ต้องสะอาด (default 7 ตามเกณฑ์ enforce)
  --require-marker <host> ต้องเจอ marker นี้ใน selftest ด้วย (ค่าที่ csp-report-selftest.mjs พิมพ์)
  -h, --help              แสดงข้อความนี้

env CSP_SUMMARY_TOKEN ต้องตั้งไว้ — ตรงกับค่าบน Render service smartport-backend`;

const normalizeBase = (value) => {
  const trimmed = value.trim().replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`--base-url ไม่ใช่ URL ที่ใช้ได้: "${value}"`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`--base-url ต้องเป็น http/https เท่านั้น (ได้ "${parsed.protocol}")`);
  }
  return trimmed;
};

/** fail-closed แบบเดียวกับ csp-report-selftest.mjs — default ของสคริปต์นี้คือยิง production */
function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE, days: 7, requireMarker: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '-h' || arg === '--help') {
      args.help = true;
      continue;
    }
    if (arg === '--base-url' && next && !next.startsWith('--')) {
      args.baseUrl = normalizeBase(next);
      i++;
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      args.baseUrl = normalizeBase(arg.slice('--base-url='.length));
      continue;
    }
    if (arg === '--days' && next && !next.startsWith('--')) {
      args.days = Number(next);
      i++;
      continue;
    }
    if (arg === '--require-marker' && next && !next.startsWith('--')) {
      args.requireMarker = next;
      i++;
      continue;
    }
    throw new Error(`อาร์กิวเมนต์ที่ใช้ไม่ได้: "${arg}" — ดู --help`);
  }
  if (!Number.isInteger(args.days) || args.days < 1 || args.days > 90) {
    throw new Error(`--days ต้องเป็นจำนวนเต็ม 1-90 (ได้ "${args.days}")`);
  }
  return args;
}

/**
 * ตัดสินจาก summary ว่าผ่านเกณฑ์หรือไม่ — แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อให้เทสตรวจ
 * "ความหมายของผลลัพธ์" ได้โดยไม่ต้องมี server
 */
function evaluateSummary(summary, { requireMarker = null } = {}) {
  const reasons = [];
  if (summary.storage !== 'ready') {
    reasons.push('backend ยังไม่มีตาราง csp_violation_daily (storage=' + summary.storage + ') → สรุปไม่ได้ ไม่ใช่ "ไม่มี violation"');
  }
  const total = summary.violations?.total ?? 0;
  if (total > 0) {
    const detail = (summary.violations.top ?? [])
      .slice(0, 5)
      .map((r) => `${r.directive} ← ${r.blocked_host} (${r.hits})`)
      .join(', ');
    reasons.push(`พบ violation จากระบบจริง ${total} ครั้ง: ${detail}`);
  }
  if ((summary.overflow_hits ?? 0) > 0) {
    reasons.push(`overflow_hits=${summary.overflow_hits} → ชนเพดาน key ต่อวัน ข้อมูลไม่ครบ ต้องดู Render log ประกอบ`);
  }
  if (requireMarker) {
    const markers = (summary.selftest?.markers ?? []).map((m) => m.blocked_host);
    if (!markers.includes(requireMarker)) {
      reasons.push(`ไม่เจอ marker "${requireMarker}" ในหน้าต่างนี้ → pipeline ยังพิสูจน์ไม่ได้`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

async function fetchSummary(baseUrl, days, token) {
  const res = await fetch(`${baseUrl}${SUMMARY_PATH}?days=${days}`, {
    method: 'GET',
    headers: { 'x-csp-summary-token': token },
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 401) throw new Error('401 — CSP_SUMMARY_TOKEN ไม่ตรงกับค่าบน backend');
  if (res.status === 503) throw new Error('503 — backend ยังไม่ได้ตั้ง env CSP_SUMMARY_TOKEN');
  if (res.status !== 200) throw new Error(`ได้ HTTP ${res.status} (ต้องเป็น 200)`);
  return res.json();
}

async function main() {
  const { baseUrl, days, requireMarker, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(USAGE);
    return;
  }
  const token = process.env.CSP_SUMMARY_TOKEN ?? '';
  if (token === '') {
    console.error('✗ FAIL: ไม่ได้ตั้ง env CSP_SUMMARY_TOKEN — ดูค่าจาก Render service smartport-backend');
    process.exitCode = 1;
    return;
  }

  console.log('CSP violation gate — issue #113');
  console.log(`base URL: ${baseUrl}`);
  console.log(`window:   ${days} วัน${requireMarker ? `  marker ที่ต้องเจอ: ${requireMarker}` : ''}`);

  let summary;
  try {
    summary = await fetchSummary(baseUrl, days, token);
  } catch (err) {
    console.error(`\n✗ FAIL: อ่านสรุปไม่ได้ — ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nตั้งแต่ ${summary.since} (storage=${summary.storage})`);
  console.log(`  violation จริง : ${summary.violations?.total ?? 0}`);
  console.log(`  marker ของทีม  : ${summary.selftest?.total ?? 0}`);
  console.log(`  overflow       : ${summary.overflow_hits ?? 0}`);

  const { ok, reasons } = evaluateSummary(summary, { requireMarker });
  if (!ok) {
    console.error('');
    for (const reason of reasons) console.error(`  [✗] ${reason}`);
    console.error('\n✗ FAIL: ยังไม่ผ่านเกณฑ์ ห้าม enforce');
    process.exitCode = 1;
    return;
  }
  console.log(`\n✓ PASS: ไม่มี violation จากระบบจริงในหน้าต่าง ${days} วัน`);
  console.log('  เตือน: เกณฑ์นี้มีความหมายก็ต่อเมื่อมีคนใช้งานจริงในหน้าต่างนั้นด้วย');
  console.log('  ดู docs/frontend-security-headers.md §CSP monitoring ก่อน enforce');
}

export { evaluateSummary, parseArgs };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`✗ FAIL: ${err.message}`);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
node --test scripts/tests/check-csp-violations.test.mjs
```
Expected: PASS ทั้ง 6 เทส

- [ ] **Step 5: เพิ่มเทสระดับ CLI ด้วย mock origin**

ต่อท้าย `scripts/tests/check-csp-violations.test.mjs` (helper `startServer`/`runArgs` คัดลอกรูปแบบมาจาก `scripts/tests/csp-report-selftest.test.mjs` — ตอนนี้มีสองที่แล้ว ถ้ามีที่สามเมื่อไรให้แยกเป็น `scripts/tests/helpers/mock-origin.mjs`):

```js
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-csp-violations.mjs');

function runArgs(args, env = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: ROOT, env: { ...process.env, ...env } });
    let output = '';
    child.stdout.on('data', (c) => (output += c));
    child.stderr.on('data', (c) => (output += c));
    const timer = setTimeout(() => {
      child.kill();
      rejectRun(new Error('check-csp-violations.mjs ไม่จบภายใน 60s'));
    }, 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ status: code, output });
    });
  });
}

function startServer(handler) {
  const received = [];
  const server = createServer((req, res) => {
    received.push({ url: req.url, headers: req.headers });
    handler(req, res);
  });
  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => ready({ server, received, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('ส่ง token ผ่าน header และผ่านเมื่อสะอาด', async () => {
  const { server, baseUrl, received } = await startServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(clean));
  });
  try {
    const { status, output } = await runArgs(['--base-url', baseUrl], { CSP_SUMMARY_TOKEN: 'secret123' });
    assert.equal(status, 0, output);
    assert.equal(received[0].headers['x-csp-summary-token'], 'secret123');
    assert.match(received[0].url, /\/api\/csp-report\/summary\?days=7/);
  } finally {
    server.close();
  }
});

test('ไม่ได้ตั้ง CSP_SUMMARY_TOKEN → exit 1 ก่อนแตะเครือข่าย', async () => {
  const { server, baseUrl, received } = await startServer((req, res) => res.end('{}'));
  try {
    const { status, output } = await runArgs(['--base-url', baseUrl], { CSP_SUMMARY_TOKEN: '' });
    assert.equal(status, 1, output);
    assert.equal(received.length, 0);
  } finally {
    server.close();
  }
});

test('backend ตอบ 503 (ยังไม่ตั้ง env) → exit 1 พร้อมบอกสาเหตุ', async () => {
  const { server, baseUrl } = await startServer((req, res) => {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'summary endpoint not configured' }));
  });
  try {
    const { status, output } = await runArgs(['--base-url', baseUrl], { CSP_SUMMARY_TOKEN: 'x' });
    assert.equal(status, 1, output);
    assert.match(output, /503/);
  } finally {
    server.close();
  }
});

test('argument ผิด → exit 1 ก่อนแตะเครือข่าย', async () => {
  const { server, baseUrl, received } = await startServer((req, res) => res.end('{}'));
  try {
    const { status } = await runArgs(['--base-url', baseUrl, '--verbose'], { CSP_SUMMARY_TOKEN: 'x' });
    assert.equal(status, 1);
    assert.equal(received.length, 0);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 6: รันเทสทั้งไฟล์**

```bash
node --test scripts/tests/check-csp-violations.test.mjs
```
Expected: PASS 10 เทส

- [ ] **Step 7: ยืนยันว่า pre-push เก็บไฟล์ใหม่เข้า gate อัตโนมัติ**

```bash
node --test scripts/tests/*.test.mjs
```
Expected: PASS — จำนวนเทสรวมเพิ่มขึ้นจาก 23 เป็น 33 (glob ใน `.githooks/pre-push` ครอบไฟล์ใหม่ให้เอง ไม่ต้องแก้ hook)

- [ ] **Step 8: Commit**

```bash
git add scripts/check-csp-violations.mjs scripts/tests/check-csp-violations.test.mjs
git commit -m "feat(scripts): gate ตัดสินเกณฑ์ CSP violation ด้วย exit code"
```

---

### Task 5: Rollout — env, เอกสาร, และ runbook ของงานที่ต้องทำบน production

**Files:**
- Modify: `render.yaml` (envVars ของ service `smartport-backend`)
- Modify: `docs/frontend-security-headers.md` (§CSP monitoring + §การทดสอบ)
- Create: `docs/runbooks/csp-counter-activation.md`

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 1–4
- Produces: เอกสารขั้นตอนที่ผู้มีสิทธิ์ production ทำตามได้โดยไม่ต้องอ่านโค้ด

- [ ] **Step 1: เพิ่ม env ใน `render.yaml`**

ต่อท้าย envVars ของ service `smartport-backend`:

```yaml
      # Issue #113 (R1): shared secret ของ GET /api/csp-report/summary
      # ไม่ได้ตั้ง = endpoint ตอบ 503 (fail-closed) ส่วนการนับยังทำงานปกติ
      - key: CSP_SUMMARY_TOKEN
        sync: false
```

- [ ] **Step 2: สุ่มค่า token ไว้ให้ผู้ใช้ไปวาง (ห้าม commit ค่า)**

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```
พิมพ์ค่าให้ผู้ใช้ในแชท และบอกให้เก็บไว้ที่ `secrets/secret-keys.txt` (ไฟล์นี้ถูก gitignore อยู่แล้ว) — **ห้ามเขียนค่าลงไฟล์ใดที่ git ติดตาม**

- [ ] **Step 3: เขียน runbook**

สร้าง `docs/runbooks/csp-counter-activation.md` ด้วยเนื้อหานี้ทั้งหมด:

````markdown
# Runbook: เปิดใช้ CSP violation counter บน production

ต้องทำโดยคนที่มีสิทธิ์ production (agent ทำแทนไม่ได้) — **ทำได้ทีละข้อ ไม่ต้องทำพร้อมกัน
และไม่มีขั้นไหนทำให้ระบบที่ใช้งานอยู่หยุดทำงาน**

โค้ดที่ deploy ไปแล้วทำงานได้เองโดยไม่ต้องรอ runbook นี้ — ถ้ายังไม่ทำข้อ 1 ระบบจะทำงาน
เหมือนก่อนหน้านี้ทุกประการ (log อย่างเดียว ไม่นับ)

## ข้อ 1 — สร้างตารางบน prod TiDB

เปิด SQL console ของ TiDB (ผ่าน TiDB Cloud console หรือ mysql client ที่ต่อ production) แล้วรัน:

```sql
CREATE TABLE IF NOT EXISTS csp_violation_daily (
    day           DATE NOT NULL,
    directive     VARCHAR(64)  NOT NULL,
    blocked_host  VARCHAR(128) NOT NULL,
    hits          INT UNSIGNED NOT NULL DEFAULT 1,
    first_seen    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (day, directive, blocked_host)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

คำสั่งนี้ **รันซ้ำได้ไม่พัง** (`IF NOT EXISTS`) และไม่แตะตารางอื่นเลย

ยืนยัน:

```sql
SHOW TABLES LIKE 'csp_violation_daily';
```
ต้องได้ 1 แถว

**ตัวนับเริ่มจากศูนย์ ณ วินาทีนี้ ย้อนหลังไม่ได้**

## ข้อ 2 — ตั้ง env `CSP_SUMMARY_TOKEN` บน Render

1. Render dashboard → service **`smartport-backend`** (ไม่ใช่ static site `smart-port`)
2. เมนู **Environment** → **Add Environment Variable**
3. Key: `CSP_SUMMARY_TOKEN` · Value: ค่าที่ทีมสุ่มไว้ (เก็บใน `secrets/secret-keys.txt`)
4. **Save Changes** — service จะ restart เองราว 1-2 นาที

ระหว่าง restart การนับยังทำงานปกติ (env นี้ใช้เฉพาะฝั่งอ่านสรุป)

## ข้อ 3 — ยืนยันว่าใช้งานได้

```bash
node scripts/csp-report-selftest.mjs
# คัดลอก marker ที่พิมพ์ออกมา (csp-selftest-YYYYMMDD-xxxx.invalid) ไปใส่บรรทัดล่าง

CSP_SUMMARY_TOKEN='<ค่าที่ตั้งไว้>' node scripts/check-csp-violations.mjs --days 7 --require-marker '<marker>'
```

| ผลที่เห็น | แปลว่า | ทำอะไรต่อ |
|---|---|---|
| `✓ PASS` | ครบวงจร: marker ถึงจริง เก็บลง DB จริง และไม่มี violation จากระบบจริง | เสร็จ |
| `storage=unavailable` | ยังไม่ได้ทำข้อ 1 | รัน SQL ในข้อ 1 |
| `503` | ยังไม่ได้ทำข้อ 2 (หรือ service ยัง restart ไม่เสร็จ) | รอสักครู่แล้วลองใหม่ / ตรวจค่า env |
| `401` | token ที่ส่งไปไม่ตรงกับบน Render | ตรวจว่าคัดลอกค่าครบ ไม่มีช่องว่างหัวท้าย |
| `ไม่เจอ marker` | report ยิงถึงและได้ 204 แต่ไม่ถูกเก็บ | ดู Render log ของ `smartport-backend` หา `[csp-report] persist failed` |
| `พบ violation จากระบบจริง` | มีของจริงค้างอยู่ | **ห้าม enforce** — ไล่แก้ตาม directive/host ที่รายงาน |

## หมายเหตุสำหรับการตัดสินใจ enforce

ตัวนับนี้เป็น **หลักฐานเสริม** ไม่ใช่ตัวแทนของ Render log สำหรับรอบแรก เพราะข้อมูลเริ่มนับ
ตั้งแต่วันที่ทำข้อ 1 เท่านั้น — เกณฑ์ "0 violation ใน 7 วัน" จะใช้ตัวนับตัดสินได้เต็มตัวก็ต่อเมื่อ
ตัวนับทำงานมาครบ 7 วันแล้ว เกณฑ์เต็มอยู่ที่ `docs/frontend-security-headers.md`
§CSP monitoring ก่อน enforce
````

- [ ] **Step 4: อัปเดต `docs/frontend-security-headers.md`**

ใน §การทดสอบ เพิ่มรายการของ `scripts/check-csp-violations.mjs` (รูปแบบเดียวกับรายการของ `csp-report-selftest.mjs`) และใน §CSP monitoring เพิ่มว่าเมื่อ counter ใช้งานได้แล้ว ขั้นตอนวันตัดสินใจเหลือสองคำสั่ง — **พร้อมระบุชัดว่าตัวนับเริ่มจากศูนย์ ณ วันที่รัน DDL ย้อนหลังไม่ได้ จึงเป็นหลักฐานเสริมสำหรับรอบ 24 ส.ค. ไม่ใช่ตัวแทนของ Render log**

- [ ] **Step 5: รัน gate ทั้งชุดก่อนปิดงาน**

```bash
node scripts/validate-schema-parity.mjs
node --test scripts/tests/*.test.mjs
bash backend/tests/run.sh
```
Expected: exit 0 ทั้งสามคำสั่ง

- [ ] **Step 6: Commit**

```bash
git add render.yaml docs/runbooks/csp-counter-activation.md docs/frontend-security-headers.md
git commit -m "docs: runbook เปิดใช้ CSP counter บน production + env CSP_SUMMARY_TOKEN"
```

---

## หลังจบทุก task

1. เปิด PR อ้าง issue #113 สรุปว่า **โค้ดขึ้น production ได้ทันทีโดยยังไม่ต้องรัน DDL** (ระบบทำงานเหมือนเดิม) และแนบ runbook
2. แจ้งผู้ใช้ 2 งานที่ต้องทำเอง: รัน SQL บน prod TiDB · ตั้ง env บน Render dashboard
3. หลังผู้ใช้ทำครบ ให้รันคำสั่งยืนยันในข้อ 3 ของ runbook แล้วบันทึกผลลง `docs/frontend-security-headers.md`
