-- บังคับ client charset เป็น utf8mb4 กัน mojibake ตอน docker init (client default อาจเป็น latin1)
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- 26-e2e-admin-test-seed.sql
-- TEST_SEED only (APPLY_TEST_SEED_MIGRATIONS=1)
--
-- Fresh 09-auth-users seeds admin with must_change_password=1.
-- Local/CI Playwright needs a usable admin without the forced password gate.
-- ============================================================================

UPDATE users
SET must_change_password = 0
WHERE username = 'admin';
