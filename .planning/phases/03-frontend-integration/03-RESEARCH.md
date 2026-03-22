# Phase 3: Frontend Integration - Research

**Researched:** 2026-03-22 (re-researched)
**Domain:** Vue 3 SPA frontend integration with PHP REST API
**Confidence:** HIGH

## Summary

This phase wires two existing mock-data pages (CandidateListsPage.vue and ProbationEndPage.vue) to live backend APIs completed in Phase 2. The work is entirely frontend: creating composables for API calls, restructuring navigation (sidebar sub-menus + pill sub-tabs), adding status badge mappings, implementing color-coded remaining days, pagination, loading/error states, and placeholder pages for unimplemented categories.

The existing codebase uses Vue 3 Composition API with `<script setup>`, Pinia stores, and a custom `useApi()` composable wrapping the Fetch API with JWT auto-attachment. All UI components needed (StatCard, StatusBadge, SkeletonLoader, EmptyState) already exist and are reusable. The sidebar (AppSidebar.vue) already has an expandable sub-menu pattern with `children` arrays and `openSubmenus` reactive Set. The router uses `candidates/:section?` with props passthrough.

Re-research identified key corrections: (1) probation summary counts are computed from paginated rows only -- a backend limitation affecting stat card accuracy, (2) SkeletonLoader stat-cards type renders a fixed 4-column grid which does not match the overview's 2+3 card layout, (3) screenshot analysis reveals the "remaining days" column shows "เกิน X วัน" for overdue entries (negative remaining_days), requiring a display formatting function.

**Primary recommendation:** Create two composables (`useCandidates.js`, `useProbation.js`) wrapping `useApi()`, then rewrite CandidateListsPage and ProbationEndPage to use them. Add "overview" as a sidebar sub-menu item, restructure sub-tabs as reactive pill buttons within the page component, and build a reusable PaginationBar component.

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
| CL-10 | Stat cards per sub-tab: total, qualified, not_yet | Per D-05: stat cards only in overview page; sub-tab pages show table only. Summary from API `summary.total/qualified/not_yet/check_data` |
| CL-11 | Table columns: order, name, position, level, start date, due date, remaining days, status | API provides: `full_name`, `current_position`, `current_level_name`, `level_start_date_thai`, `qualification_date_thai`, `remaining_days`, `status`. Screenshot also shows "การดำเนินการ" action column with eye/pencil/trash icons |
| CL-12 | Status badges: qualified green, not_yet gray, check_data orange | Add 3 entries to StatusBadge.vue statusMap per D-10 |
| CL-13 | Search/filter by name and position | API supports `?search=` param filtering on first_name, last_name, position_name |
| CL-14 | Connect to backend API (replace mock data) | useCandidates.js composable wrapping useApi().get per D-22 |
| PT-06 | Probation stat cards: total, in_progress, near_deadline, overdue | API response `summary.total/in_progress/near_deadline/overdue`. NOTE: summary computed from paginated rows only -- see Pitfall 7 |
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
      totalTasks: row.total_tasks,
      completedTasks: row.completed_tasks,
    }
  }

  return { fetchList }
}
```

### Pattern 3: Remaining Days Color Utility + Display Formatting
**What:** Shared function for 4-level color coding AND display formatting for overdue entries
**Critical insight from screenshot:** Overdue entries display as "เกิน X วัน" (e.g., "เกิน 5 วัน"), not negative numbers. The color function and display function are separate concerns.
**Example:**
```javascript
// Can live in either composable or a shared utils file
export function getRemainingDaysClass(days) {
  if (days === null) return 'text-gray-400'
  if (days < 7) return 'text-red-600 font-medium'    // includes negative (overdue)
  if (days <= 14) return 'text-orange-600'
  if (days <= 30) return 'text-yellow-600'
  return 'text-green-600'
}

export function formatRemainingDays(days) {
  if (days === null) return '-'
  if (days < 0) return `เกิน ${Math.abs(days)} วัน`
  return `${days} วัน`
}
```

### Pattern 4: Sidebar Sub-menu Structure
**What:** Sidebar already supports `children` array pattern with `openSubmenus` reactive Set.
**Current sidebar structure (verified from AppSidebar.vue lines 113-121):**
```javascript
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
**Active state detection:** Uses `route.path === child.to` on line 45. This works for all sidebar children since each has a unique path. The `isParentActive` on line 146 checks `item.children?.some(c => route.path === c.to)` -- this highlights the parent "Candidate Lists" when any child is active. Important: if user navigates to `/candidates` (no section param), NO sidebar child will be highlighted. The CandidateListsPage section prop defaults to `'general'` currently. Change this default to `'overview'`.

### Pattern 5: Sub-tab Pill Buttons (reactive, no router)
**What:** Per D-04, sub-tabs are reactive state within the component, not router links.
**Screenshot design:** Blue fill (bg-blue-500 text-white) for active, white/bordered for inactive, rounded-full shape.
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
**Display format (from screenshot):** "แสดง 1 ถึง 3 จาก 3 รายการ" + ก่อนหน้า [1] ถัดไป
**Implementation notes:**
- Compute `from = offset + 1`, `to = Math.min(offset + limit, total)`
- Page numbers: show current page +/- 2 pages with ellipsis
- Disable "ก่อนหน้า" on first page, "ถัดไป" on last page

### Pattern 7: Page Title + Breadcrumb (from screenshot)
**What:** Each category page has a consistent header layout
**Screenshot verified layout:**
```
Breadcrumb: Home icon / {ทั่วไป}
Title: รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง ({ประเภท})
Subtitle: จัดการข้อมูลผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งในสายงาน{ประเภท}
Action buttons (top-right): ส่งออก (green), นำเข้า (green), + เพิ่มรายชื่อ (blue)
```

### Anti-Patterns to Avoid
- **Router-based sub-tabs:** D-04 explicitly says sub-tabs do NOT change URL. Use `ref()` not `RouterLink`.
- **Client-side pagination of full dataset:** The API already handles `limit`/`offset` server-side. Do not fetch all records then paginate in JS.
- **Caching API responses:** D-17 says re-fetch every sub-tab change. HR data must be real-time.
- **Building stat cards on sub-tab pages:** D-05 says stat cards are overview-only. Sub-tab pages show table only.
- **Using SkeletonLoader stat-cards type for overview:** It renders a fixed `lg:grid-cols-4` grid. Overview needs 2 cards then 3 cards. Either use multiple SkeletonLoader instances or render custom pulse divs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status badges | Custom badge logic per page | StatusBadge.vue with expanded statusMap | Already exists, just needs 7 new entries |
| Loading states | Custom shimmer/pulse CSS | SkeletonLoader.vue with type="stat-cards" or type="table" | Already exists with correct types |
| Empty/error states | Custom error message divs | EmptyState.vue with icon + retry button slot | Already exists with slot for actions |
| Stat cards | Custom card HTML | StatCard.vue | Already exists with full prop support (label, value, icon, iconBgClass, iconClass) |
| API auth/error handling | Custom fetch wrapper | useApi().get/post/put/del | Already handles JWT, 401 redirect, error parsing |
| Thai date formatting | Frontend date conversion | Backend provides `*_thai` fields | Backend helpers.php already formats all dates in Thai Buddhist Era |
| Level code to name | Frontend mapping table | Backend provides `current_level_name` | Backend helpers.php getLevelName() already called |

## Common Pitfalls

### Pitfall 1: Sidebar Active State for Default Route
**What goes wrong:** Navigating to `/candidates` (no section param) leaves no sidebar child highlighted because none match `route.path === child.to`.
**Why it happens:** The route is `candidates/:section?` where section is optional. CandidateListsPage defaults section prop to `'general'` but the URL stays `/candidates`.
**How to avoid:** Change the component's section prop default from `'general'` to `'overview'`. The sidebar `isParentActive` will still highlight the parent since `route.path.startsWith('/candidates')` is implied by the children check. For the specific child highlight, ensure the route redirects `/candidates` to `/candidates/overview` using `redirect` in the router config.
**Warning signs:** No sidebar item highlighted when navigating to `/candidates`.

### Pitfall 2: Overview Page Promise.all Error Handling
**What goes wrong:** One failed API call in Promise.all rejects the entire batch, showing error state even though 4/5 calls succeeded.
**Why it happens:** Promise.all fails fast on first rejection.
**How to avoid:** Use `Promise.allSettled()` instead, then process results individually. Show partial data with warning for failed levels.
**Warning signs:** Overview page showing full error when only one level has no data.

### Pitfall 3: Search Debouncing
**What goes wrong:** Typing in search field fires API call on every keystroke, overwhelming the backend.
**Why it happens:** If `search` ref is watched, it triggers fetches on every character change.
**How to avoid:** Add a 300ms debounce. Use a manual `setTimeout`/`clearTimeout` pattern since no debounce utility is installed. Alternatively, trigger search on Enter key press only. The screenshot shows a separate "ตัวกรอง" (filter) button but search input has placeholder "ค้นหาชื่อ หรือตำแหน่ง..." suggesting type-to-search behavior.
**Warning signs:** Multiple concurrent API calls visible in network tab while typing.

### Pitfall 4: Pagination Offset Reset
**What goes wrong:** User is on page 3, changes sub-tab, and sees "no data" because offset is still 40 but new tab has only 10 records.
**Why it happens:** Offset not reset when sub-tab or search changes.
**How to avoid:** Reset offset to 0 whenever `activeSubTab` or `search` changes. Use a `watch` on these refs to reset offset.
**Warning signs:** Empty table after switching tabs when data exists.

### Pitfall 5: StatusBadge Key Case Sensitivity
**What goes wrong:** Probation uses UPPER_CASE status keys (`IN_PROGRESS`, `COMPLETED`) while candidates use lowercase (`qualified`, `not_yet`). If someone accidentally lowercases probation statuses, badges won't render correctly.
**Why it happens:** StatusBadge uses raw status string as lookup key. Backend sends different cases for different features.
**How to avoid:** Add entries to statusMap exactly matching what the backend sends. Verified: candidates send `qualified`, `not_yet`, `check_data` (lowercase). Probation sends `IN_PROGRESS`, `COMPLETED`, `FAILED`, `EXTENDED` (UPPER_CASE). These are all unique and won't conflict with existing keys (`upcoming`, `pending`, `overdue`, `eligible`, `completed`, `ready`, `active`). Note: existing `completed` (lowercase) returns "เสร็จสิ้น" which is different from probation's `COMPLETED` (uppercase) returning "ผ่านทดลอง".
**Warning signs:** Wrong badge color/label appearing.

### Pitfall 6: Overview Stat Card Math
**What goes wrong:** Overview sums counts from 5 API calls. Incorrect grouping could double-count.
**Why it happens:** Each API call returns its own `summary.total/qualified/not_yet/check_data`. These are per-targetLevel and don't overlap.
**How to avoid:** Sum `summary.total` from O2+O3 for "general count" and K2+K3+K4 for "academic count". Sum all `summary.qualified` for status-based "qualified total". The API already segments by target level so no overlap occurs between targetLevels.
**Warning signs:** Total count in overview not matching sum of individual tab counts.

### Pitfall 7: Probation Summary Counts from Paginated Rows (NEW - missed in previous research)
**What goes wrong:** Probation stat cards show wrong counts when there are more records than the page limit.
**Why it happens:** Looking at `backend/routes/probation.php` lines 99-117, the summary (`in_progress`, `near_deadline`, `overdue`) is computed by iterating over `$rows` -- which is the PAGINATED result set (LIMIT/OFFSET applied). So if there are 50 records but only 20 are fetched, the summary only reflects those 20 rows. The `total` field IS correct (comes from COUNT query).
**How to avoid:** For probation stat cards, use `summary.total` which is correct. For the status breakdown (`in_progress`, `near_deadline`, `overdue`), accept the limitation for v1 since (a) dataset is small (tens of records) and (b) default limit=20 likely covers all records. If needed, fetch with a large limit for summary or fix backend later.
**Warning signs:** Stat card numbers change when paginating through results.

### Pitfall 8: Remaining Days Display Format (NEW - from screenshot analysis)
**What goes wrong:** Displaying negative remaining_days as "-5 วัน" instead of "เกิน 5 วัน" as shown in the screenshot.
**Why it happens:** Screenshot clearly shows "เกิน 5 วัน" for the overdue entry (red text), not a negative number.
**How to avoid:** Create a `formatRemainingDays()` function that converts negative values: `days < 0` returns `เกิน ${Math.abs(days)} วัน`, positive returns `${days} วัน`.
**Warning signs:** Negative numbers appearing in the remaining days column.

## Code Examples

### Verified Backend API Response Shape: Candidates
```json
// GET /candidates/K2?search=&limit=20&offset=0
// Source: QualificationEngine.php computeForLevel() lines 144-159
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
      "min_years": 6.0,
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
**Note:** `summary` counts are computed from the FULL dataset (separate COUNT/SUM query in QualificationEngine lines 108-124), so they are accurate regardless of pagination. This is different from probation.

### Verified Backend API Response Shape: Probation
```json
// GET /probation?search=&limit=20&offset=0
// Source: routes/probation.php getProbationList() lines 63-136
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
**WARNING:** `summary.in_progress/near_deadline/overdue` are computed from paginated rows only (see Pitfall 7). `summary.total` is from COUNT query and is accurate.

### StatusBadge Additions (verified no key conflicts)
```javascript
// Add to StatusBadge.vue statusMap
// Existing keys: upcoming, pending, overdue, eligible, completed, ready, active

// Candidate statuses (lowercase from backend)
qualified: { label: 'ครบกำหนด', class: 'bg-green-50 text-green-700' },
not_yet: { label: 'รอดำเนินการ', class: 'bg-amber-50 text-amber-700' },
check_data: { label: 'ตรวจสอบข้อมูล', class: 'bg-orange-50 text-orange-700' },

// Probation statuses (UPPER_CASE from backend)
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

### Page Title Map (from screenshot)
```javascript
const categoryConfig = {
  overview: {
    title: 'ภาพรวมบัญชีรายชื่อผู้มีคุณสมบัติ',
    subtitle: 'สรุปภาพรวมบัญชีรายชื่อผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งทุกประเภท',
    breadcrumb: 'ภาพรวม',
  },
  general: {
    title: 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง (ทั่วไป)',
    subtitle: 'จัดการข้อมูลผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งในสายงานทั่วไป',
    breadcrumb: 'ทั่วไป',
  },
  academic: {
    title: 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง (วิชาการ)',
    subtitle: 'จัดการข้อมูลผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งในสายงานวิชาการ',
    breadcrumb: 'วิชาการ',
  },
  support: {
    title: 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง (อำนวยการ)',
    subtitle: 'จัดการข้อมูลผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งในสายงานอำนวยการ',
    breadcrumb: 'อำนวยการ',
  },
  management: {
    title: 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง (บริหาร)',
    subtitle: 'จัดการข้อมูลผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งในสายงานบริหาร',
    breadcrumb: 'บริหาร',
  },
}
```

### Action Buttons Layout (from screenshot)
```html
<!-- Top-right action buttons, shown only on sub-tab level pages (D-14) -->
<div class="flex gap-2">
  <button class="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg">
    <Download class="w-4 h-4" /> ส่งออก
  </button>
  <button class="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg">
    <Upload class="w-4 h-4" /> นำเข้า
  </button>
  <button class="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg">
    <Plus class="w-4 h-4" /> เพิ่มรายชื่อ
  </button>
</div>
```

### Table Action Column Icons (from screenshot)
```html
<!-- Per-row action icons: view, edit, delete (UI only) -->
<td class="px-6 py-3">
  <div class="flex items-center gap-2">
    <button class="p-1 text-gray-400 hover:text-blue-600"><Eye class="w-4 h-4" /></button>
    <button class="p-1 text-gray-400 hover:text-blue-600"><Pencil class="w-4 h-4" /></button>
    <button class="p-1 text-gray-400 hover:text-red-600"><Trash2 class="w-4 h-4" /></button>
  </div>
</td>
```

### Existing Component Props Reference (verified from source)
```
StatCard.vue props:
  label: String
  value: [String, Number]
  icon: Object (lucide component)
  change: String (optional, e.g. "+5%")
  iconBgClass: String (default: 'bg-blue-50')
  iconClass: String (default: 'text-blue-600')
  sparkline: Boolean (default: false)

SkeletonLoader.vue props:
  type: String (default: 'card', valid: 'stat-cards' | 'table' | 'card')
  rows: Number (default: 4, used for table/card row count)

EmptyState.vue props:
  icon: Object (default: Inbox from lucide)
  title: String (default: 'ไม่พบข้อมูล')
  description: String (default: 'ยังไม่มีข้อมูลในขณะนี้')
  slot: default (for action button like retry)

StatusBadge.vue props:
  status: String (required, lookup key into statusMap)
```

### Screenshot Design Reference Summary
From the two screenshots analyzed (`docs/scrennshorts/1774147879491.jpg` and `1774147914659.jpg`):
- **Breadcrumb:** Home icon / {category name} at top left
- **Page title:** "รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง ({category})" with subtitle below
- **Action buttons:** Top-right aligned with title: green "ส่งออก" (Download icon), green "นำเข้า" (Upload icon), blue "+ เพิ่มรายชื่อ"
- **Pill sub-tabs:** Blue fill (bg-blue-500 text-white) for active, white/bordered for inactive, rounded-full shape
- **Search:** Input with placeholder "ค้นหาชื่อ หรือตำแหน่ง..." + "ตัวกรอง" filter button on the right
- **Table columns (screenshot order):** ชื่อ-นามสกุล, ตำแหน่งปัจจุบัน, ระดับตำแหน่ง, วันที่ครบกำหนด, จำนวนวันที่เหลือ, สถานะ, การดำเนินการ
- **Table header style:** `bg-gray-50 text-gray-500 text-left text-sm font-medium`
- **Action icons per row:** Eye (view), Pencil (edit), Trash (delete) -- all UI only
- **Pagination:** "แสดง 1 ถึง 3 จาก 3 รายการ" left-aligned + "ก่อนหน้า [1] ถัดไป" right-aligned
- **Status badge colors:** Green "ครบกำหนด", Orange "รอดำเนินการ", Red "เกินกำหนด"
- **Remaining days display:** Green "45 วัน", Yellow-orange "28 วัน", Red "เกิน 5 วัน" (negative shown as "เกิน X วัน")
- **Sidebar:** "Candidate Lists" expanded showing ทั่วไป (highlighted blue), วิชาการ, อำนวยการ, บริหาร as sub-items with dot indicators
- **Note:** Screenshot shows "ลำดับ" column header is NOT visible in the table but is described in requirements CL-11. The screenshot table starts directly with ชื่อ-นามสกุล. Implement with row numbering per requirements.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded mock data arrays | API composables with useApi() | Phase 3 (now) | Pages become dynamic |
| RouterLink tabs at top of page | Sidebar sub-menu + pill button sub-tabs | Phase 3 (now) | Matches screenshot design |
| Simple ternary `<= 30 ? red : gray` for day coloring | 4-level color function + "เกิน X วัน" format | Phase 3 (now) | Better UX for urgency |
| No pagination | Server-side pagination with PaginationBar UI | Phase 3 (now) | Handles large datasets |
| Tab-based navigation via RouterLink at page top | Section prop from router + reactive sub-tabs within page | Phase 3 (now) | Cleaner architecture per D-04 |

## Open Questions

1. **Sidebar active state for overview default**
   - What we know: Route is `candidates/:section?` where section is optional. Default was 'general'.
   - What's unclear: Should `/candidates` (no section) redirect to `/candidates/overview` or just render overview?
   - Recommendation: Add a redirect in router config: `{ path: 'candidates', redirect: '/candidates/overview' }` before the `candidates/:section?` route. This ensures the URL always has a section, sidebar highlighting works, and the user sees overview by default. Alternatively, just change the section prop default to `'overview'` without redirect -- simpler but URL shows `/candidates` without `/overview`.

2. **Search debounce vs button trigger**
   - What we know: Current mock pages use instant `v-model` filtering (client-side). With API calls, instant search is expensive.
   - What's unclear: Screenshot shows a "ตัวกรอง" (filter) button next to search. Should search require button click?
   - Recommendation: Use 300ms debounce on input change for automatic search. The "ตัวกรอง" button can be UI-only for v1 (no advanced filters implemented yet). Also support Enter key for immediate search.

3. **Overview top-5 table -- which API provides this?**
   - What we know: Overview needs top 5 nearest deadline across all levels. No single API returns cross-level data.
   - What's unclear: Must client merge all 5 API responses and sort.
   - Recommendation: In the Promise.allSettled results, concatenate all `data` arrays from fulfilled results, sort by `remaining_days` ascending (nulls last), take first 5. This works since overview fetches all data from 5 levels anyway. Use a large enough limit (e.g., limit=100 per level) or just use the default limit=20 which should be sufficient for getting the top 5 nearest-deadline across all levels.

4. **Probation summary accuracy with pagination (NEW)**
   - What we know: Backend computes summary from paginated rows only (Pitfall 7).
   - What's unclear: Will the default limit=20 always cover all probation records?
   - Recommendation: For v1, accept the limitation. The dataset is expected to be small (tens of new civil servants per batch). If needed, pass a large limit (e.g., 1000) on first fetch just for summary, but this adds complexity. Simpler approach: use only `summary.total` from the backend and compute near_deadline/overdue client-side from the data array IF all records fit in one page. For now, just use what the backend provides.

## Sources

### Primary (HIGH confidence)
- `backend/QualificationEngine.php` lines 31-159 -- verified API response shape with exact field names, summary query is separate from data query (accurate counts)
- `backend/routes/probation.php` lines 63-136 -- verified probation response shape, found summary computed from paginated rows only
- `backend/routes/candidates.php` lines 40-41 -- verified valid target levels: K2, K3, K4, O2, O3
- `backend/helpers.php` lines 15-63 -- verified Thai date format (`D เดือน ปี+543`) and level name mapping (K1-K5, O1-O3, M1-M2, S1-S2)
- `frontend/src/composables/useApi.js` lines 40-48 -- verified useApi() returns { get, post, put, del, upload }
- `frontend/src/components/StatusBadge.vue` lines 17-25 -- verified existing statusMap keys: upcoming, pending, overdue, eligible, completed, ready, active
- `frontend/src/components/AppSidebar.vue` lines 110-135 -- verified menuItems structure with children array, openSubmenus Set, isParentActive check
- `frontend/src/components/SkeletonLoader.vue` lines 1-48 -- verified type prop ("stat-cards" renders 4-col grid, "table" renders rows), rows prop
- `frontend/src/components/EmptyState.vue` lines 1-21 -- verified icon/title/description props + default slot for action buttons
- `frontend/src/components/StatCard.vue` lines 30-41 -- verified prop interface: label, value, icon, iconBgClass, iconClass, change, sparkline
- `frontend/src/router/index.js` lines 22-26 -- verified `candidates/:section?` route with `props: true`
- `frontend/src/pages/CandidateListsPage.vue` -- verified current mock data structure, section prop default 'general', RouterLink tabs (to be replaced)
- `frontend/src/pages/ProbationEndPage.vue` -- verified current mock data, status values: upcoming/ready/overdue (to be replaced)
- `docs/scrennshorts/1774147879491.jpg` -- screenshot for general tab design (sidebar, pills, table, pagination, action buttons, remaining days colors)
- `docs/scrennshorts/1774147914659.jpg` -- screenshot for academic tab design (4 pill tabs, same table pattern)

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions D-01 through D-24 -- user-confirmed design decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, zero new dependencies
- Architecture: HIGH -- patterns derived from existing codebase + verified API contracts from source code
- Pitfalls: HIGH -- identified from code analysis of actual components, API source, and screenshot comparison. Pitfall 7 (probation summary) and Pitfall 8 (remaining days format) are new findings from deeper source code review.

**Changes from previous research:**
- Added Pitfall 7: probation summary computed from paginated rows only
- Added Pitfall 8: remaining days display format ("เกิน X วัน" for overdue)
- Added `formatRemainingDays()` function to Pattern 3
- Added Pattern 7: page title + breadcrumb layout from screenshot
- Added action buttons HTML and table action icons from screenshot analysis
- Added SkeletonLoader anti-pattern note (fixed 4-col grid vs overview's 2+3 layout)
- Added verified component props reference section
- Clarified candidate summary is accurate (separate query) vs probation summary (paginated rows)

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- no external dependency changes)
