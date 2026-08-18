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
