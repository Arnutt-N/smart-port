-- ============================================================================
-- 15-api-rate-limit-hits.sql
-- Persistent API rate-limit counters (Render/TiDB — filesystem ไม่ persist)
-- ============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS api_rate_limit_hits (
    hit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rate_key VARCHAR(128) NOT NULL,
    hit_at INT UNSIGNED NOT NULL,
    INDEX idx_rate_key_hit_at (rate_key, hit_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
