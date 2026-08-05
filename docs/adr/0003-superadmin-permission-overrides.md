# ADR-0003: Superadmin role + DB permission overrides

- Status: Accepted
- Date: 2026-08-04

## Context

Authorization lived only as a hardcoded matrix in `backend/authz.php` (`admin` / `operator` / `viewer`). Self-service account edits were missing, and the topbar “ตั้งค่า” entry pointed at a forced password-change route that redirected voluntary users away.

Operators need to change their own username/password. Operators of the platform also need a **superadmin** who can toggle which roles may perform which actions without a code deploy.

## Decision

1. Add role **`superadmin`** above `admin`. Superadmin always passes `checkPermission` and alone may call `/settings/permissions`.
2. Keep the PHP matrix as **defaults**. Persist optional rows in `role_permission_overrides` `(role, action, resource, allowed)` that override defaults for `admin` / `operator` / `viewer` only.
3. Self-service account: `GET|PUT /auth/me` (username change requires current password + uniqueness + audit) and voluntary password change via `/settings/account` (forced flow remains `/change-password`).
4. Seed: promote bootstrap `admin` username to `superadmin` (migration `27-superadmin-permission-overrides.sql`).

## Consequences

- Empty override table ⇒ behavior matches pre-change defaults (except bootstrap user becomes superadmin).
- Frontend Phase 1 gates menus with `isAdmin` / `isSuperAdmin`; backend remains source of truth for overrides.
- Only superadmin may assign the `superadmin` role in user management.
- Override load is **fail-closed**: if the override store or DB is unreachable, non-superadmin requests get 503 (do not silently fall back to defaults). Failures are not cached so the next request can retry after recovery.
- PUT `/settings/permissions` is transactional; items may upsert `allowed` or `reset: true` (delete override row → default).
- At least one active `superadmin` must remain (demote/deactivate of the last one is rejected).

## Release / deploy

**Hard gate:** Apply migration `27-superadmin-permission-overrides.sql` (CREATE `role_permission_overrides` + promote bootstrap `username=admin`) **before or atomically with** backend deploy. Production often has `RUN_MIGRATIONS=0`; shipping authz code without the table 503s every non-superadmin `requirePermission` call. Fresh `tidb-init` already mounts 27.
