# v1.1 UAT Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute 26 UAT tests across 3 phases (Backend APIs, Frontend Pages, QualificationEngine) and record pass/fail in each phase's UAT.md file.

**Architecture:** Phase 5 tests use Docker + curl (API-level). Phase 6 tests use browser interaction (UI-level). Phase 7 tests combine both API and browser verification. All tests run against `docker-compose up -d` (backend+db on port 8000) and `npm run dev` (frontend on port 5174).

**Tech Stack:** Docker Compose, curl/httpie, browser (localhost:5174), JWT auth token

**Prerequisites:** Docker running, `docker-compose down -v && docker-compose up -d` completed, frontend dev server at localhost:5174

---

### Task 1: Environment Setup & JWT Token Acquisition

**Files:**
- Modify: `.planning/phases/05-backend-crud-apis/05-UAT.md` (test 1 result)

- [ ] **Step 1: Start Docker services fresh**

```bash
cd D:/hrProject/smart-port
docker-compose down -v
docker-compose up -d
```

Wait 30 seconds for MySQL initialization.

- [ ] **Step 2: Acquire JWT token for authenticated requests**

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smartport.gov.th","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "Token: $TOKEN"
[ -z "$TOKEN" ] && echo "FATAL: token acquisition failed" && exit 1
```

Expected: JWT token string (not empty). If empty, Docker/MySQL may not be ready — wait and retry.

- [ ] **Step 3: Verify backend health (requires auth)**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/dashboard | head -c 200
```

Expected: JSON containing `"success":true`

- [ ] **Step 4: Record Phase 5 Test 1 result**

Update `.planning/phases/05-backend-crud-apis/05-UAT.md` test 1:
- If docker started and dashboard returned success: `result: pass`
- If any errors: `result: fail — [describe error]`

- [ ] **Step 5: Commit**

```bash
git add .planning/phases/05-backend-crud-apis/05-UAT.md
git commit -m "test(05): UAT test 1 — cold start smoke test"
```

---

### Task 2: Phase 5 API Tests — Supportive Experience (Tests 2-3)

**Files:**
- Modify: `.planning/phases/05-backend-crud-apis/05-UAT.md` (tests 2-3 results)

- [ ] **Step 1: Test GET /supportive — empty list**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/supportive
```

Expected: `{"success":true,"data":[],"pagination":{"total":0,"limit":20,"offset":0,"has_more":false}}`
Record result for Test 2.

- [ ] **Step 2: Test POST /supportive — create record**

```bash
SUPP_ID=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"personnel_id":1,"job_series_name":"นักวิเคราะห์นโยบายและแผน","start_date":"2024-01-01","end_date":"2024-06-30","primary_series_name":"นักวิชาการยุติธรรม"}' \
  http://localhost:8000/api/supportive | grep -o '"supportive_id":[0-9]*' | cut -d: -f2)
echo "Created supportive_id: $SUPP_ID"
```

Expected: HTTP 201, `{"success":true,"supportive_id":N}` where N is a number.
Record result for Test 3.

- [ ] **Step 3: Verify server-computed fields**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/supportive/$SUPP_ID"
```

Check response: `total_days` should be 182 (DATEDIFF('2024-06-30','2024-01-01') + 1 = 182, inclusive counting), `effective_days` computed from ratio_percent, `ratio_percent` looked up from supportive_job_series table.

- [ ] **Step 4: Update UAT.md with Test 2-3 results and commit**

```bash
git add .planning/phases/05-backend-crud-apis/05-UAT.md
git commit -m "test(05): UAT tests 2-3 — supportive experience API"
```

---

### Task 3: Phase 5 API Tests — Diverse Experience (Tests 4-5)

**Files:**
- Modify: `.planning/phases/05-backend-crud-apis/05-UAT.md` (tests 4-5 results)

- [ ] **Step 1: Test GET /diverse — empty list**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/diverse
```

Expected: `{"success":true,"data":[],"pagination":{"total":0,...}}`
Record result for Test 4.

- [ ] **Step 2: Test POST /diverse — create with 4 boolean flags**

```bash
DIVERSE_ID=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"personnel_id":1,"is_diff_job_series":1,"is_diff_org":1,"is_diff_location":1,"is_diff_work_nature":0,"to_start_date":"2024-03-01"}' \
  http://localhost:8000/api/diverse | grep -o '"experience_id":[0-9]*' | cut -d: -f2)
echo "Created experience_id: $DIVERSE_ID"
```

Expected: HTTP 201, `{"success":true,"experience_id":N}`

- [ ] **Step 3: Verify GENERATED diff_count and qualified_date**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/diverse/$DIVERSE_ID"
```

Check: `diff_count` = 3 (3 out of 4 booleans are 1, MySQL GENERATED column auto-computes), `qualified_date` = "2024-03-01" (set in PHP because diff_count >= 3).
Record result for Test 5.

- [ ] **Step 4: Update UAT.md with Test 4-5 results and commit**

```bash
git add .planning/phases/05-backend-crud-apis/05-UAT.md
git commit -m "test(05): UAT tests 4-5 — diverse experience API"
```

---

### Task 4: Phase 5 API Tests — Position Equivalence (Tests 6-9)

**Files:**
- Modify: `.planning/phases/05-backend-crud-apis/05-UAT.md` (tests 6-9 results)

- [ ] **Step 1: Test GET /equivalence — empty list**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/equivalence
```

Expected: `{"success":true,"data":[],"pagination":{...}}`
Record result for Test 6.

- [ ] **Step 2: Test POST /equivalence — forced PENDING**

```bash
EQUIV_ID=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"personnel_id":1,"actual_position":"นักวิเคราะห์นโยบายและแผน","equivalent_type":"อำนวยการ","request_start_date":"2024-01-01","request_end_date":"2024-12-31"}' \
  http://localhost:8000/api/equivalence | grep -o '"equivalence_id":[0-9]*' | cut -d: -f2)
echo "Created equivalence_id: $EQUIV_ID"
```

Expected: HTTP 201 with `equivalence_id`. GET the record — `approval_status` must be "PENDING".
Record result for Test 7.

- [ ] **Step 3: Test PUT /equivalence — approve with date computation**

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approval_status":"APPROVED","approved_start_date":"2024-01-01","approved_end_date":"2024-12-31"}' \
  "http://localhost:8000/api/equivalence/$EQUIV_ID"
```

GET the record: `approved_total_days` should be 366 (2024 is leap year, DATEDIFF('2024-12-31','2024-01-01')+1 = 366). `approved_by` should be set (from JWT user_id).
Record result for Test 8.

- [ ] **Step 4: Test reject cannot reverse to PENDING**

```bash
# Create new record
NEW_ID=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"personnel_id":1,"actual_position":"test","equivalent_type":"อำนวยการ","request_start_date":"2024-01-01","request_end_date":"2024-06-30"}' \
  http://localhost:8000/api/equivalence | grep -o '"equivalence_id":[0-9]*' | cut -d: -f2)

# Reject it
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approval_status":"REJECTED"}' \
  http://localhost:8000/api/equivalence/$NEW_ID

# Try to reverse to PENDING — should fail
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approval_status":"PENDING"}' \
  http://localhost:8000/api/equivalence/$NEW_ID
```

Expected: Last request returns HTTP 400 with Thai error message about invalid status transition.
Record result for Test 9.

- [ ] **Step 5: Update UAT.md with Test 6-9 results and commit**

```bash
git add .planning/phases/05-backend-crud-apis/05-UAT.md
git commit -m "test(05): UAT tests 6-9 — equivalence API with approval workflow"
```

---

### Task 5: Phase 5 API Tests — Gateway Registration (Test 10)

**Files:**
- Modify: `.planning/phases/05-backend-crud-apis/05-UAT.md` (test 10 result + summary)

- [ ] **Step 1: Test all 3 routes return 200**

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/supportive
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/diverse
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/equivalence
```

Expected: All return `200`.

- [ ] **Step 2: Test unregistered route returns 404**

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/nonexistent
```

Expected: `404`.
Record result for Test 10.

- [ ] **Step 3: Update UAT.md summary and change status**

Update the Summary section with final counts. If all 10 passed, set `status: passed` in frontmatter.

- [ ] **Step 4: Commit**

```bash
git add .planning/phases/05-backend-crud-apis/05-UAT.md
git commit -m "test(05): UAT test 10 — gateway registration + phase 5 UAT complete"
```

---

### Task 6: Phase 6 Frontend Tests — Navigation & Page Layout (Tests 1-2)

**Files:**
- Modify: `.planning/phases/06-frontend-crud-pages/06-UAT.md` (tests 1-2 results)

**Requires:** Frontend dev server running (`cd frontend && npm run dev`)

- [ ] **Step 1: Start frontend dev server**

```bash
cd D:/hrProject/smart-port/frontend && npm run dev &
```

Wait for Vite to show "ready" on port 5174.

- [ ] **Step 2: Test sidebar navigation**

Open browser: `http://localhost:5174`
Login: admin / admin123
Click "การนับเวลาเพิ่มเติม" in sidebar.
Verify 3 sub-menus appear: การนับเกื้อกูล, การนับแตกต่าง, การเทียบตำแหน่ง.
Click each — verify real pages load (not "กำลังพัฒนา" placeholder).
Record result for Test 1.

- [ ] **Step 3: Test supportive page layout**

Navigate to /time-counting.
Verify: breadcrumb, header "การนับเกื้อกูล", stat cards, search bar, table (or EmptyState if no data), pagination controls.
Record result for Test 2.

- [ ] **Step 4: Update UAT.md and commit**

```bash
git add .planning/phases/06-frontend-crud-pages/06-UAT.md
git commit -m "test(06): UAT tests 1-2 — navigation and page layout"
```

---

### Task 7: Phase 6 Frontend Tests — CRUD Operations (Tests 3-4)

**Files:**
- Modify: `.planning/phases/06-frontend-crud-pages/06-UAT.md` (tests 3-4 results)

- [ ] **Step 1: Test create modal (supportive page)**

On /time-counting, click create button.
Verify modal opens with: personnel autocomplete, job series field, start/end dates, description.
Fill form, save. Verify: new row in table, success toast notification.
Record result for Test 3.

- [ ] **Step 2: Test edit and delete (supportive page)**

Click edit (pencil icon) on existing row. Verify modal opens with pre-filled data.
Modify, save. Verify data updated in table.
Click delete (trash icon). Verify confirmation dialog. Confirm. Verify row removed.
Record result for Test 4.

- [ ] **Step 3: Update UAT.md and commit**

```bash
git add .planning/phases/06-frontend-crud-pages/06-UAT.md
git commit -m "test(06): UAT tests 3-4 — supportive CRUD operations"
```

---

### Task 8: Phase 6 Frontend Tests — Diverse & Equivalence (Tests 5-9)

**Files:**
- Modify: `.planning/phases/06-frontend-crud-pages/06-UAT.md` (tests 5-9 results)

- [ ] **Step 1: Test diverse page layout and diff count badges (Test 5)**

Navigate to /time-difference. Verify same layout pattern.
Check "จำนวนต่าง" column shows colored badges:
- Green (≥3): "ผ่านเกณฑ์"
- Orange (1-2): "ยังไม่ครบ"
- Gray (0): no badge or empty
Record result for Test 5.

- [ ] **Step 2: Test diverse create with 4 checkboxes (Test 6)**

Click create. Verify: two-column layout (จาก/ไป), 4 checkboxes.
Check 3 boxes. Verify live diff_count preview shows "3 ต่าง".
Save. Verify diff_count in table matches.
Record result for Test 6.

- [ ] **Step 3: Test equivalence page layout and status badges (Test 7)**

Navigate to /position-compare.
Verify status column: orange "รออนุมัติ", green "อนุมัติแล้ว", red "ไม่อนุมัติ".
Record result for Test 7.

- [ ] **Step 4: Test equivalence create with forced PENDING (Test 8)**

Click create. Verify: no status selection field.
Save. Verify new record shows "รออนุมัติ" status always.
Record result for Test 8.

- [ ] **Step 5: Test approve/reject workflow (Test 9)**

On PENDING row: verify edit + approve + reject buttons visible.
Click "อนุมัติ": verify approve modal with date inputs. Fill dates, confirm.
Verify status changes to "อนุมัติแล้ว" (green).
On another PENDING row: click "ไม่อนุมัติ". Confirm.
Verify status changes to "ไม่อนุมัติ" (red).
Verify approved/rejected rows: no edit/approve buttons (view-only).
Record result for Test 9.

- [ ] **Step 6: Update UAT.md and commit**

```bash
git add .planning/phases/06-frontend-crud-pages/06-UAT.md
git commit -m "test(06): UAT tests 5-9 — diverse and equivalence pages"
```

---

### Task 9: Phase 6 Frontend Test — Thai Language & Dates (Test 10)

**Files:**
- Modify: `.planning/phases/06-frontend-crud-pages/06-UAT.md` (test 10 result + summary)

- [ ] **Step 1: Verify Thai text across all 3 pages**

Check: page headers, button labels ("สร้างรายการใหม่", "บันทึก", "ยกเลิก"), error messages, table column headers — all Thai.
No English labels in user-facing text.

- [ ] **Step 2: Verify Buddhist Era dates**

Check date columns in tables: format should be "1 ม.ค. 2567" (not "2024-01-01").
Record result for Test 10.

- [ ] **Step 3: Update summary and set status**

If all 10 passed: set `status: passed` in frontmatter.

- [ ] **Step 4: Commit**

```bash
git add .planning/phases/06-frontend-crud-pages/06-UAT.md
git commit -m "test(06): UAT test 10 — Thai language verification + phase 6 UAT complete"
```

---

### Task 10: Phase 7 Tests — Regression & New Columns (Tests 1-2)

**Files:**
- Modify: `.planning/phases/07-qualificationengine-integration/07-UAT.md` (tests 1-2 results)

- [ ] **Step 1: Test regression safety (Test 1)**

Navigate to Candidate List (ทั่วไป or วิชาการ tab).
Verify: existing data unchanged (qualification_date, remaining_days, status).
Verify: 3 new columns show "-" for personnel without supportive/diverse/equivalence data.
Record result for Test 1.

- [ ] **Step 2: Test new column headers (Test 2)**

Verify table has 12 columns total including: "วันเกื้อกูล", "สถานะ 3 ต่าง", "วันเทียบ ตน."
Check EmptyState colspan = 12 if empty.
Record result for Test 2.

- [ ] **Step 3: Update UAT.md and commit**

```bash
git add .planning/phases/07-qualificationengine-integration/07-UAT.md
git commit -m "test(07): UAT tests 1-2 — regression safety and new columns"
```

---

### Task 11: Phase 7 Tests — Integration Verification (Tests 3-6)

**Files:**
- Modify: `.planning/phases/07-qualificationengine-integration/07-UAT.md` (tests 3-6 results + summary)

- [ ] **Step 1: Test supportive days integration (Test 3)**

Go to /time-counting → create supportive record for a personnel visible in Candidate List.
Return to Candidate List → verify "วันเกื้อกูล" shows a number (not "-").
Verify qualification_date moved earlier.
Record result for Test 3.

- [ ] **Step 2: Test equivalence days integration (Test 4)**

Go to /position-compare → create + approve an equivalence record.
Return to Candidate List → verify "วันเทียบ ตน." shows a number.
Verify qualification_date moved even earlier (cumulative with supportive).
Record result for Test 4.

- [ ] **Step 3: Test PENDING doesn't count (Test 5)**

Create another equivalence record but leave PENDING.
Candidate List → "วันเทียบ ตน." should NOT increase.
Record result for Test 5.

- [ ] **Step 4: Test API response fields (Test 6)**

```bash
# List endpoint — check first record in data array for new fields
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/candidates/K2?limit=1" | python3 -c "
import sys,json
r=json.load(sys.stdin)
if r.get('data'):
    d=r['data'][0]
    print('supportive_days:', d.get('supportive_days'))
    print('equivalence_days:', d.get('equivalence_days'))
    print('diverse_diff_count:', d.get('diverse_diff_count'))
    print('diverse_status:', d.get('diverse_status'))
else:
    print('No data in response')
"
```

Verify: all 4 fields present in response. For personnel without data: `supportive_days=0`, `equivalence_days=0`, `diverse_status=null`.
Record result for Test 6.

- [ ] **Step 5: Update summary and set status**

If all 6 passed: set `status: passed` in frontmatter.

- [ ] **Step 6: Commit**

```bash
git add .planning/phases/07-qualificationengine-integration/07-UAT.md
git commit -m "test(07): UAT tests 3-6 — integration verification + phase 7 UAT complete"
```

---

### Task 12: Final UAT Summary

**Files:**
- No file changes — summary output only

- [ ] **Step 1: Print final UAT status across all 3 phases**

```bash
echo "=== UAT Summary ==="
grep "^status:" D:/hrProject/smart-port/.planning/phases/05-backend-crud-apis/05-UAT.md
grep "^status:" D:/hrProject/smart-port/.planning/phases/06-frontend-crud-pages/06-UAT.md
grep "^status:" D:/hrProject/smart-port/.planning/phases/07-qualificationengine-integration/07-UAT.md
echo "==================="
```

Expected: All 3 show `status: passed`.

- [ ] **Step 2: Report any gaps found**

If any tests failed, document gaps in the respective UAT.md file under `## Gaps` section with:
- Test number and name
- What failed
- Suggested fix
