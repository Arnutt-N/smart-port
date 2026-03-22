# Phase 6: Frontend CRUD Pages - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace 3 PlaceholderPage routes (`/time-counting`, `/time-difference`, `/position-compare`) with real Vue 3 CRUD pages. Each page connects to the Phase 5 backend APIs (`/supportive`, `/diverse`, `/equivalence`). No changes to routing structure or sidebar — those already exist.

</domain>

<decisions>
## Implementation Decisions

### Page Layout — Follow ProbationEndPage Pattern
- **D-01:** All 3 pages follow the same layout: breadcrumb → page header → stat cards → search bar → data table → PaginationBar. This matches ProbationEndPage exactly.
- **D-02:** Stat cards summarize record counts (e.g., total records, recent entries). Use existing `StatCard` component with lucide icons.
- **D-03:** Search bar uses debounced input with Thai IME composition guard (same as ProbationEndPage).
- **D-04:** Data table uses `<table>` with Tailwind, not a table library. Consistent with existing pages.
- **D-05:** Loading state uses `SkeletonLoader` component. Empty state uses `EmptyState` component. Error state shows error message with retry.

### Create/Edit Forms — Modal Dialogs
- **D-06:** Create and edit use modal dialogs (not inline forms or slide-out panels). This is consistent with standard CRUD UX and keeps the table view visible behind.
- **D-07:** Personnel selection: searchable text input that calls `/civil-servants?search=X` API for autocomplete suggestions. Show full_name + employee_id in dropdown.
- **D-08:** Job series selection (supportive page): text input with autocomplete from loaded `supportive_job_series` mapping data.
- **D-09:** Date inputs use native `<input type="date">` (HTML5). Display in Buddhist Era (พ.ศ.) in the table but use Gregorian (ค.ศ.) in form inputs for API compatibility.
- **D-10:** Form validation: required fields highlighted with red border + Thai error message below input. Validate before submit.

### Supportive Experience Page (/time-counting)
- **D-11:** Table columns: ลำดับ (row number), ชื่อ-สกุล (personnel name), สายงานที่เกื้อกูล (job series), วันเริ่มต้น-สิ้นสุด (start-end dates in พ.ศ.), จำนวนวัน (total_days), อัตราลดทอน (ratio_percent%), วันที่ได้ (effective_days), จัดการ (action buttons)
- **D-12:** Action buttons: edit (pencil icon) and delete (trash icon) per row. Delete requires confirmation dialog.
- **D-13:** Create form fields: personnel_id (autocomplete), primary_series_name (autocomplete), job_series_name (autocomplete), start_date, end_date, description (optional textarea)

### Diverse Experience Page (/time-difference)
- **D-14:** Table columns: ลำดับ, ชื่อ-สกุล, จาก (from summary: สายงาน/หน่วยงาน/จังหวัด), ไป (to summary), จำนวนต่าง (diff_count with visual badge), วันครบ 3 ต่าง (qualified_date), จัดการ
- **D-15:** diff_count display: use colored badge — green (≥3, ผ่านเกณฑ์), amber (1-2, ยังไม่ครบ), gray (0). Extend StatusBadge with new status keys.
- **D-16:** 4-dimension checklist in create/edit form: is_diff_job_series, is_diff_org, is_diff_location, is_diff_work_nature as labeled checkboxes. Show computed diff_count preview live.
- **D-17:** From/To sections in form: two-column layout. Left = "จาก" fields, Right = "ไป" fields.

### Position Equivalence Page (/position-compare)
- **D-18:** Table columns: ลำดับ, ชื่อ-สกุล, ตำแหน่งจริง (actual_position), เทียบเป็น (equivalent_type), วันที่ขอ (request dates), สถานะ (approval_status badge), วันที่อนุมัติ (approved dates, if APPROVED), จัดการ
- **D-19:** Approval status badges: PENDING = amber "รออนุมัติ", APPROVED = green "อนุมัติแล้ว", REJECTED = red "ไม่อนุมัติ". Extend StatusBadge with these keys.
- **D-20:** Action buttons vary by status: PENDING rows show edit + approve + reject buttons. APPROVED/REJECTED rows show view-only (no edit).
- **D-21:** Approve action: opens confirmation modal requiring approved_start_date and approved_end_date. Reject action: simple confirmation dialog.
- **D-22:** POST form creates with PENDING status always — no status selection in create form.

### Composables — One Per Feature
- **D-23:** Create 3 composables: `useSupportive.js`, `useDiverse.js`, `useEquivalence.js`. Each wraps API calls and maps backend snake_case to frontend camelCase.
- **D-24:** Each composable returns: `fetchList()`, `fetchDetail()`, `create()`, `update()`, `remove()`. Same pattern as `useProbation.js`.

### Consistency with Existing UI
- **D-25:** All text in Thai. Page titles match sidebar labels exactly: "การนับเกื้อกูล", "การนับแตกต่าง", "การเทียบตำแหน่ง"
- **D-26:** Date display in tables always in Buddhist Era format (พ.ศ.) — the backend already returns `*_thai` suffixed fields
- **D-27:** Toast notifications on success/error using existing `useUiStore().showToast()`
- **D-28:** Color scheme matches existing: blue-500 primary, gray-800 sidebar, white content area

### Claude's Discretion
- Modal component implementation (simple overlay div — no library needed)
- Exact StatCard configurations per page
- Table responsive behavior on mobile
- Autocomplete dropdown styling
- Confirmation dialog implementation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend patterns (PRIMARY templates)
- `frontend/src/pages/ProbationEndPage.vue` — Page layout template: breadcrumb, header, stat cards, search, table, pagination, loading/error/empty states
- `frontend/src/composables/useProbation.js` — Composable pattern: useApi() wrapping, fetchList(), field mapping
- `frontend/src/composables/useApi.js` — API service with JWT interceptor
- `frontend/src/components/PaginationBar.vue` — Pagination component (total/limit/offset props)
- `frontend/src/components/StatusBadge.vue` — Status badge (needs new keys for approval + diff_count)
- `frontend/src/components/StatCard.vue` — Stat card (label, value, icon props)
- `frontend/src/components/EmptyState.vue` — Empty state display
- `frontend/src/components/SkeletonLoader.vue` — Loading skeleton

### Routing & navigation
- `frontend/src/router/index.js` — Routes to update (replace PlaceholderPage imports)
- `frontend/src/components/AppSidebar.vue` — Sidebar menu (already has time-extra submenu, no changes needed)

### Backend APIs (data contracts)
- `backend/routes/supportive.php` — GET/POST/PUT/DELETE /supportive with pagination
- `backend/routes/diverse.php` — GET/POST/PUT/DELETE /diverse with GENERATED diff_count
- `backend/routes/equivalence.php` — GET/POST/PUT /equivalence with approval workflow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PaginationBar.vue` — ready to use, accepts total/limit/offset props
- `StatusBadge.vue` — needs 5 new status keys (PENDING/APPROVED/REJECTED + diff count badges)
- `StatCard.vue` — ready to use with lucide icons
- `EmptyState.vue` — ready for empty table states
- `SkeletonLoader.vue` — supports 'table' and 'stat-cards' types
- `useApi.js` — get/post/put/del methods with JWT interceptor
- `useUiStore` — showToast() for success/error notifications

### Established Patterns
- Pages: `<script setup>` with ref/computed, async onMounted data fetch, debounced search
- Composables: function returning object of API methods, snake_case → camelCase mapping
- Tables: raw `<table>` with Tailwind classes, no library
- Dates: backend provides `*_thai` fields (Buddhist Era formatted)
- IME: Thai composition guard on search inputs

### Integration Points
- `router/index.js` — 3 route imports to change (PlaceholderPage → new pages)
- `StatusBadge.vue` — add new status keys to statusMap
- Backend APIs: `/supportive`, `/diverse`, `/equivalence` with `?personnel_id=X&limit=20&offset=0`
- `/civil-servants?search=X` API for personnel autocomplete

</code_context>

<deferred>
## Deferred Ideas

- Personnel selection as a shared component (reusable across all 3 pages) — could be extracted after v1.1 if pattern proves stable
- Inline editing (edit directly in table row) — too complex for v1.1, modal is simpler
- Bulk operations (select multiple + delete) — defer to v2
- CSV export from table — v2 requirement (DV-03)

</deferred>

---

*Phase: 06-frontend-crud-pages*
*Context gathered: 2026-03-23*
