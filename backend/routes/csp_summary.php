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
