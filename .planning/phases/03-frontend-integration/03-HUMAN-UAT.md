---
status: passed
phase: 03-frontend-integration
source: [03-VERIFICATION.md]
started: 2026-03-22
updated: 2026-03-22
---

## Current Test

[all tests completed]

## Tests

### 1. Overview dashboard data accuracy
expected: Navigate to /candidates/overview — stat cards (ประเภททั่วไป, ประเภทวิชาการ, ครบกำหนด, ใกล้ครบกำหนด, เกินกำหนด, ตรวจสอบข้อมูล) appear, followed by a top-5 nearest-deadline table populated from live API data
result: PASSED — user confirmed stat cards and table display correctly with live data. Added "เกินกำหนด" stat card and renamed "รอดำเนินการ" to "ใกล้ครบกำหนด" per HR feedback.

### 2. Sub-tab watcher behavior
expected: Navigate to /candidates/general, click between ชำนาญงาน and อาวุโส pills — table re-fetches from the correct API endpoint (/candidates/O2 or /candidates/O3) and resets pagination to page 1
result: PASSED — user confirmed sub-tab switching works correctly.

### 3. Search debounce timing
expected: Type in the search box on any sub-tab page — API call fires after 300ms delay, not on every keystroke
result: PASSED — initial test showed multiple calls due to Thai IME composition events. Fixed by adding compositionstart/compositionend guards. Code verified: clearTimeout + setTimeout(300ms) + IME composition guard.

### 4. Placeholder page rendering
expected: Navigate to /candidates/support and /candidates/management — both show an EmptyState component with Construction icon and Thai text 'อยู่ระหว่างพัฒนา'
result: PASSED — user confirmed both pages display EmptyState correctly.

### 5. Probation status label confirmation
expected: HR staff confirm probation status labels are appropriate for business context.
result: PASSED — redesigned status system: >45 days=กำลังดำเนินการ, 15-45 days=ใกล้ครบกำหนด, 0-14 days=พร้อมพ้นทดลอง, overdue >30 days=เกินกำหนด. API verified: remaining_days -111→OVERDUE, 10→READY, 101→IN_PROGRESS.

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Issues Fixed During Testing

1. **Dockerfile pdo_pgsql→pdo_mysql**: Backend had PostgreSQL driver instead of MySQL
2. **Query string in path**: `parse_url()` added to strip query string from REQUEST_URI
3. **Case-insensitive auth header**: Vite proxy lowercases headers; PHP lookup made case-insensitive
4. **Double-encoded UTF-8**: Added `SET NAMES utf8mb4` to all SQL init scripts
5. **Fake demo token**: `demoLogin()` changed to call real login API for valid JWT
6. **Thai IME debounce**: Added `compositionstart/compositionend` guards for proper Thai input debouncing
7. **Probation status redesign**: Computed status from remaining_days instead of raw backend status
8. **StatusBadge label**: "รอดำเนินการ" renamed to "ใกล้ครบกำหนด" for candidates

## Gaps
