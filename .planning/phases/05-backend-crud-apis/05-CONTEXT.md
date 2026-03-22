# Phase 5: Backend CRUD APIs - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

REST CRUD endpoints for 3 features: supportive experience, diverse experience, and position equivalence. Server-side date arithmetic and business logic. No frontend work — that's Phase 6.

</domain>

<decisions>
## Implementation Decisions

### API Route Naming & Filtering
- **D-01:** Routes: `/supportive`, `/diverse`, `/equivalence` — registered as case blocks in api.php
- **D-02:** All list endpoints accept `?personnel_id=X` as optional filter. Without it, return all records (paginated). This matches the civil-servants endpoint pattern.
- **D-03:** Pagination follows existing format: `?limit=20&offset=0` → response includes `{ total, limit, offset, has_more }`

### Supportive Experience — Ratio Lookup
- **D-04:** Client sends `primary_series_name` in POST/PUT body. API looks up `ratio_percent` from `supportive_job_series` table using both `primary_series_name` and `job_series_name` (the supportive series). Default to 100 if no mapping found.
- **D-05:** `total_days = DATEDIFF(end_date, start_date) + 1` (inclusive Thai HR counting)
- **D-06:** `effective_days = total_days × ratio_percent / 100` — computed server-side, never accepted from client
- **D-07:** `net_years = floor(effective_days / 365)`, `net_months = floor((effective_days % 365) / 30)`, `net_day_remainder = effective_days % 365 % 30`. `net_end_date = start_date + effective_days`. All computed server-side.

### Diverse Experience — diff_count & qualified_date
- **D-08:** `diff_count` is MySQL GENERATED STORED — never include in INSERT/UPDATE. Only write the 4 boolean flags.
- **D-09:** `qualified_date` = `to_start_date` when diff_count >= 3, NULL otherwise. Computed in PHP after calculating diff_count from the 4 booleans.
- **D-10:** `from_total_days` and `to_total_days` computed server-side with DATEDIFF+1, same as supportive.

### Position Equivalence — Approval Status
- **D-11:** Status transitions: PENDING → APPROVED, PENDING → REJECTED. No reverse. No APPROVED ↔ REJECTED.
- **D-12:** On APPROVED: require `approved_start_date`, `approved_end_date` in request body. Compute `approved_total_days = DATEDIFF(approved_end_date, approved_start_date) + 1`. Record `approved_by` from JWT user_id.
- **D-13:** On REJECTED: NULL out `approved_start_date`, `approved_end_date`, `approved_total_days`.
- **D-14:** POST creates with `approval_status = 'PENDING'` always — client cannot set status on creation.

### Error Messages
- **D-15:** Thai error messages for validation errors (กรุณาระบุ..., ไม่พบรายการ..., ไม่สามารถเปลี่ยนสถานะ...)
- **D-16:** Success responses: `{ "success": true, "data": ... }` for GET, `{ "success": true, "<entity>_id": N }` for POST

### Claude's Discretion
- Exact column selection in SELECT queries (include all relevant columns)
- JOIN strategy for personnel name in GET detail/list
- Whether to include Thai-formatted dates in GET responses (recommended: yes, following probation.php pattern)
- DELETE implementation — simple hard delete, no soft delete

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend architecture (PRIMARY template)
- `backend/routes/probation.php` — CRUD handler pattern: handleX(), sub-functions, validation, pagination, allowed-fields update
- `backend/api.php` — Gateway switch-case routing, CORS, auth flow, response format
- `backend/helpers.php` — Shared utilities (formatThaiDate, getLevelName)

### Database schema
- `database/04-career-path.sql` — Table definitions for supportive_experience, diverse_experience, position_equivalence, supportive_job_series
- `database/08-career-path-v11.sql` — v1.1 migration: ratio_percent column, GENERATED diff_count, seed data

### Phase research
- `.planning/phases/05-backend-crud-apis/05-RESEARCH.md` — Architecture patterns, code examples, pitfalls, anti-patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `helpers.php::formatThaiDate()` — Buddhist Era date formatting, use in GET responses
- `helpers.php::getLevelName()` — Level code to Thai name mapping
- Probation validation pattern — required field loop, allowed-fields whitelist

### Established Patterns
- Route file: `handleX(PDO $pdo, string $method, array $path): void` with switch on $method
- Gateway: `include __DIR__ . '/routes/X.php'; handleX($pdo, $method, $path);`
- Pagination: `{ success, data, pagination: { total, limit, offset, has_more } }`
- Thai date appending: loop through rows, add `*_thai` suffixed fields

### Integration Points
- `api.php` switch statement — add 3 new case blocks
- JWT auth — already handled by gateway, all new routes auto-protected
- `supportive_job_series` table — ratio lookup during supportive experience create/update

</code_context>

<deferred>
## Deferred Ideas

- net_years/net_months/net_day_remainder computation needs HR validation against Excel — flag for post-v1.1
- RBAC for approval (who can approve equivalence) — deferred to v2
- DELETE cascading recalculation — QualificationEngine (Phase 7) reads live data, no cascade needed

</deferred>

---

*Phase: 05-backend-crud-apis*
*Context gathered: 2026-03-22*
