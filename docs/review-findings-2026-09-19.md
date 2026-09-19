# Review Findings — 2026-09-19 (codebase-review-fix, whole codebase)

> Evidence safety: no secrets/PII/credentials. No `secrets/` content read or reproduced.
> Sources: frontend subagent JSON (15 findings) + manual read-only verification of backend/auth/router/tests.

## Deduped findings (10)

| ID | Severity | Location | Category | Finding | Fix direction |
|----|----------|----------|----------|---------|---------------|
| F1 | High | `frontend/src/components/PaginationBar.vue:52-53` | prop-types | `limit` required Number but division unguarded (`offset/limit`, `total/limit`) — `limit=0` yields `Infinity`/`NaN` pages | Guard: validate `limit` finite > 0 before dividing |
| F2 | High | `frontend/src/router/index.js:187-188` | router-guards | `fetchPermissionGrants()` fire-and-forget before `requiresAdmin` check — first nav after login uses stale role fallback | Await grants (or block admin routes) before evaluating `requiresAdmin` |
| F3 | High | `frontend/src/components/TableRowActions.vue:6` | a11y | `⋮` menu trigger `p-1` only — smaller than inline `min-h-11 min-w-11` actions, below 44px target | Give menu trigger same min touch dimensions as inline actions |
| F4 | High | `frontend/src/stores/auth.js:54-60` | state-management | `decodeJwtPayload` uses raw `atob` — non-ASCII (Thai) payload segments throw, forcing false logout | Decode with Unicode-safe base64url handling |
| F5 | Medium | `frontend/src/components/PageBreadcrumb.vue:18` | prop-types | `items: { type: Array, default: null }` — nullable default against Array type | Empty-array factory or widen type to allow null |
| F6 | Medium | `frontend/src/composables/useApi.js:97` | error-handling | Non-coded backend errors surface as `error.error \|\| statusText` (English) to Thai users | Map to Thai user-facing messages |
| F7 | Medium | `frontend/src/composables/useResourceCrud.js:23` | error-handling | List adapter maps `result.data` without shape guard | Validate list shape before mapping rows/pagination |
| F8 | Medium | `frontend/src/components/StatCard.vue:2` + `AppSidebar.vue:37` | design-tokens | Residual non-`government`/non-`primary` utilities (`gray`, `blue-600/10`) after token unification | Align to `government`/`primary` tokens |
| F9 | Medium | `frontend/src/components/AppTopbar.vue:4` + `ThaiDatePicker.vue:335` | a11y | Header toggle + calendar day cells below 44px touch target | Enlarge to minimum touch size |
| F10 | Low | `ToastContainer.vue:29` + `LoginPage.vue:102` + `AppSidebar.vue:23` | design-tokens/a11y | Warning toast off-token, login inline gradient, Thai `uppercase` label | Align to semantic tokens; restrict uppercase to English |

## Dropped (verified, not issues)
- `backend/api.php:50` CORS "hardcoded" — actually reads `ALLOWED_ORIGINS` env with safe default; dev localhost gated by `APP_ENV`. No finding.
- `backend/auth.php` JWT — HS256-only enforced (L65), `hash_equals` (L73), refresh hashed opaque (L47). No finding.
- Backend routes/auth/tests/DB parity — subagents aborted (0 iterations); manual spot-check only. NOT claimed as reviewed; follow-up recommended, not a finding.
