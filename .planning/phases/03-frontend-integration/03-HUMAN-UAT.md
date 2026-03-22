---
status: partial
phase: 03-frontend-integration
source: [03-VERIFICATION.md]
started: 2026-03-22
updated: 2026-03-22
---

## Current Test

[awaiting human testing]

## Tests

### 1. Overview dashboard data accuracy
expected: Navigate to /candidates/overview — 2 stat cards (ประเภททั่วไป, ประเภทวิชาการ) and 3 stat cards (ครบกำหนด, รอดำเนินการ, ตรวจสอบข้อมูล) appear, followed by a top-5 nearest-deadline table populated from live API data
result: [pending]

### 2. Sub-tab watcher behavior
expected: Navigate to /candidates/general, click between ชำนาญงาน and อาวุโส pills — table re-fetches from the correct API endpoint (/candidates/O2 or /candidates/O3) and resets pagination to page 1
result: [pending]

### 3. Search debounce timing
expected: Type in the search box on any sub-tab page — API call fires after 300ms delay, not on every keystroke
result: [pending]

### 4. Placeholder page rendering
expected: Navigate to /candidates/support and /candidates/management — both show an EmptyState component with Construction icon and Thai text 'อยู่ระหว่างพัฒนา'
result: [pending]

### 5. Probation status label confirmation
expected: HR staff confirm the label 'กำลังดำเนินการ' is acceptable as equivalent to 'พร้อมดำเนินการ' for in-progress enrollments (research document chose this to match backend IN_PROGRESS key)
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
