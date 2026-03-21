# Phase 2: Backend APIs - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build PHP REST endpoints for candidate list qualification queries and probation enrollment CRUD. Includes a data-driven qualification engine that reads promotion_criteria from the database to compute qualification status. Also includes shared utilities (Thai date formatting, level code mapping). This phase delivers backend only — no frontend changes.

</domain>

<decisions>
## Implementation Decisions

### Backend code organization
- **D-01:** แยก QualificationEngine เป็นไฟล์ `QualificationEngine.php` — logic คำนวณซับซ้อน (อ่าน promotion_criteria → เทียบอายุราชการ → คิดวุฒิการศึกษา → หาวันครบกำหนด) ควรแยกออกเพื่อจัดการและ debug ง่าย
- **D-02:** เพิ่ม case ใน `api.php` switch → `include 'routes/candidates.php'` และ `include 'routes/probation.php'` — api.php ยังเป็น gateway แต่ route logic แยกไฟล์
- **D-03:** แยก `helpers.php` สำหรับ Thai date formatting (พ.ศ.) + level code → Thai name mapping — ใช้ร่วมทั้ง candidates และ probation
- **D-04:** Pass `$pdo` เป็น parameter ให้ route handlers — `handleCandidates($pdo, $method, $path)` — ชัดเจน ไม่พึ่ง global

### Candidate list API contract
- **D-05:** URL pattern: `GET /candidates/{targetLevel}` — path param (เช่น `/candidates/K2`, `/candidates/O2`) ตรงกับ Roadmap spec
- **D-06:** Detail endpoint: `GET /candidates/{targetLevel}/{personnelId}` — ข้อมูลพื้นฐานเท่านั้นสำหรับ v1 (ชื่อ, ระดับ, อายุราชการ, วันครบกำหนด, สถานะ) ไม่รวมประวัติตำแหน่ง/ประสบการณ์เกื้อกูล (DV-01 อยู่ใน v2)
- **D-07:** Response ส่ง `summary: { total, qualified, not_yet }` มาพร้อม `data[]` ในครั้งเดียว — ลด logic ฝั่ง frontend
- **D-08:** รองรับ pagination `?limit=20&offset=0` ตั้งแต่แรก — ตามแพทเทิร์น `/civil-servants` ที่มีอยู่ รองรับข้อมูล production หลักร้อยคน
- **D-09:** รองรับ search `?search=keyword` — กรองชื่อ/ตำแหน่ง ตามแพทเทิร์นเดิม

### Qualification edge cases
- **D-10:** บุคลากรที่ไม่มี `current_level_code` หรือ `current_level_start_date` → แสดงในรายการเป็นสถานะ "ตรวจสอบข้อมูล" (Check Data) — HR ต้องเห็นว่ามีคนที่ข้อมูลไม่ครบ
- **D-11:** เพิ่มคอลัมน์ `education_level VARCHAR(30)` ในตาราง `personnel` — จำเป็นต่อการคำนวณ K1→K2 (ป.ตรี=6ปี, ป.โท=4ปี, ป.เอก=2ปี) ถ้าไม่มีวุฒิ default เป็น BACHELOR (เกณฑ์สูงสุด = safe)
- **D-12:** Probation API ดึงจาก `probation_enrollment` table — ไม่แสดงบุคลากรที่ไม่มี enrollment record
- **D-13:** Error response ใช้รูปแบบเดิม `{ "error": "message" }` — consistent กับ codebase เดิม

### Probation API scope
- **D-14:** Full CRUD ตาม Requirements: GET list, GET detail, POST create, PUT update — ทั้งหมดตาม PT-01 ถึง PT-05
- **D-15:** remaining_days คำนวณ dynamic เสมอ: `DATEDIFF(end_date, CURDATE())` — ไม่เก็บเป็นคอลัมน์

### Shared utilities (SH-01, SH-02)
- **D-16:** Thai date formatting: แปลง `2026-03-22` → `22 มี.ค. 2569` (บวก 543 สำหรับ พ.ศ.) — ทำฝั่ง backend ส่งมาพร้อม response เพื่อ frontend ไม่ต้องคำนวณเอง
- **D-17:** Level code mapping: `K1`→`ปฏิบัติการ`, `K2`→`ชำนาญการ`, `O1`→`ปฏิบัติงาน` ฯลฯ — อยู่ใน helpers.php ส่งทั้ง code และ Thai name ใน response

### Claude's Discretion
- SQL query optimization (JOIN strategy, index usage)
- Exact function signatures and internal architecture of QualificationEngine
- Error message wording (Thai/English)
- PHP code style details (type hints, docblocks)
- Database migration script format for adding education_level column

</decisions>

<specifics>
## Specific Ideas

- Qualification status ต้องมี 3 ค่าหลัก: `qualified` (ถึงเกณฑ์นานแล้ว), `not_yet` (ยังไม่ถึงเกณฑ์), `check_data` (ข้อมูลไม่ครบ)
- Response shape ต้อง match กับ frontend mock data fields: `name`, `currentPosition`, `currentLevel`, `dueDate`, `remainingDays`, `status`
- ProbationEndPage expects: `name`, `position`, `department`, `startDate`, `endDate`, `remainingDays`, `status`
- แพทเทิร์น api.php เดิมใช้ `echo json_encode([...])` ส่ง response — endpoint ใหม่ต้องตามแบบเดียวกัน
- Existing `/candidates` case ใน api.php จะถูกแทนที่ด้วย route ใหม่ที่ include จาก `routes/candidates.php`

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database schema (Phase 1 output)
- `database/03-personnel-stubs.sql` — personnel table structure (columns, FKs) + stub tables
- `database/04-career-path.sql` — promotion_criteria table (columns for qualification engine), all 11 career path tables, vw_job_series_tenure and vw_executive_tenure views
- `database/05-probation.sql` — probation_enrollment and all 10 probation tables, vw_probation_dashboard view
- `database/06-seed-data.sql` — promotion_criteria seed data (8 rows: K-series + O-series), sample personnel (7 rows), sample probation enrollments (3 rows)

### Existing backend code
- `backend/api.php` — Current API gateway: switch/case routing, JWT auth, CORS headers, existing endpoints (login, profile, photos, dashboard, candidates, civil-servants)
- `backend/config.php` — PDO connection setup, JWT_SECRET constant, UPLOAD_DIR
- `backend/auth.php` — JWT generation/validation functions, getAuthHeader()

### Frontend data contracts (what the API must satisfy)
- `frontend/src/pages/CandidateListsPage.vue` — Mock data shape: `{ id, name, currentPosition, currentLevel, dueDate, remainingDays, status, section }`, sections: general/academic/support/management
- `frontend/src/pages/ProbationEndPage.vue` — Mock data shape: `{ id, name, position, department, startDate, endDate, remainingDays, status }`

### Requirements
- `.planning/REQUIREMENTS.md` — CL-01 through CL-05, PT-01 through PT-05, SH-01, SH-02

### Promotion criteria reference
- `docs/gap_analysis_career_path_v2.sql` — PostgreSQL source with business rules in COMMENT ON TABLE statements
- `docs/documents/ops-carrer-path.pdf` — Thai civil service career path rules (pages 31-82: year thresholds per level per education)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/api.php` lines 36-270 — Switch/case routing pattern to follow for new cases
- `backend/auth.php` — JWT validation already in place, new endpoints auto-protected
- `backend/config.php` — `$pdo` connection ready to pass to route handlers
- `vw_probation_dashboard` view — Already computes remaining_days via DATEDIFF, can be used directly by probation GET endpoint

### Established Patterns
- Response format: `echo json_encode(['success' => true, 'data' => [...], 'pagination' => [...]])`
- Error format: `http_response_code(4xx); echo json_encode(['error' => 'message'])`
- Search: `WHERE (col LIKE ? OR col LIKE ?)` with `%search%` pattern
- Pagination: `LIMIT ? OFFSET ?` with response `{ total, limit, offset, has_more }`
- PDO: Prepared statements exclusively, `PDO::FETCH_ASSOC`

### Integration Points
- `api.php` switch statement — add new cases: `case 'candidates':` and `case 'probation':`
- New files in `backend/` directory: `QualificationEngine.php`, `routes/candidates.php`, `routes/probation.php`, `helpers.php`
- `personnel` table — needs ALTER to add `education_level` column (new SQL migration file)
- `database/06-seed-data.sql` — may need update to include education_level values for sample personnel

</code_context>

<deferred>
## Deferred Ideas

- Drill-down ข้อมูลเต็ม (ประวัติตำแหน่ง, ประสบการณ์เกื้อกูล) — DV-01, v2
- Batch recalculation endpoint — DV-05, v2
- CSV export — DV-06, v2
- Probation task checklist per enrollment — DV-02, v2
- Probation stakeholder display — DV-03, v2
- M1/M2/S1/S2 promotion criteria — AC-01, AC-02, v2

</deferred>

---

*Phase: 02-backend-apis*
*Context gathered: 2026-03-22*
