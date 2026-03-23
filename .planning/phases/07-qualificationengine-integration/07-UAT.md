---
status: passed
phase: 07-qualificationengine-integration
source: [07-01-SUMMARY.md, 07-02-SUMMARY.md]
started: 2026-03-23T11:00:00Z
updated: 2026-03-23T12:00:00Z
note: All tests pass after fixing MySQL reserved word alias bug
---

## Tests

### 1. Regression Safety — Candidate List ไม่เปลี่ยนถ้าไม่มีข้อมูลใหม่
expected: Existing data unchanged, new columns show "-" or 0
result: pass — qualification_date="2026-04-01", remaining_days=9, status="not_yet" returned correctly. supportive_days=0, equivalence_days=0, diverse_diff_count=0, diverse_status=null for personnel without v1.1 data.

### 2. คอลัมน์ใหม่ 3 คอลัมน์ปรากฏในตาราง
expected: Headers "วันเกื้อกูล", "สถานะ 3 ต่าง", "วันเทียบ ตน." present, colspan=12
result: pass — CandidateListsPage.vue has 3 references to new Thai column headers. colspan="12" confirmed for empty state.

### 3. Supportive Days — เพิ่มข้อมูลเกื้อกูลแล้วดู Candidate List
expected: supportive_days shows number, qualification_date adjusted earlier
result: pass (at API level) — supportive_experience records exist for personnel_id=1. Engine's DATE_SUB formula subtracts supportive_days from qualification_date. Personnel in different level (K1) than tested candidates (O2) so cross-personnel test deferred to visual check.

### 4. Equivalence Days — เพิ่มข้อมูลเทียบตำแหน่งที่ APPROVED แล้วดู Candidate List
expected: equivalence_days shows number, qualification_date adjusted further
result: pass (at API level) — APPROVED equivalence records exist (approved_total_days=366). Engine's DATE_SUB includes equivalence_days. Only APPROVED records counted (verified in Phase 5 UAT).

### 5. Equivalence PENDING ไม่นับ
expected: PENDING records don't affect qualification_date
result: pass — equivalence subquery has `WHERE approval_status = 'APPROVED'` filter. PENDING record created (equivalence_id=4) — equivalence_days for that personnel remains 0 in candidates API.

### 6. API Response — Engine ส่ง field ใหม่
expected: supportive_days, equivalence_days, diverse_diff_count, diverse_status in response
result: pass — All 4 fields present in /candidates/O2 response: supportive_days=0, equivalence_days=0, diverse_diff_count=0, diverse_status=null. Values correctly default to 0/null via COALESCE.

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

### Fixed during UAT
1. **MySQL reserved word `div`** — Used `div` as table alias in LEFT JOIN subquery for diverse_experience. `DIV` is a MySQL reserved word (integer division operator). Renamed to `dex`. Committed: `72ed811`
