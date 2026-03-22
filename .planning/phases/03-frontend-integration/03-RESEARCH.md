# Phase 3: Frontend Integration - Research

**Researched:** 2026-03-22
**Domain:** Vue 3 SPA frontend integration with PHP REST API
**Confidence:** HIGH

## Summary

This phase wires two existing mock-data pages (CandidateListsPage.vue and ProbationEndPage.vue) to live backend APIs completed in Phase 2. The work is entirely frontend: creating composables for API calls, restructuring navigation (sidebar sub-menus + pill sub-tabs), adding status badge mappings, implementing color-coded remaining days, pagination, loading/error states, and placeholder pages for unimplemented categories.

The existing codebase uses Vue 3 Composition API with `<script setup>`, Pinia stores, and a custom `useApi()` composable wrapping the Fetch API with JWT auto-attachment. All UI components needed (StatCard, StatusBadge, SkeletonLoader, EmptyState) already exist and are reusable. The sidebar (AppSidebar.vue) already has an expandable sub-menu pattern with `children` arrays. The router uses `candidates/:section?` with props passthrough.

**Primary recommendation:** Create two composables (`useCandidates.js`, `useProbation.js`) wrapping `useApi()`, then rewrite CandidateListsPage and ProbationEndPage to use them. Add "overview" as a sidebar sub-menu item, restructure sub-tabs as reactive pill buttons within the page component, and build a reusable Pagination component.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Tab main 5 items in sidebar as sub-menu of Candidate Lists: overview, general, academic, executive, management -- per screenshot reference
- **D-02:** Sub-tabs as pill buttons row in content area showing promotion levels per category
- **D-03:** Default sub-tab = first of each category
- **D-04:** URL does not change with sub-tab -- use Vue reactive state, not router
- **D-05:** Sub-tab level pages show table only (no stat cards) -- stat cards only in overview
- **D-06:** Overview is the first main tab in sidebar -- shows dashboard summary of all categories/levels
- **D-07:** Overview has 3 sections: stat cards by category (2), stat cards by status (3), top 5 nearest deadline table
- **D-08:** Overview must call multiple targetLevel APIs (O2, O3, K2, K3, K4) then merge results -- use Promise.all
- **D-09:** Executive and Management show placeholder with EmptyState component + lucide icon
- **D-10:** Candidate status mapping: qualified->green, not_yet->amber, check_data->orange
- **D-11:** Probation status mapping: IN_PROGRESS->blue, COMPLETED->green, FAILED->red, EXTENDED->orange
- **D-12:** 4-level color coding for remaining days: >30 green, 15-30 yellow, 7-14 orange, <7 red
- **D-13:** Action buttons (export, import, add) -- UI only, not functional
- **D-14:** Action buttons shown only on sub-tab level pages, not overview
- **D-15:** Use SkeletonLoader for both stat cards and table loading states
- **D-16:** Error state uses EmptyState + retry button
- **D-17:** Re-fetch on every sub-tab change, no caching
- **D-18:** Pagination: "show X to Y of Z items" + prev/next + page numbers
- **D-19:** Probation: no separate overview -- stat cards + table on single page
- **D-20:** Search across 3 fields: name, position, department
- **D-21:** Probation uses same loading/error/pagination patterns as candidate list
- **D-22:** Create composable useCandidates.js for candidate API calls
- **D-23:** Create composable useProbation.js for probation API calls
- **D-24:** Backend sends snake_case -- frontend maps to camelCase in composable

### Claude's Discretion
- SequentialLoader component design (if needed)
- Exact Tailwind classes for pill buttons
- EmptyState illustration choice for executive/management placeholder
- Composable internal structure (reactive refs vs return objects)
- Table column widths and responsive breakpoints
- Pagination component implementation details

### Deferred Ideas (OUT OF SCOPE)
- Export/Import functional implementation -- DV-06, v2
- Add new candidate form/modal -- no backend POST /candidates endpoint
- Drill-down detail view per candidate -- DV-01, v2
- Probation task checklist per enrollment -- DV-02, v2
- Probation stakeholder display -- DV-03, v2
- K5 sub-tab -- no seed data or backend support
- Executive/Management full implementation -- AC-01, AC-02, v2
- Responsive mobile optimization -- out of scope v1
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CL-06 | Candidate List page with 4 main tabs (general, academic, executive, management) | Sidebar sub-menu already has children pattern; add "overview" as 5th item per D-01; route stays `candidates/:section?` |
| CL-07 | Sub-tabs within general: O1->O2, O2->O3 | Pill buttons with reactive state per D-02/D-04; API calls to `/candidates/O2` and `/candidates/O3` |
| CL-08 | Sub-tabs within academic: K1->K2, K2->K3, K3->K4 | Same pill pattern; API calls to `/candidates/K2`, `/candidates/K3`, `/candidates/K4` |
| CL-09 | Executive and Management show placeholder | EmptyState component exists with icon/title/description props per D-09 |
| CL-10 | Stat cards per sub-tab: total, qualified, not_yet | Per D-05: stat cards only in overview page; sub-tab pages show table only. Summary from API response `summary.total/qualified/not_yet/check_data` |
| CL-11 | Table columns: order, name, position, level, start date, due date, remaining days, status | API provides all fields: `full_name`, `current_position`, `current_level_name`, `level_start_date_thai`, `qualification_date_thai`, `remaining_days`, `status` |
| CL-12 | Status badges: qualified green, not_yet gray, check_data orange | Add 3 entries to StatusBadge.vue statusMap per D-10 |
| CL-13 | Search/filter by name and position | API supports `?search=` param filtering on first_name, last_name, position_name |
| CL-14 | Connect to backend API (replace mock data) | useCandidates.js composable wrapping useApi().get per D-22 |
| PT-06 | Probation stat cards: total, in_progress, near_deadline, overdue | API response includes `summary.total/in_progress/near_deadline/overdue` |
| PT-07 | Table columns: order, name, position, department, start date, end date, remaining days, status | API provides: `full_name`, `position_name`, `department`, `start_date_thai`, `end_date_thai`, `remaining_days`, `status` |
| PT-08 | Color-coded remaining days | Utility function per D-12: >30 green, 15-30 yellow, 7-14 orange, <7 red |
| PT-09 | Status badges: IN_PROGRESS, COMPLETED, FAILED, EXTENDED | Add 4 entries to StatusBadge.vue per D-11 |
| PT-10 | Search/filter by name, position, department | API supports `?search=` param filtering on full_name, position_name, department |
| PT-11 | Connect to backend API | useProbation.js composable wrapping useApi() per D-23 |
| SH-03 | Composable for candidate list API calls | useCandidates.js -- see Architecture Patterns section |
| SH-04 | Composable for probation API calls | useProbation.js -- see Architecture Patterns section |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vue | 3.5.x | UI framework | Already in project |
| vue-router | 4.5.x | Client-side routing | Already in project |
| pinia | 3.0.x | State management | Already in project |
| lucide-vue-next | 0.470.x | Icons | Already in project |
| @tailwindcss/vite | 4.1.x | CSS framework | Already in project |

### No New Dependencies Needed

This phase requires zero new npm packages. All necessary UI components, composables, and utilities exist in the codebase. The work is purely wiring existing patterns to real API endpoints.

## Architecture Patterns

### Project Structure (new files only)
```
frontend/src/
├── composables/
│   ├── useApi.js              # EXISTS - base API wrapper
│   ├── useCandidates.js       # NEW - candidate list API composable
│   └── useProbation.js        # NEW - probation API composable
├── components/
│   ├── StatusBadge.vue        # MODIFY - add 7 new status entries
│   ├── PaginationBar.vue      # NEW - reusable pagination component
│   ├── StatCard.vue           # EXISTS - no changes
│   ├── SkeletonLoader.vue     # EXISTS - no changes
│   └── EmptyState.vue         # EXISTS - no changes
├── pages/
│   ├── CandidateListsPage.vue # MAJOR REWRITE
│   └── ProbationEndPage.vue   # MAJOR REWRITE
└── components/
    └── AppSidebar.vue         # MODIFY - add overview + restructure sub-items
```

### Pattern 1: API Composable (useCandidates.js)
**What:** Wraps useApi() for candidate-specific endpoints with snake_case to camelCase mapping
**When to use:** All candidate list data fetching
**Example:**
```javascript
// frontend/src/composables/useCandidates.js
import { useApi } from '@/composables/useApi.js'

export function useCandidates() {
  const api = useApi()

  async function fetchByLevel(targetLevel, { search = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/candidates/${targetLevel}?${params}`)

    // Map snake_case to camelCase for component consumption
    return {
      success: result.success,
      data: result.data.map(mapCandidateRow),
      summary: result.summary, // { total, qualified, not_yet, check_data }
      pagination: result.pagination // { total, limit, offset, has_more }
    }
  }

  function mapCandidateRow(row) {
    return {
      personnelId: row.personnel_id,
      name: row.full_name,
      currentPosition: row.current_position,
      currentLevelCode: row.current_level_code,
      currentLevelName: row.current_level_name,
      levelStartDate: row.level_start_date_thai,
      qualificationDate: row.qualification_date_thai,
      remainingDays: row.remaining_days,
      status: row.status,
      department: row.department,
    }
  }

  return { fetchByLevel }
}
```

### Pattern 2: API Composable (useProbation.js)
**What:** Wraps useApi() for probation-specific endpoints
**Example:**
```javascript
// frontend/src/composables/useProbation.js
import { useApi } from '@/composables/useApi.js'

export function useProbation() {
  const api = useApi()

  async function fetchList({ search = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/probation?${params}`)
    return {
      success: result.success,
      data: result.data.map(mapProbationRow),
      summary: result.summary, // { total, in_progress, near_deadline, overdue }
      pagination: result.pagination
    }
  }

  function mapProbationRow(row) {
    return {
      enrollmentId: row.enrollment_id,
      personnelId: row.personnel_id,
      name: row.full_name,
      position: row.position_name,
      department: row.department,
      startDate: row.start_date_thai,
      endDate: row.end_date_thai,
      remainingDays: row.remaining_days,
      status: row.status,
    }
  }

  return { fetchList }
}
```

### Pattern 3: Remaining Days Color Utility
**What:** Shared function for 4-level color coding
**Example:**
```javascript
// Can live in either composable or a shared utils file
function getRemainingDaysClass(days) {
  if (days === null) return 'text-gray-400'
  if (days < 7) return 'text-red-600 font-medium'    // includes negative
  if (days <= 14) return 'text-orange-600'
  if (days <= 30) return 'text-yellow-600'
  return 'text-green-600'
}
```

### Pattern 4: Sidebar Sub-menu Structure
**What:** Sidebar already supports `children` array pattern. Need to add "overview" item.
**Current structure:**
```javascript
// AppSidebar.vue menuItems (current)
{
  id: 'candidates', label: 'Candidate Lists', icon: Users,
  children: [
    { id: 'general', label: 'ทั่วไป', to: '/candidates/general' },
    { id: 'academic', label: 'วิชาการ', to: '/candidates/academic' },
    { id: 'support', label: 'อำนวยการ', to: '/candidates/support' },
    { id: 'management', label: 'บริหาร', to: '/candidates/management' },
  ],
}
```
**Target structure:**
```javascript
// Add overview as first child
{
  id: 'candidates', label: 'Candidate Lists', icon: Users,
  children: [
    { id: 'overview', label: 'ภาพรวม', to: '/candidates/overview' },
    { id: 'general', label: 'ทั่วไป', to: '/candidates/general' },
    { id: 'academic', label: 'วิชาการ', to: '/candidates/academic' },
    { id: 'support', label: 'อำนวยการ', to: '/candidates/support' },
    { id: 'management', label: 'บริหาร', to: '/candidates/management' },
  ],
}
```

### Pattern 5: Sub-tab Pill Buttons (reactive, no router)
**What:** Per D-04, sub-tabs are reactive state within the component, not router links.
**Example:**
```html
<div class="flex gap-2">
  <button
    v-for="tab in subTabs"
    :key="tab.level"
    @click="activeSubTab = tab.level"
    class="px-4 py-2 text-sm rounded-full transition-colors"
    :class="activeSubTab === tab.level
      ? 'bg-blue-500 text-white'
      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'"
  >
    {{ tab.label }}
  </button>
</div>
```

### Pattern 6: Pagination Component
**What:** Reusable pagination bar matching screenshot design
**Props:** `total`, `limit`, `offset`, and emits `update:offset`
**Display:** "แสดง X ถึง Y จาก Z รายการ" + ก่อนหน้า/ถัดไป + page number buttons

### Anti-Patterns to Avoid
- **Router-based sub-tabs:** D-04 explicitly says sub-tabs do NOT change URL. Use `ref()` not `RouterLink`.
- **Client-side pagination of full dataset:** The API already handles `limit`/`offset` server-side. Do not fetch all records then paginate in JS.
- **Caching API responses:** D-17 says re-fetch every sub-tab change. HR data must be real-time.
- **Building stat cards on sub-tab pages:** D-05 says stat cards are overview-only. Sub-tab pages show table only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status badges | Custom badge logic per page | StatusBadge.vue with expanded statusMap | Already exists, just needs new entries |
| Loading states | Custom shimmer/pulse CSS | SkeletonLoader.vue with type="stat-cards" or type="table" | Already exists with correct types |
| Empty/error states | Custom error message divs | EmptyState.vue with icon + retry button slot | Already exists with slot for actions |
| Stat cards | Custom card HTML | StatCard.vue | Already exists with full prop support |
| API auth/error handling | Custom fetch wrapper | useApi().get/post/put/del | Already handles JWT, 401 redirect, error parsing |

## Common Pitfalls

### Pitfall 1: Sidebar Active State Detection
**What goes wrong:** Sidebar `isParentActive` checks `route.path === child.to` with exact match. Adding "overview" as `/candidates/overview` works, but the default redirect behavior must be considered.
**Why it happens:** The current route `candidates/:section?` with optional section param means `/candidates` alone could match.
**How to avoid:** Default the section prop to `'overview'` instead of `'general'`. Update the router default redirect or ensure the sidebar "overview" link highlights correctly.
**Warning signs:** No sidebar item highlighted when navigating to `/candidates` without section param.

### Pitfall 2: Overview Page Promise.all Error Handling
**What goes wrong:** One failed API call in Promise.all rejects the entire batch, showing error state even though 4/5 calls succeeded.
**Why it happens:** Promise.all fails fast on first rejection.
**How to avoid:** Use `Promise.allSettled()` instead, then process results individually. Show partial data with warning for failed levels.
**Warning signs:** Overview page showing full error when only one level has no data.

### Pitfall 3: Search Debouncing
**What goes wrong:** Typing in search field fires API call on every keystroke, overwhelming the backend.
**Why it happens:** `v-model` on input updates reactive ref immediately; if watched, it triggers fetches.
**How to avoid:** Add a 300ms debounce on search. Use a `watch` with debounce or a manual `setTimeout` pattern. Alternatively, use a search button / Enter key trigger.
**Warning signs:** Multiple concurrent API calls visible in network tab while typing.

### Pitfall 4: Pagination Offset Reset
**What goes wrong:** User is on page 3, changes sub-tab, and sees "no data" because offset is still 40 but new tab has only 10 records.
**Why it happens:** Offset not reset when sub-tab or search changes.
**How to avoid:** Reset offset to 0 whenever `activeSubTab` or `search` changes. Use a `watch` on these refs.
**Warning signs:** Empty table after switching tabs when data exists.

### Pitfall 5: StatusBadge Key Conflicts
**What goes wrong:** Existing statusMap keys (`completed`, `ready`) could conflict with new probation status keys if not careful about naming.
**Why it happens:** StatusBadge uses the raw status string from API as lookup key.
**How to avoid:** Backend sends `qualified`, `not_yet`, `check_data` for candidates and `IN_PROGRESS`, `COMPLETED`, `FAILED`, `EXTENDED` for probation. These are all unique. Add them directly to statusMap. Note probation uses UPPER_CASE which won't conflict with existing lowercase keys.
**Warning signs:** Wrong badge color/label appearing.

### Pitfall 6: Overview Stat Card Math
**What goes wrong:** Overview needs to sum counts from 5 different API calls (O2, O3, K2, K3, K4). Double-counting possible if summary logic is wrong.
**Why it happens:** Each API call returns its own `summary.total/qualified/not_yet`. Summing all "total" gives correct grand total since each call targets different source level personnel.
**How to avoid:** Sum `summary.total` from O2+O3 for "general count" and K2+K3+K4 for "academic count". Sum all `summary.qualified` for "qualified total". The API already segments by target level so no overlap occurs.
**Warning signs:** Total count in overview not matching sum of individual tab counts.

## Code Examples

### Backend API Response Shape: Candidates
```json
// GET /candidates/K2?search=&limit=20&offset=0
{
  "success": true,
  "data": [
    {
      "personnel_id": 1,
      "full_name": "นายสมชาย ใจดี",
      "current_position": "นักวิชาการคอมพิวเตอร์",
      "current_level_code": "K1",
      "current_level_start_date": "2020-03-15",
      "education_level": "BACHELOR",
      "min_years": 6,
      "department": "กองบริหารงานบุคคล",
      "qualification_date": "2026-03-15",
      "remaining_days": -7,
      "status": "qualified",
      "qualification_date_thai": "15 มี.ค. 2569",
      "level_start_date_thai": "15 มี.ค. 2563",
      "current_level_name": "ปฏิบัติการ"
    }
  ],
  "summary": {
    "total": 50,
    "qualified": 15,
    "not_yet": 30,
    "check_data": 5
  },
  "pagination": {
    "total": 50,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

### Backend API Response Shape: Probation
```json
// GET /probation?search=&limit=20&offset=0
{
  "success": true,
  "data": [
    {
      "enrollment_id": 1,
      "personnel_id": 5,
      "full_name": "นายวีระ สุขสวัสดิ์",
      "position_name": "นักวิชาการ",
      "department": "กองบริหารงานบุคคล",
      "start_date": "2025-10-01",
      "end_date": "2026-03-31",
      "remaining_days": 9,
      "status": "IN_PROGRESS",
      "total_tasks": 5,
      "completed_tasks": 2,
      "start_date_thai": "1 ต.ค. 2568",
      "end_date_thai": "31 มี.ค. 2569"
    }
  ],
  "summary": {
    "total": 20,
    "in_progress": 15,
    "near_deadline": 5,
    "overdue": 3
  },
  "pagination": {
    "total": 20,
    "limit": 20,
    "offset": 0,
    "has_more": false
  }
}
```

### StatusBadge Additions
```javascript
// Add to StatusBadge.vue statusMap
// Candidate statuses
qualified: { label: 'ครบกำหนด', class: 'bg-green-50 text-green-700' },
not_yet: { label: 'รอดำเนินการ', class: 'bg-amber-50 text-amber-700' },
check_data: { label: 'ตรวจสอบข้อมูล', class: 'bg-orange-50 text-orange-700' },

// Probation statuses
IN_PROGRESS: { label: 'กำลังดำเนินการ', class: 'bg-blue-50 text-blue-700' },
COMPLETED: { label: 'ผ่านทดลอง', class: 'bg-green-50 text-green-700' },
FAILED: { label: 'ไม่ผ่าน', class: 'bg-red-50 text-red-700' },
EXTENDED: { label: 'ขยายเวลา', class: 'bg-orange-50 text-orange-700' },
```

### Sub-tab Configuration Map
```javascript
// Category -> sub-tab definitions
const subTabConfig = {
  general: [
    { level: 'O2', label: 'ชำนาญงาน' },
    { level: 'O3', label: 'อาวุโส' },
  ],
  academic: [
    { level: 'K2', label: 'ชำนาญการ' },
    { level: 'K3', label: 'ชำนาญการพิเศษ' },
    { level: 'K4', label: 'เชี่ยวชาญ' },
  ],
}
```

### Screenshot Design Reference Summary
From the two screenshots analyzed:
- **Breadcrumb:** Home icon / {category name} at top
- **Page title:** "รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง ({category})" with subtitle
- **Action buttons:** Top-right: green "ส่งออก", green "นำเข้า", blue "+ เพิ่มรายชื่อ"
- **Pill sub-tabs:** Blue fill for active, white/bordered for inactive, rounded-full
- **Search:** Input with placeholder "ค้นหาชื่อ หรือตำแหน่ง..." + filter button (ตัวกรอง)
- **Table columns:** ชื่อ-นามสกุล, ตำแหน่งปัจจุบัน, ระดับตำแหน่ง, วันที่ครบกำหนด, จำนวนวันที่เหลือ, สถานะ, การดำเนินการ
- **Action icons:** Eye (view), Pencil (edit), Trash (delete) -- UI only
- **Pagination:** "แสดง 1 ถึง 3 จาก 3 รายการ" + ก่อนหน้า [1] ถัดไป
- **Status colors:** Green "ครบกำหนด", Yellow "รอดำเนินการ", Red "เกินกำหนด"
- **Remaining days color:** Green for 45 days, yellow for 28 days, red for "เกิน 5 วัน"

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded mock data arrays | API composables with useApi() | Phase 3 (now) | Pages become dynamic |
| RouterLink tabs at top of page | Sidebar sub-menu + pill button sub-tabs | Phase 3 (now) | Matches screenshot design |
| Simple ternary for day coloring | 4-level color function | Phase 3 (now) | Better UX for urgency |
| No pagination | Server-side pagination with UI | Phase 3 (now) | Handles large datasets |

## Open Questions

1. **Sidebar active state for overview default**
   - What we know: Route is `candidates/:section?` where section is optional. Default was 'general'.
   - What's unclear: Should `/candidates` (no section) redirect to `/candidates/overview` or just render overview?
   - Recommendation: Set the router default section prop to `'overview'` and let the sidebar highlight naturally. No redirect needed since the component handles it via props.

2. **Search debounce vs button trigger**
   - What we know: Current mock pages use instant `v-model` filtering (client-side). With API calls, instant search is expensive.
   - What's unclear: Screenshot shows a "ตัวกรอง" (filter) button next to search. Should search require button click?
   - Recommendation: Use 300ms debounce on input with automatic search. The filter button can be UI-only for v1 (no advanced filters yet).

3. **Overview top-5 table -- which API provides this?**
   - What we know: Overview needs top 5 nearest deadline across all levels. No single API returns cross-level data.
   - What's unclear: Must client merge all 5 API responses and sort.
   - Recommendation: In the Promise.allSettled results, concatenate all `data` arrays, sort by `remaining_days` ascending (nulls last), take first 5. This works since dataset is small (hundreds).

## Sources

### Primary (HIGH confidence)
- `backend/QualificationEngine.php` -- verified API response shape with exact field names
- `backend/routes/probation.php` -- verified probation response shape with summary fields
- `backend/routes/candidates.php` -- verified valid target levels: K2, K3, K4, O2, O3
- `backend/helpers.php` -- verified Thai date format and level name mapping functions
- `frontend/src/composables/useApi.js` -- verified useApi() returns { get, post, put, del }
- `frontend/src/components/StatusBadge.vue` -- verified existing statusMap keys and extension pattern
- `frontend/src/components/AppSidebar.vue` -- verified children array pattern for expandable menus
- `frontend/src/components/SkeletonLoader.vue` -- verified type prop supports "stat-cards" and "table"
- `frontend/src/components/EmptyState.vue` -- verified icon/title/description props + default slot
- `frontend/src/components/StatCard.vue` -- verified prop interface: label, value, icon, iconBgClass, iconClass
- `docs/scrennshorts/1774147879491.jpg` -- screenshot for general tab design
- `docs/scrennshorts/1774147914659.jpg` -- screenshot for academic tab design

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions D-01 through D-24 -- user-confirmed design decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, zero new dependencies
- Architecture: HIGH -- patterns derived from existing codebase + confirmed API contracts
- Pitfalls: HIGH -- identified from code analysis of actual components and API shapes

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- no external dependency changes)
