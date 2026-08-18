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
