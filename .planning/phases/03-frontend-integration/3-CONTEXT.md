# Phase 3: Frontend Integration - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire CandidateListsPage and ProbationEndPage to live backend APIs, replacing mock/hardcoded data. Implement tab/sub-tab navigation for candidate lists, stat cards with live counts, search/filter, color-coded remaining days, pagination, action buttons (export/import/add), loading/error states, and placeholder pages for unimplemented categories. This phase delivers frontend changes only — backend APIs are complete from Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Candidate List — Tab & Navigation Structure
- **D-01:** Tab หลัก 5 ตัวอยู่ใน **sidebar** เป็น sub-menu ของ Candidate Lists: ภาพรวม, ทั่วไป, วิชาการ, อำนวยการ, บริหาร — ตาม screenshot reference
- **D-02:** Sub-tab เป็น **pill buttons** แถวบนในเนื้อหาหน้า แสดงระดับเลื่อนของแต่ละประเภท:
  - ทั่วไป: ชำนาญงาน (O1→O2), อาวุโส (O2→O3)
  - วิชาการ: ชำนาญการ (K1→K2), ชำนาญการพิเศษ (K2→K3), เชี่ยวชาญ (K3→K4)
- **D-03:** Default sub-tab = ตัวแรกของแต่ละประเภท (เช่น เข้า "ทั่วไป" → แสดง "ชำนาญงาน" เลย)
- **D-04:** URL ไม่เปลี่ยนตาม sub-tab — ใช้ Vue reactive state ภายใน component เพื่อลด router complexity
- **D-05:** Sub-tab ระดับ แสดง **ตารางอย่างเดียว** (ไม่มี stat cards) — stat cards อยู่ใน "ภาพรวม" เท่านั้น

### Candidate List — Overview Page (ภาพรวม)
- **D-06:** "ภาพรวม" เป็น tab หลักตัวแรกใน sidebar — แสดง dashboard summary ของทุกประเภท/ทุกระดับ
- **D-07:** ภาพรวมประกอบด้วย 3 ส่วน:
  1. **Stat cards แยกตามประเภท:** ทั่วไป X คน, วิชาการ Y คน (2 cards)
  2. **Stat cards รวมตามสถานะ:** ครบกำหนด, รอดำเนินการ, ตรวจสอบข้อมูล (3 cards)
  3. **ตาราง top 5** คนที่ใกล้ครบกำหนดที่สุดจากทุกประเภททุกระดับ
- **D-08:** ภาพรวม ต้อง call API หลาย targetLevel (O2, O3, K2, K3, K4) แล้วรวมผล — ใช้ Promise.all เพื่อ parallel fetch

### Candidate List — Placeholder Tabs
- **D-09:** อำนวยการ และ บริหาร แสดง placeholder page พร้อม **icon/illustration** "อยู่ระหว่างพัฒนา" — ใช้ EmptyState component ที่มีอยู่ + เลือก icon ที่เหมาะจาก lucide-vue-next

### Status Badge Mapping
- **D-10:** Candidate status mapping (เพิ่มเข้า StatusBadge component):
  - `qualified` → เขียว (bg-green-50 text-green-700) "ครบกำหนด"
  - `not_yet` → เหลือง (bg-amber-50 text-amber-700) "รอดำเนินการ"
  - `check_data` → ส้ม (bg-orange-50 text-orange-700) "ตรวจสอบข้อมูล"
- **D-11:** Probation status mapping (เพิ่มเข้า StatusBadge component):
  - `IN_PROGRESS` → น้ำเงิน (bg-blue-50 text-blue-700) "กำลังดำเนินการ"
  - `COMPLETED` → เขียว (bg-green-50 text-green-700) "ผ่านทดลอง"
  - `FAILED` → แดง (bg-red-50 text-red-700) "ไม่ผ่าน"
  - `EXTENDED` → ส้ม (bg-orange-50 text-orange-700) "ขยายเวลา"

### Remaining Days Color Coding
- **D-12:** 4-level color coding ตาม requirement:
  - green (text-green-600): > 30 วัน
  - yellow (text-yellow-600): 15-30 วัน
  - orange (text-orange-600): 7-14 วัน
  - red (text-red-600 font-medium): < 7 วัน (รวมค่าติดลบ)

### Action Buttons
- **D-13:** ปุ่มด้านบนขวาของหน้า candidate list ตาม screenshot: ส่งออก, นำเข้า, เพิ่มรายชื่อ — ปุ่ม UI เท่านั้น (functional implementation เป็น v2 DV-06 สำหรับ export/import, POST /candidates ยังไม่มี backend)
- **D-14:** ปุ่มเหล่านี้แสดงเฉพาะ sub-tab ระดับ (ไม่แสดงในภาพรวม)

### Loading & Error States
- **D-15:** ใช้ **SkeletonLoader** ทั้ง stat cards และ table — component มี type "stat-cards" และ "table" อยู่แล้ว
- **D-16:** Error state ใช้ **EmptyState component** แทนที่ตาราง + ปุ่ม "ลองใหม่" — เรียบง่าย ชัดเจน
- **D-17:** **โหลดใหม่ทุกครั้ง**ที่เปลี่ยน sub-tab — ไม่ cache, ข้อมูล HR ต้อง real-time, dataset เล็ก (หลักร้อย)

### Pagination
- **D-18:** ตาม screenshot: "แสดง X ถึง Y จาก Z รายการ" + ปุ่มก่อนหน้า/ถัดไป + page numbers — consistent กับ design reference

### Probation Page
- **D-19:** Probation ไม่แยก overview — stat cards (ทั้งหมด, พร้อมดำเนินการ, ใกล้ครบกำหนด, เกินกำหนด) + ตาราง อยู่ในหน้าเดียว
- **D-20:** Search ค้นได้ 3 fields: ชื่อ, ตำแหน่ง, หน่วยงาน — ตาม PT-10
- **D-21:** ใช้ loading/error/pagination patterns เดียวกับ candidate list (D-15 ถึง D-18)

### API Integration Pattern
- **D-22:** สร้าง composable `useCandidates.js` สำหรับ candidate list API calls (SH-03) — wrap useApi().get('/candidates/{level}')
- **D-23:** สร้าง composable `useProbation.js` สำหรับ probation API calls (SH-04) — wrap useApi() GET/POST/PUT
- **D-24:** Backend ส่ง snake_case — frontend map เป็น camelCase ใน composable ก่อนส่งให้ component (เช่น full_name → name, qualification_date_thai → dueDate)

### Claude's Discretion
- SequentialLoader component design (ถ้าจำเป็น)
- Exact Tailwind classes for pill buttons
- EmptyState illustration choice for อำนวยการ/บริหาร placeholder
- Composable internal structure (reactive refs vs return objects)
- Table column widths and responsive breakpoints
- Pagination component implementation details

</decisions>

<specifics>
## Specific Ideas

- ตาม screenshot: sub-tab pill buttons มีสีน้ำเงิน (bg-blue-500 text-white) สำหรับ active, สีขาว (bg-white border) สำหรับ inactive
- ตาราง action column มี 3 icons: view (eye), edit (pencil), delete (trash) — ตาม screenshot
- หัวข้อหน้า: "รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง ({ประเภท})" + subtitle "จัดการข้อมูลผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งในสายงาน{ประเภท}"
- Breadcrumb: Home icon / {ประเภท} — ตาม screenshot

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Reference (screenshots)
- `docs/scrennshorts/1774147879491.jpg` — Candidate list ทั่วไป: sidebar nav, pill sub-tabs (ชำนาญงาน/อาวุโส), search+filter, table with actions, pagination
- `docs/scrennshorts/1774147914659.jpg` — Candidate list วิชาการ: pill sub-tabs (ชำนาญการ/ชำนาญการพิเศษ/เชี่ยวชาญ/ทรงคุณวุฒิ), same table pattern

### Existing Frontend Code
- `frontend/src/pages/CandidateListsPage.vue` — Current page with mock data, 4-tab RouterLink navigation, StatCard + StatusBadge usage, search filter
- `frontend/src/pages/ProbationEndPage.vue` — Current page with mock data, stat cards, search filter, table
- `frontend/src/composables/useApi.js` — API composable: useApi() returns { get, post, put, del }, auto-attaches JWT
- `frontend/src/stores/auth.js` — Auth store with token management
- `frontend/src/router/index.js` — Routes: /candidates/:section? (props: true), /probation-end
- `frontend/src/components/StatusBadge.vue` — Existing status map (needs new entries for candidate/probation statuses)
- `frontend/src/components/StatCard.vue` — Props: label, value, icon, change, iconBgClass, iconClass, sparkline
- `frontend/src/components/SkeletonLoader.vue` — Types: stat-cards, table, card
- `frontend/src/components/EmptyState.vue` — Props: icon, title, description + slot
- `frontend/src/components/AppSidebar.vue` — Sidebar navigation structure (needs sub-menu for candidate list tabs)

### Backend API Contracts (Phase 2 output)
- `backend/routes/candidates.php` — GET /candidates/{targetLevel} with ?search=&limit=&offset=, GET /candidates/{targetLevel}/{personnelId}
- `backend/routes/probation.php` — GET /probation with ?search=&limit=&offset=, GET /probation/{id}, POST /probation, PUT /probation/{id}
- `backend/helpers.php` — Backend provides Thai dates and level names in response (no frontend conversion needed)
- `backend/QualificationEngine.php` — Response shape: { success, data[], summary: {total, qualified, not_yet}, pagination: {total, limit, offset, has_more} }

### Requirements
- `.planning/REQUIREMENTS.md` — CL-06 through CL-14, PT-06 through PT-11, SH-03, SH-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StatCard.vue` — Fully reusable, accepts label/value/icon/colors/sparkline
- `StatusBadge.vue` — Reusable but needs new status entries added to statusMap
- `SkeletonLoader.vue` — Has stat-cards and table types ready
- `EmptyState.vue` — Reusable with custom icon/title/description + slot for action button
- `useApi.js` — Composable returning { get, post, put, del } with auto JWT and 401 handling
- `AppSidebar.vue` — Has expandable menu structure, needs sub-items added for candidate list tabs

### Established Patterns
- Vue 3 Composition API with `<script setup>`
- Reactive state: `ref()` + `computed()`
- Props via `defineProps()`
- Pinia stores: Composition API style `defineStore('name', () => {})`
- Tailwind classes directly in template
- Import alias: `@/` resolves to `src/`
- lucide-vue-next for icons
- Thai language for all UI text

### Integration Points
- `router/index.js` — Update /candidates/:section? route, possibly add sub-routes or keep section param
- `AppSidebar.vue` — Add 5 sub-menu items under Candidate Lists (ภาพรวม, ทั่วไป, วิชาการ, อำนวยการ, บริหาร)
- `StatusBadge.vue` — Add 7 new status entries (3 candidate + 4 probation)
- `CandidateListsPage.vue` — Major rewrite: remove mock data, add API calls, sub-tab pills, overview page
- `ProbationEndPage.vue` — Major rewrite: remove mock data, add API calls, color-coded days, pagination

</code_context>

<deferred>
## Deferred Ideas

- Export/Import functional implementation — DV-06, v2 (Phase 3 adds UI buttons only)
- Add new candidate form/modal — no backend POST /candidates endpoint yet
- Drill-down detail view per candidate — DV-01, v2
- Probation task checklist per enrollment — DV-02, v2
- Probation stakeholder display — DV-03, v2
- ทรงคุณวุฒิ (K5) sub-tab — no seed data or backend support yet
- อำนวยการ/บริหาร full implementation — AC-01, AC-02, v2
- Responsive mobile optimization — out of scope v1

</deferred>

---

*Phase: 03-frontend-integration*
*Context gathered: 2026-03-22*
