# Tool Inventory — MCP อ่านอย่างเดียว (role viewer)

Asset ของ ticket `tool-inventory` (แผนที่: `docs/wayfinder/smart-port-mcp.md`)
สำรวจจากโค้ดจริง — ทุก endpoint อ้าง `file:line` ไว้ตรวจซ้ำได้

## 1. กรอบสิทธิ์ viewer (default matrix)

`backend/authz.php:70-78` — viewer มีแค่ `read` บน 6 resources:

`multiplier` · `personnel` · `candidates` · `probation` · `dashboard` · `profile`

ที่เหลือ (`awards`, `royal_decorations`, `work_results`, `supportive`,
`diverse`, `equivalence`, `analytics`, `retirement`, `audit`, `users`,
`import`, `ocr`, `sync`, `settings`) ถูก gate ด้วย `requirePermission` /
`evaluatePermissionAccess` → viewer ได้ **403** (เช่น `awards.php:23-24`,
`decorations.php:20-21`, `work_results.php:24-25`)

ข้อยกเว้นที่ต้องรู้:

- `GET /photos/sign` เช็กแค่ JWT ไม่เช็ก permission (`api.php:265-272`) →
  viewer เรียกได้ แต่ต้องรู้ชื่อไฟล์ก่อน (ได้จาก `photo_path` ของ
  `GET /profile/{id}`) และไม่มี photo list endpoint (GET อื่นตก 405,
  `api.php:382-384`)
- `GET /dashboard` คืนตัวเลขนับรวมของ `supportive`/`diverse`/`equivalence`
  ให้ viewer ด้วย (`api.php:522-528`) — เป็นยอดรวม ไม่มีรายบุคคล

## 2. Endpoints ที่ viewer เรียกได้ (GET ทั้งหมด)

| Endpoint | Gate | Params | Response |
|---|---|---|---|
| `/dashboard` (`api.php:462-594`) | read dashboard | ไม่มี | `total_personnel`, `probation{total,in_progress.near_deadline.overdue}`, `time_counting{supportive.diverse.equivalence.total}`, `multiplier{total_records.distinct_personnel.total_bonus_days.total_bonus_years}`, `candidates{total.by_level}` |
| `/candidates/overview` (`candidates.php:62-67`) | read candidates | ไม่มี | `summary{general/academic/supportive/management/qualified/near_qualified/not_yet/check_data _total}`, `by_level{total.qualified.not_yet.check_data.near_qualified}` ต่อระดับ, `top5[]` (ใกล้ครบเกณฑ์สุด 5 คนข้ามระดับ) |
| `/candidates/{target}` (`candidates.php:104-113`) | read candidates | `target` ∈ K2 K3 K4 O2 O3 M1 M2 S1 S2; `search`, `limit` (เพดาน 200), `offset` | แถวละ `personnel_id full_name current_position current_level_code/_name education_level min_years department supportive/equivalence_days diverse_diff_count multiplier_days qualification_date(+_thai) remaining_days status` (`qualified` ≤ 0 วัน / `not_yet` / `check_data`); `summary{total.qualified.not_yet.check_data}`; `pagination{total.limit.offset.has_more}` |
| `/candidates/{target}/{id}` (`candidates.php:93-103`) | read candidates | path params | เหมือนแถว list + `first_name last_name hire_date(+_thai) education_condition`; **`citizen_id` ถูกตัดให้ non-admin** (`:101-102`) |
| `/probation` (`probation.php:211-355`) | read probation | `search` (ชื่อ/ตำแหน่ง/หน่วย), `limit` (1–200), `offset` | แถวละ `enrollment_id personnel_id full_name position_name department start/end_date(+_thai) remaining_days status total/completed_tasks remarks`; `summary{total.in_progress.near_deadline.overdue}` คำนวณจาก full dataset; `pagination` |
| `/probation/{id}` (`probation.php:362-399`) | read probation | path param | detail + `final_result(+_date) extension_end_date extension_reason order_number order_date` (มี `*_thai`) |
| `/personnel` typeahead (`personnel.php:579-583`, SQL `:25-47`) | read personnel | `search` (≥ 2 ตัวอักษร), `limit` (default 10, เพดาน 50); **ต้องไม่มี `offset`** | `personnel_id full_name first/last_name current_position department` — **ไม่มี `citizen_id`** ใน SELECT แต่ค้นหาด้วยเลขบัตรได้ |
| `/personnel?offset=…` master list (`personnel.php:556-577`) | read personnel | `search` (ชื่อ/เลขบัตร/เลขประจำตัว), `limit` (เพดาน 200), `offset`, `include_inactive` (non-admin ถูก soft-deny) | เหมือน master select + `pagination`; **`citizen_id` ถูกตัดให้ viewer** (`:567-570`) |
| `/personnel/{id}` (`personnel.php:541-554`) | read personnel | path param | แถวมาสเตอร์รายคน, redacted เหมือน list; 404 ถ้าไม่พบ |
| `/personnel/lookups` (`personnel.php:531-537`) | read personnel | ไม่มี | `prefixes[{prefix_id prefix_code prefix_name_th}]` |
| `/civil-servants` (`api.php:391-400`) | read personnel | `search limit offset` | legacy list — contract คล้าย master + redact; **MCP ควรใช้ `/personnel` แทน** |
| `/multiplier` (`multiplier.php:115-117`) | read multiplier | `limit offset` | แถวละ `multiplier_id personnel_id full_name area_* start/end_date(+_thai) eligible_*(+_thai) service/eligible_days multiplier_ratio effective/bonus_days net_years/months/day_remainder proof_reference description`; มี `summary` + `pagination` |
| `/multiplier/areas` (`multiplier.php:111-114,236-`) | read multiplier | `province district active_only` (default 1) | `area_multiplier_id province district area_label basis_type multiplier_ratio effective_* legal/source_reference is_active source_pending` |
| `/multiplier/{id}` (`multiplier.php:119-120`) | read multiplier | path param | record รายตัว |
| `/profile` (`profile.php:112-121`) | read profile | ไม่มี | แถว users ของบัญชีที่เรียก (ไม่มี `password_hash`) — มีค่ากับ MCP แค่เช็ก session |
| `/profile/{id}` (`profile.php:103-111`, SQL `:34-56`) | read profile | path param (`personnel_id`) | `personnel_id employee_id first/last_name full_name birth/appointment/retirement_date servant_status is_active photo_path` — **SELECT ไม่มี `citizen_id`** ตั้งแต่ต้น |
| `/photos/sign?file=` (`photos.php:119-`) | JWT อย่างเดียว | `file` = ชื่อไฟล์จาก `photo_path` | signed URL `/uploads/{file}?exp=&sig=` อายุ 900 วินาที (`photos.php:23`); เปิด bytes ผ่าน `GET /uploads/{file}` (public asset, `api.php:259-263`) |

## 3. Convention ข้าม endpoints (จาก `api-design`)

- Pagination: `limit`/`offset` + `has_more` (offset-based — เหมาะกับชุดข้อมูล
  ระดับกรม); เพดานกัน dump: list ใหญ่ = 200, typeahead = 50
- Response: `{success, data, summary?, pagination?}` ฝั่งสำเร็จ;
  `{error}` + HTTP status ฝั่งผิดพลาด (400/401/403/404/405/409/503 fail-closed)
- วันที่: ISO `*_date` + ไทย `*_thai` (พ.ศ.) คู่กัน — MCP ตอบ HR ด้วย `*_thai`
- หน้าต่าง "ใกล้ครบ": candidates = เหลือ **1–90 วัน** (`NEAR_THRESHOLD_DAYS`),
  probation = เหลือ **0–30 วัน** — ห้ามสลับกัน (`CONTEXT.md`)
- Auth: session อยู่บน httpOnly cookies `sp_access`/`sp_refresh` — MCP server
  ต้องล็อกอินเป็น service account เองแล้วแนบ cookies (ไม่มี Bearer)

## 4. Tools ชุดแรกที่แนะนำ (สำหรับ `prototype-stdio`)

| # | Tool (snake_case) | ห่อ endpoint | Params |
|---|---|---|---|
| 1 | `dashboard_summary` | `GET /dashboard` | ไม่มี — ภาพรวมทั้งองค์กรในคำตอบเดียว |
| 2 | `candidate_search` | `GET /candidates/overview` + `GET /candidates/{target}` | `target_level?` (ไม่ส่ง = overview), `search?`, `limit?`, `offset?` |
| 3 | `probation_watch` | `GET /probation` + `GET /probation/{id}` | `search?`, `limit?`, `offset?`, `enrollment_id?` (ส่ง = detail) |

ตัวสำรองรอบถัดไป: `personnel_lookup` (typeahead → detail),
`career_profile` (`/profile/{id}` + candidate detail รายคน),
`multiplier_lookup` (list/areas) — ทั้งหมดใช้สิทธิ์ viewer ได้โดยไม่ต้อง
แก้ matrix

## 5. ประเด็นส่งต่อให้ tickets ถัดไป

- `pii-policy`: ยืนยัน exclusion list — viewer เห็นยอดรวมนับเวลาใน dashboard
  ได้ แต่เปิดรายละเอียด supportive/diverse/equivalence/awards/work-results
  ไม่ได้ (403) — ถ้า pilot ต้องการ ต้องเป็นคำขอ override ชัดเจน ไม่ใช่ดีฟอลต์
- `prototype-stdio`: รูปต้อง chain 3 ท่า (`profile/{id}` → `photo_path` →
  `sign` → URL) — ถ้าจะมี tool รูป ให้รับ `personnel_id` แล้ว chain ใน tool
  เดียว อย่าให้ model ประกอบเอง
- ไม่พบ endpoint ที่ต้องมี ticket ใหม่ — ขอบเขต `service-account`/`hr-pilot`/
  `rollout` ยังตรงตามแผนที่
