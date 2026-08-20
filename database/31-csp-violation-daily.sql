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
