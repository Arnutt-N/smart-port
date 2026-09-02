<?php

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../csp_violations.php';

/**
 * Issue #113 code review I3: ความยาวขั้นต่ำของ CSP_SUMMARY_TOKEN
 *
 * ตัวกันสาธารณะ (rate limit 10/นาทีใน api.php) เป็นแค่ defence-in-depth — publicClientIp()
 * (middleware/rate_limit.php) อ่าน last hop ของ XFF ที่ proxy append (มีเทสยืนยันที่
 * PublicRateLimitTest) ตัวกัน brute-force ตัวจริงคือ entropy ของ token เอง 32 ตัวอักษร
 * (สุ่มจาก charset กว้าง) ให้ entropy ที่เดาไม่ไหวจริงในทางปฏิบัติ — token ที่ Task 5 สุ่มให้
 * ยาว 43 ตัวอักษรอยู่แล้ว จึงไม่กระทบ
 */
const CSP_SUMMARY_TOKEN_MIN_LENGTH = 32;

/**
 * GET /api/csp-report/summary?days=7 — สรุปตัวนับ CSP violation (issue #113)
 *
 * ผู้อ่านหลักคือสคริปต์ gate จึงไม่ใช้ JWT (สคริปต์ไม่มีบัญชี) แต่ใช้ shared secret
 * ใน header แทน — และ fail-closed เป็น 503 เมื่อยังไม่ได้ตั้ง env เพื่อไม่ให้ endpoint
 * นี้เปิดสาธารณะโดยอุบัติเหตุ (ข้อมูล directive ที่ถูกละเมิดบอกใบ้คนที่กำลังทดสอบช่องโหว่)
 *
 * Issue #113 code review I1: $dbFactory ถูกเรียก "หลัง" token ผ่านครบทุกด่านแล้วเท่านั้น
 * (default ใช้ tryGetDB() จริง — เทสส่ง factory ปลอมที่คืน null ได้) เดิม call site (api.php)
 * ส่ง tryGetDB() เป็น argument ซึ่งถูก evaluate ก่อนเข้าฟังก์ชันนี้เสมอ ผลคือ:
 *   1) request ที่ไม่มี token เลยก็จุดชนวน DB connect (retry 3 ครั้ง คั่น usleep 200ms ตอน
 *      DB ล่ม = กิน worker ~0.4s ต่อคำขอ) ขัด invariant ที่ rate_limit.php ประกาศไว้เองว่า
 *      public path ไม่ควรแตะ DB เลย
 *   2) buildSslOptions() (config.php) throw RuntimeException ได้ (MYSQL_SSL=true แต่อ่าน
 *      CA ไม่ได้) — exception จะหลุดออกจาก call site ไปถึง set_exception_handler กลายเป็น
 *      500 แทนคำตอบปกติของ handler นี้
 * ย้าย DB factory มาเรียกในนี้เองพร้อม try/catch (Throwable) แก้ทั้งสองปัญหา: ไม่แตะ DB จนกว่า
 * auth จะผ่าน และไม่มีทางโยน exception หลุดออกจากฟังก์ชันนี้ได้อีก
 */
function handleCspSummary(string $method, array $query, ?callable $dbFactory = null): void
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
    // Issue #113 code review I3: token สั้น = เดาไหวในทางปฏิบัติต่อให้ hash_equals() ป้องกัน
    // timing attack ก็ตาม — fail-closed แทนที่จะพึ่งว่า operator ตั้งค่ายาวพอเสมอ ตอบข้อความ
    // เดียวกับ "ยังไม่ตั้งค่า" (ไม่บอกสาเหตุจริงให้ client เพื่อไม่ให้เป็น oracle ว่า token
    // สั้นแค่ไหนถึงจะผ่าน) — เหตุผลจริงอยู่ใน error_log() เท่านั้น
    if (strlen($expected) < CSP_SUMMARY_TOKEN_MIN_LENGTH) {
        error_log(
            '[csp-report] CSP_SUMMARY_TOKEN สั้นกว่า ' . CSP_SUMMARY_TOKEN_MIN_LENGTH
            . ' ตัวอักษร — ปฏิเสธเพื่อ fail-closed'
        );
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

    $dbFactory ??= 'tryGetDB';
    try {
        $pdo = $dbFactory();
    } catch (Throwable $e) {
        error_log('[csp-report] summary DB connect failed: ' . $e->getMessage());
        $pdo = null;
    }

    // Issue #113 code review M2: ตั้งค่าตรงนี้ให้ชัดเจนแทนพึ่ง default ของ SAPI — เทส
    // (CspSummaryAuthTest) ตั้งค่า sentinel ที่ไม่ใช่ 200 ไว้ก่อนเรียก handler ทุกครั้ง
    // เพื่อให้ assertSame(200, ...) พิสูจน์ได้จริงว่าเส้นทางนี้ตั้งค่าเอง ไม่ใช่ค่าที่ค้างมาก่อน
    http_response_code(200);
    try {
        // Issue #113 code review M7: JSON_THROW_ON_ERROR กัน json_encode() คืน false เงียบ ๆ
        // (เช่น malformed UTF-8 หลุดมาปนใน blocked_host) — ตอบ 500 พร้อม log ดีกว่าตอบ 200
        // ด้วย body ว่างที่ผู้บริโภค (สคริปต์ gate) parse ไม่ออกโดยไม่รู้สาเหตุ
        echo json_encode(cspSummary($pdo, $days), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    } catch (JsonException $e) {
        error_log('[csp-report] summary encode failed: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'internal error']);
    }
}
