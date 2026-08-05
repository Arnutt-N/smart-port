-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init
SET NAMES utf8mb4;

-- ============================================================================
-- 27-superadmin-permission-overrides.sql
-- - Promote bootstrap admin → superadmin (once)
-- - Table role_permission_overrides: runtime overrides on top of authz.php defaults
-- ============================================================================

-- Promote the seeded bootstrap account to superadmin (idempotent for username=admin)
UPDATE users
SET role = 'superadmin'
WHERE username = 'admin' AND role = 'admin';

CREATE TABLE IF NOT EXISTS role_permission_overrides (
    override_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    role VARCHAR(20) NOT NULL,
    action VARCHAR(20) NOT NULL,
    resource VARCHAR(64) NOT NULL,
    allowed TINYINT(1) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_role_action_resource (role, action, resource),
    KEY idx_rpo_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
