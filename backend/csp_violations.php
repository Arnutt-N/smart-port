<?php

declare(strict_types=1);

/**
 * ตัวนับ CSP violation รายวัน (issue #113)
 *
 * ทำไมถึง aggregate ไม่ใช่ append: POST /api/csp-report เป็น public endpoint
 * การเก็บ 1 แถวต่อ event เปิดช่องให้ใครก็ได้เขียนแถวเข้า DB production ไม่จำกัด และ
 * rate limit 60/นาที เป็นแค่ defence-in-depth — publicClientIp() อ่าน last hop ของ XFF
 * (hop ที่ proxy append จึงปลอมยากขึ้น) แต่ endpoint ก็ยังเปิดให้ใครก็ยิงได้จากหลายแหล่ง
 * เพดานการเติบโตจึงต้องอยู่ในตัว schema เอง (CSP_MAX_KEYS_PER_DAY)
 *
 * Invariant จริงของจำนวนแถวต่อวัน: ≤ CSP_MAX_KEYS_PER_DAY + 1 — แถวส่วนเกินหนึ่งแถวคือ
 * overflow row เดียว (CSP_OVERFLOW_DIRECTIVE, CSP_OVERFLOW_HOST) ที่ทุก directive/host
 * ที่มาทีหลังเพดานถูกยุบรวมเข้าไป "ยุบเข้าแถวรวมเดียวข้ามทุก directive" เป็นเงื่อนไขบังคับ:
 * ถ้า overflow row แยกตาม directive (เช่น (directive, '__overflow__')) เพดานจะเป็นแค่
 * per-directive ไม่ใช่ global — attacker ที่ยิงด้วย directive สุ่มไม่ซ้ำกันทุกครั้งจะทำให้
 * ตารางโตไม่มีเพดานจริง (ทั้งที่ cspKeyCountToday() นับข้ามทุก directive) — เคยเป็นบั๊กนี้มาก่อน
 * (issue #113 code review C1) มีเทส it_caps_total_rows_even_when_new_violations_use_distinct_directives
 * จับ regression นี้ไว้
 *
 * ทุกฟังก์ชันในไฟล์นี้ห้าม throw ออกไปถึง handler — สัญญาของ endpoint คือตอบ 204 เสมอ
 */

const CSP_MAX_KEYS_PER_DAY = 200;
const CSP_OVERFLOW_DIRECTIVE = '__overflow__';
const CSP_OVERFLOW_HOST = '__overflow__';
const CSP_RETENTION_DAYS = 120;
const CSP_SELFTEST_LIKE = 'csp-selftest-%.invalid';

/**
 * ค่าที่ใช้แทน directive/host จาก report ที่ "ดันตรงกับค่าสงวน" ของแถว overflow
 *
 * Issue #113 code review M2: parse_url('https://__overflow__/', PHP_URL_HOST) คืน
 * '__overflow__' ได้จริง (underscore ผ่านตัว parser) — คนนอกจึง POST report ครั้งเดียวทำให้
 * overflow_hits > 0 ค้างทั้งหน้าต่างได้ ผลลัพธ์คือ gate แดงตลอด (fail-closed จึงไม่ใช่
 * false-clean) แต่ runbook จะวินิจฉัยผิดว่า "ชนเพดานจำนวนแถวต่อวัน" ทั้งที่ไม่เคยชน และคนนอก
 * ยับยั้งการ promote CSP ได้ฟรีด้วย request เดียว
 *
 * แถว (CSP_OVERFLOW_DIRECTIVE, CSP_OVERFLOW_HOST) จึงต้องมาจาก cspFoldIntoOverflow() เท่านั้น
 * ค่าจาก report ที่ชนค่าสงวนถูกเปลี่ยนเป็นค่านี้แทน — ไม่ทิ้ง (report แปลก ๆ ก็ยังเป็นข้อมูลที่
 * คนต้องเห็น) แต่แยกออกได้ชัดว่ามาจาก report ไม่ใช่จากตัวนับ และไม่ตรงกับ CSP_SELFTEST_LIKE ด้วย
 */
const CSP_RESERVED_FROM_REPORT = 'reserved-value-from-report';

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
    // mb_strcut() (ไม่ใช่ substr()) — substr() ตัดกลาง multi-byte UTF-8 sequence ได้ ทำให้
    // ไบต์สุดท้ายเป็น sequence ที่ไม่สมบูรณ์ แล้ว MySQL strict mode โยน error 1366 ทุกครั้งที่
    // directive/host ไม่ใช่ ASCII ล้วน (สาด "persist failed" ลง log ไม่จบบน endpoint สาธารณะ)
    $directive = mb_strcut($directive, 0, 64);
    $blockedHost = mb_strcut($blockedHost, 0, 128);
    // Issue #113 code review M2: ค่าจาก report ห้ามกลายเป็นค่าสงวนของแถว overflow
    // (ดูเหตุผลเต็มที่คอมเมนต์ของ CSP_RESERVED_FROM_REPORT) — เปลี่ยนเป็นค่าที่แยกออกได้ชัดแทน
    // แล้วปล่อยให้ถูกนับเป็น violation ปกติ ผลคือ overflow_hits สะท้อน "ชนเพดานจริง" อย่างเดียว
    if ($directive === CSP_OVERFLOW_DIRECTIVE) {
        $directive = CSP_RESERVED_FROM_REPORT;
    }
    if ($blockedHost === CSP_OVERFLOW_HOST) {
        $blockedHost = CSP_RESERVED_FROM_REPORT;
    }

    try {
        if (!cspTableReady($pdo)) {
            return 'skipped';
        }
        $isNewKey = cspUpsertHit($pdo, $directive, $blockedHost);
        if (!$isNewKey) {
            return 'recorded';
        }
        // เพิ่งสร้าง key ใหม่เท่านั้นที่ทำให้ตารางโต จึงเช็คเพดานเฉพาะตอนนี้
        // cspKeyCountToday() นับข้ามทุก directive (global cap) — cspFoldIntoOverflow() ต้อง
        // ยุบเข้าแถวรวมเดียวกันข้ามทุก directive ด้วยเช่นกัน ไม่งั้นเพดานนี้ไม่มีความหมายจริง
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

/**
 * ลบ key ที่เพิ่งสร้างแล้วโยน 1 hit เข้าแถวรวม "เดียวข้ามทุก directive" แทน
 *
 * ต้องยุบเข้า (CSP_OVERFLOW_DIRECTIVE, CSP_OVERFLOW_HOST) แถวเดียวตายตัว ไม่ใช่
 * (ตัว $directive เอง, CSP_OVERFLOW_HOST) — เพราะ cspKeyCountToday() นับ key ข้ามทุก
 * directive (global cap) ถ้า overflow row แยกตาม directive แต่ละ directive ที่ไม่ซ้ำกัน
 * จะได้แถวรวมของตัวเอง ทำให้ตารางโตได้ไม่มีเพดานจริง (บั๊กเดิมที่แก้ในรอบนี้ — C1)
 */
function cspFoldIntoOverflow(PDO $pdo, string $directive, string $blockedHost): void
{
    $pdo->prepare('DELETE FROM csp_violation_daily WHERE day = CURDATE() AND directive = ? AND blocked_host = ?')
        ->execute([$directive, $blockedHost]);
    $pdo->prepare(
        'INSERT INTO csp_violation_daily (day, directive, blocked_host, hits)
         VALUES (CURDATE(), ?, ?, 1)
         ON DUPLICATE KEY UPDATE hits = hits + 1'
    )->execute([CSP_OVERFLOW_DIRECTIVE, CSP_OVERFLOW_HOST]);
}

/** ลบข้อมูลเก่ากว่า CSP_RETENTION_DAYS — ทำเฉพาะตอนสร้าง key ใหม่ ไม่ใช่ทุก request */
function cspPrune(PDO $pdo): void
{
    $stmt = $pdo->prepare(
        'DELETE FROM csp_violation_daily WHERE day < DATE_SUB(CURDATE(), INTERVAL ? DAY) LIMIT 100'
    );
    $stmt->execute([CSP_RETENTION_DAYS]);
}

/**
 * สรุปตัวนับในหน้าต่าง N วันล่าสุด (รวมวันนี้)
 *
 * แยก 3 กอง: violation จริง / marker ของ self-test (ของทีม ไม่ใช่ของจริง) / overflow
 * ที่ต้องแยกเพราะแต่ละกองมีความหมายต่อการตัดสินใจ enforce คนละแบบ:
 *   violations > 0  → ยังมีของจริงค้าง ห้าม enforce
 *   selftest        → หลักฐานว่า pipeline ยังส่งถึงจริง (ไม่มี = สรุปไม่ได้)
 *   overflow > 0    → ข้อมูลไม่ครบเพราะชนเพดาน ต้องดู Render log ประกอบ
 *
 * แถว overflow (Task 2, code review C1) ถูกยุบเข้าแถวเดียวตายตัวที่
 * (CSP_OVERFLOW_DIRECTIVE, CSP_OVERFLOW_HOST) เสมอคู่กัน — cspFoldIntoOverflow() ไม่เคย
 * เขียน CSP_OVERFLOW_DIRECTIVE โดยไม่มี CSP_OVERFLOW_HOST คู่กัน กรองด้วย
 * blocked_host <> CSP_OVERFLOW_HOST คอลัมน์เดียวจึงพอกันแถว __overflow__ ทั้งแถวออกจาก
 * violations.top ได้ครบ (ไม่ให้ '__overflow__' โผล่เป็น "directive จริง" ปนกับของจริงที่
 * ผู้บริโภค — สคริปต์ gate — เอาไปตัดสินใจ enforce)
 *
 * หมายเหตุ (code review M6): violations.total "ไม่เท่า" ผลรวมของ violations.top เพราะ
 * top ถูกตัดที่ LIMIT 50 (selftest.markers ก็ตัดที่ LIMIT 20 เช่นกัน) — total มาจาก
 * SUM(hits) ของทั้งหน้าต่างเสมอ ไม่ใช่ผลรวมของแถวที่ถูกส่งกลับใน top
 *
 * counting_since (code review I3) = วันแรกที่ตัวนับมีข้อมูลจริง — ผู้บริโภคต้องใช้เทียบกับ
 * since เองเพื่อรู้ว่าหน้าต่างที่ขอ "ครอบครบ" หรือไม่ (null = ยังไม่มีข้อมูลสักแถว)
 *
 * @return array{window_days:int, since:string, counting_since:?string, storage:string, violations:array, selftest:array, overflow_hits:int}
 */
function cspSummary(?PDO $pdo, int $days): array
{
    $summary = [
        'window_days' => $days,
        'since' => date('Y-m-d', time() - ($days - 1) * 86400),
        'counting_since' => null,
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
        // Issue #113 code review M5: "since" คำนวณด้วย MySQL DATE_SUB(CURDATE(), ...)
        // แบบเดียวกับ cspPrune() — ไม่ใช่ PHP date() เพราะแถวถูกเขียนด้วย MySQL CURDATE()
        // และ repo ไม่ได้ตั้ง timezone ให้ตรงกันระหว่าง PHP กับ MySQL ที่ไหนเลย ถ้าคำนวณคนละ
        // ทางขอบหน้าต่างเลื่อนได้ 1 วัน (ค่าที่คืนใน JSON ต้องมาจาก DB ตัวเดียวกับที่ query
        // ใช้จริง ไม่ใช่แค่คำนวณคู่ขนานแล้วหวังว่าตรงกัน)
        $sinceStmt = $pdo->prepare('SELECT DATE_SUB(CURDATE(), INTERVAL ? DAY)');
        $sinceStmt->execute([$days - 1]);
        $since = (string) $sinceStmt->fetchColumn();

        $realWhere = 'day >= ? AND blocked_host <> ? AND blocked_host NOT LIKE ?';
        $realArgs = [$since, CSP_OVERFLOW_HOST, CSP_SELFTEST_LIKE];

        $total = $pdo->prepare("SELECT COALESCE(SUM(hits), 0) FROM csp_violation_daily WHERE {$realWhere}");
        $total->execute($realArgs);
        $totalHits = (int) $total->fetchColumn();

        $top = $pdo->prepare(
            "SELECT directive, blocked_host, SUM(hits) AS hits, MAX(last_seen) AS last_seen
             FROM csp_violation_daily WHERE {$realWhere}
             GROUP BY directive, blocked_host ORDER BY hits DESC LIMIT 50"
        );
        $top->execute($realArgs);
        $topRows = $top->fetchAll();

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
        $overflowHits = (int) $overflow->fetchColumn();

        // Issue #113 code review I3: "ตัวนับเริ่มนับตั้งแต่เมื่อไร" ต้องอยู่ในคำตอบ ไม่ใช่ฝากไว้กับ
        // ความจำของคน — หลังรัน DDL ตารางว่างเปล่าแต่ storage กลายเป็น 'ready' ทันที ถ้าถาม
        // days=7 ในวันที่ 2 หลังสร้างตาราง จะได้ ready + 0 violation = "สะอาด" ทั้งที่ 5 ใน 7 วัน
        // นั้นไม่มีข้อมูลเลย (false-clean ตรงตัว) ผู้บริโภค (สคริปต์ gate) เทียบ counting_since
        // กับ since แล้ว fail เองเมื่อหน้าต่างครอบไม่ครบ — null (ยังไม่มีข้อมูลสักแถว) ก็สรุปไม่ได้
        //
        // MIN(day) คือ "วันแรกที่มีแถว" ไม่ใช่ "วันที่รัน DDL" ตรง ๆ ทิศทางของความคลาดเคลื่อน
        // ปลอดภัย: ถ้าตารางมีมานานแต่เพิ่งมีแถวแรกวันนี้ ค่านี้จะดู "ใหม่กว่า" ความจริง → gate fail
        // (fail-closed) ไม่ใช่ปล่อยผ่าน · ค่านี้ถูกตัดตาม CSP_RETENTION_DAYS (120) ซึ่งกว้างกว่า
        // หน้าต่างสูงสุดที่ endpoint รับ (90 วัน) จึงไม่ทำให้ gate fail จากการ prune
        //
        // ใช้ query() ไม่ใช่ prepare() (ไม่มี parameter) — ลำดับ prepare() ที่
        // CspSummaryTest::it_does_not_report_ready_when_a_query_fails_partway_through อ้างถึง
        // จึงไม่เปลี่ยน และคำสั่งนี้ยังอยู่ "ก่อน" การ assign storage='ready' ตามรูปแบบเดิม
        $countingSinceRaw = $pdo->query('SELECT MIN(day) FROM csp_violation_daily')->fetchColumn();
        $countingSince = ($countingSinceRaw === false || $countingSinceRaw === null)
            ? null
            : (string) $countingSinceRaw;

        // Issue #113 code review I2: ประกอบผลลัพธ์ทั้งหมดไว้ในตัวแปรท้องถิ่นก่อน (ข้างบน) แล้ว
        // ค่อย assign เข้า $summary "ทีเดียวตอนจบ" ที่นี่ — ของเดิมตั้ง storage='ready' ก่อน
        // ดึงผลลัพธ์จริง ถ้า query ถัดไปโยน exception กลางคัน catch ด้านล่างจะคืน $summary ที่
        // storage='ready' ติดไปแล้วแต่ violations ยังเป็นค่า default (0 violation) — ผู้บริโภค
        // (สคริปต์ gate) จะอ่านว่า "พร้อมและสะอาด" ทั้งที่จริงคือ "ไม่รู้" ซึ่งเป็น failure mode
        // ที่แพงที่สุด (ดู CspSummaryTest::it_does_not_report_ready_when_a_query_fails_partway_through)
        // storage จะเป็น 'ready' ได้ก็ต่อเมื่อทุก query ข้างบนสำเร็จครบเท่านั้น
        $summary['since'] = $since;
        $summary['counting_since'] = $countingSince;
        $summary['storage'] = 'ready';
        $summary['violations'] = [
            'total' => $totalHits,
            'top' => array_map(static fn (array $r): array => [
                'directive' => $r['directive'],
                'blocked_host' => $r['blocked_host'],
                'hits' => (int) $r['hits'],
                'last_seen' => $r['last_seen'],
            ], $topRows),
        ];
        $summary['selftest'] = [
            'total' => array_sum(array_map(static fn (array $r): int => (int) $r['hits'], $markerRows)),
            'markers' => array_map(static fn (array $r): array => [
                'blocked_host' => $r['blocked_host'],
                'hits' => (int) $r['hits'],
                'last_seen' => $r['last_seen'],
            ], $markerRows),
        ];
        $summary['overflow_hits'] = $overflowHits;
    } catch (Throwable $e) {
        error_log('[csp-report] summary failed: ' . $e->getMessage());
        return $summary;
    }
    return $summary;
}
