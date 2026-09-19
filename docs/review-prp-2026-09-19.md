# PRD — Review Fix Bundle 2026-09-19

## Goal
Fix the 4 High findings (F1–F4) from `docs/review-findings-2026-09-19.md` with tests; Medium/Low documented and deferred.

## Scope (files)
- `frontend/src/components/PaginationBar.vue` (F1)
- `frontend/src/router/index.js` (F2)
- `frontend/src/components/TableRowActions.vue` (F3)
- `frontend/src/stores/auth.js` (F4)
- Tests: `PaginationBar.test.js`, `stores/auth.test.js`, `router/guards.test.js`, `TableRowActions.test.js`

## Non-goals
- No backend/PHP changes. No DB migrations. No DESIGN.md token renames (F8/F10 deferred).
- No secret/config changes. No `secrets/` access.

## Acceptance
- F1: `limit<=0`/NaN renders safe fallback (1 page), no `Infinity`/`NaN` in output.
- F2: admin route nav after login resolves grants before `requiresAdmin` decision (test with deferred grants promise).
- F3: menu trigger meets 44px target (`min-h-11 min-w-11` or equivalent).
- F4: Thai (non-ASCII) JWT payload segment decodes without throwing; `isTokenValid` stays true.
- Targeted vitest files pass, run one file per command (30s tool timeout).

# PRP — Implementation Plan

## Step 1 — F4 `decodeJwtPayload` Unicode-safe (auth.js:54-60)
- WHAT: add Unicode-safe fallback via `TextDecoder` (preferred) or `decodeURIComponent` byte-array pattern; keep existing `atob` ASCII fast-path and base64url normalize. Caller `isTokenValid` keeps its try/catch — the fallback must NOT swallow JSON errors silently (throw through to caller).
- WHY: raw `atob` throws on non-Latin1; Thai names in payload cause false logout.
- TEST: add case with Thai payload segment encoded via `TextEncoder` → base64url (same technique family as the fix, NOT deprecated `unescape`), asserting decode equality + no throw.
- VALIDATE: `npx vitest run src/__tests__/stores/auth.test.js --silent` (single file).

## Step 2 — F1 PaginationBar guard (PaginationBar.vue:50-53, 78-81)
- WHAT: sanitize `limit`/`offset`/`total` to finite numbers; fallback `safeLimit>=1`; guard `currentPage`/`totalPages` against `Infinity`/`NaN`. ALSO use the sanitized limit inside `goToPage` emit (`(page-1) * safeLimit`) — emitting with raw `limit=0` would freeze pagination at offset 0.
- WHY: `limit=0` → `Infinity` pages, blank/looping pagination UI; raw-limit emit would keep offset stuck.
- TEST: mount with `limit=0` / `limit=NaN` — assert rendered text shows page `1` and total pages `1` (via `currentPage === totalPages` → both nav buttons disabled), and no `Infinity`/`NaN` string in `wrapper.text()`. Do NOT assert `totalPages`/`currentPage` computeds directly (not exposed) — assert via DOM: disabled prev+next buttons + `แสดง 1 ถึง …` text.
- VALIDATE: `npx vitest run src/__tests__/components/PaginationBar.test.js --silent`.

## Step 3 — F3 menu trigger touch target (TableRowActions.vue:4-6)
- WHAT: add `min-h-11 min-w-11 inline-flex items-center justify-center` to `⋮` button (match inline `p-1.5 min-w-11 min-h-11`).
- WHY: WCAG 2.5.8 44px; DESIGN.md touch-target rule.
- TEST: assert trigger classes contain `min-h-11` AND `min-w-11` (existing focus-ring test file is the place). Class-presence only (no computed-px assertion) — visual 44px confirmation is optional on prod.
- VALIDATE: `npx vitest run src/__tests__/components/TableRowActions.test.js --silent`.

## Step 4 — F2 await grants before requiresAdmin (router/index.js:185-218)
- WHAT: when authenticated + grants null + non-superadmin + target has `requiresAdmin`/`requiresSuperAdmin`, `await auth.fetchPermissionGrants()` (guarded try/catch, keep silent-fail fallback) before the admin check; keep fire-and-forget prefetch for non-admin routes.
- WHY: first nav post-login otherwise decides on stale role fallback (M3 from prod-verify review).
- TEST: extend `router/guards.test.js` — FIRST refactor the mock so `isAdmin` mirrors the real store logic (grants-loaded → `(grants.delete||[]).length>0`; grants-null → role fallback), NOT the current role-only getter (guards.test.js:9-11). Then: deferred grants promise resolving `delete:[]` for role `admin` → expect redirect `/dashboard`; resolving with delete grant → allow. Without the mock refactor the test cannot observe the fix (fetchPermissionGrants never changes isAdmin in the mock).
- VALIDATE: `npx vitest run src/__tests__/router/guards.test.js --silent`.

## Validation commands (stack-detected)
- Unit (scoped, one file per run): `cd frontend; npx vitest run <file> --silent`
- Full suite: via pre-push hook / CI only (609 tests, exceeds 30s tool timeout)
- No lint/typecheck configured; no build needed (no bundler-affecting change)

## Risks
- F2 changes nav timing: add await ONLY on admin-gated targets to avoid slowing every navigation.
- F4: keep `atob` path for ASCII (perf), Unicode path only as fallback.
