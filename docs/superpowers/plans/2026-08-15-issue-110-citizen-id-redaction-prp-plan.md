# PRP Plan — Issue #110: Prevent citizen_id disclosure from legacy /civil-servants

> Branch: `issue-110-citizen-id-redaction` · Parent audit: #109 · Severity: High (authenticated PII disclosure)

## Context

`GET /civil-servants` (backend/api.php, `case 'civil-servants'`) authorizes `read:personnel`
(granted to operator + viewer) but SELECTs and returns `p.citizen_id` verbatim.
CONTEXT.md contract: operator/viewer may **search** by citizen ID but must never **receive**
it in list/detail/typeahead JSON. Canonical redaction already exists:
`redactPersonnelCitizenIdForRole()` + `personnelRoleSeesCitizenId()` in `backend/routes/personnel.php`.

## Audit of other leak surfaces (issue plan step 4)

- Grep across backend for `citizen_id` in response-building code:
  - `api.php:342` — the only legacy SELECT returning citizen_id. **Fix target.**
  - `routes/personnel.php` — typeahead uses citizen_id in WHERE only (no echo); master list/detail already redacted.
  - `QualificationEngine.php`, `ImportService.php`, `sync/*` — internal computation/ingest, not JSON responses.
- Legacy route has **no single-record GET variant** (`$path[1]` is ignored for GET) — list only.

## Changes

### 1. `backend/routes/personnel.php` — new extracted handler

```php
function legacyCivilServantsList(PDO $pdo, string $role, string $search, int $limit, int $offset): array
```

- Moves the legacy list query out of api.php (testable, matches repo handler pattern).
- Adds `OR p.citizen_id LIKE ?` to the search WHERE (search-by-citizen-ID stays allowed;
  parity with canonical typeahead) — filter only, never echoed.
- Applies `redactPersonnelCitizenIdForRole($row, $role)` to every row before returning.
- Returns the same payload shape: `{success, data, pagination}`.

### 2. `backend/api.php` — `case 'civil-servants'` GET

- `requirePermission('read', 'personnel')` unchanged.
- `include_once __DIR__ . '/routes/personnel.php'` (functions; include_once-safe vs case 'personnel').
- `$role = (string) (getAuthenticatedUser()['role'] ?? 'viewer')` — fail-closed default.
- Delegates to `legacyCivilServantsList()` and echoes JSON.
- DELETE branch untouched.

## Tests

### Integration — new `backend/tests/Integration/LegacyCivilServantsListTest.php`

Seed one active personnel row with known citizen_id; per role (admin, superadmin, operator, viewer):

1. List returns rows; `citizen_id` key present for admin/superadmin, **absent** for operator/viewer.
2. Search by that citizen ID finds the row for all roles, still without the key for operator/viewer.
3. Pagination keys unchanged.

Skips via `testPdo()` when MySQL unavailable (repo convention).

### Regression

- Existing `PersonnelAuthzHttpTest` (helper contract) must stay green.
- Local CI gate: `scripts/ci-local.ps1` (frontend vitest+build, backend PHPUnit, skip docker builds if db-only).

## Acceptance criteria (from issue)

- [ ] Operator/viewer responses never contain `citizen_id` key or value
- [ ] Admin/superadmin visibility explicitly tested and unchanged
- [ ] Search by citizen ID allowed without echoing PII
- [ ] Backend tests + local CI pass
