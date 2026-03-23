---
status: passed
phase: 05-backend-crud-apis
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md]
started: 2026-03-23T10:00:00Z
updated: 2026-03-23T11:00:00Z
---

## Tests

### 1. Cold Start Smoke Test
expected: Docker services start, GET /api/dashboard returns success
result: pass — `{"success":true,"total_civil_servants":1,...}`

### 2. GET /supportive — List Records
expected: Returns `{"success":true,"data":[],"pagination":{"total":0,...}}`
result: pass — empty list with correct pagination format

### 3. POST /supportive — Create Record
expected: Returns 201 with supportive_id, server computes total_days and effective_days
result: pass — `{"success":true,"supportive_id":1}`, total_days=182 (DATEDIFF+1 inclusive), effective_days=182.00, ratio_percent=100.00, net_years=0, net_months=6, net_day_remainder=2. Thai dates formatted correctly.

### 4. GET /diverse — List Records
expected: Returns empty list with pagination
result: pass — correct format

### 5. POST /diverse — Create with 4 Boolean Flags
expected: Creates record, diff_count auto-computed by MySQL GENERATED, qualified_date set when >=3
result: pass — diff_count=3 (GENERATED STORED works on fresh DB), qualified_date="2024-03-01" (set because 3 of 4 booleans are 1)

### 6. GET /equivalence — List Records
expected: Returns empty list with pagination
result: pass — correct format. Note: initial bug fixed — `u.first_name` changed to `u.username` (users table has no first_name column)

### 7. POST /equivalence — Create with Forced PENDING
expected: Creates with approval_status=PENDING regardless of client input
result: pass — approval_status="PENDING"

### 8. PUT /equivalence — Approve with Date Computation
expected: Approved record has approved_total_days=366, approved_by from JWT
result: pass — approved_total_days=366 (2024 leap year, DATEDIFF+1), approved_by=1. Note: requires user_id=1 in `users` table for FK constraint.

### 9. PUT /equivalence — Reject Cannot Reverse to PENDING
expected: REJECTED → PENDING transition blocked with 400 error
result: pass — returns Thai error "ไม่สามารถเปลี่ยนสถานะจาก REJECTED เป็น PENDING"

### 10. API Gateway — All 3 Routes Registered
expected: /supportive, /diverse, /equivalence return 200; /nonexistent returns 404
result: pass — all 3 routes return 200, nonexistent returns 404

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

### Fixed during UAT
1. **equivalence.php query bug** — `CONCAT(u.first_name, ' ', u.last_name)` failed because `users` table only has `username`. Fixed to `u.username AS approved_by_name`. Committed: `96d2654`
2. **users table FK** — `approved_by` FK requires user_id=1 to exist in `users` table. Inserted `admin` user during testing. Future: seed script should insert this.
3. **diff_count GENERATED column** — only works after `docker-compose down -v` fresh rebuild. Without `-v`, diff_count stays as plain INT DEFAULT 0 (from original schema). Documented in Phase 4 summary.
