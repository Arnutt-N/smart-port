# Phase 6: Frontend CRUD Pages - Research

**Researched:** 2026-03-23
**Domain:** Vue 3 CRUD pages with modal forms, autocomplete, and approval workflow
**Confidence:** HIGH

## Summary

Phase 6 replaces three PlaceholderPage routes (`/time-counting`, `/time-difference`, `/position-compare`) with full CRUD Vue 3 pages. The backend APIs (Phase 5) are complete and follow a consistent pattern: GET list with pagination, GET detail, POST create, PUT update, DELETE. All three pages follow the established ProbationEndPage layout pattern (breadcrumb, stat cards, search, table, pagination) with the addition of modal dialogs for create/edit and confirmation dialogs for delete/approve/reject.

The existing codebase provides all necessary reusable components (StatCard, StatusBadge, PaginationBar, SkeletonLoader, EmptyState) and a proven composable pattern (useProbation.js). The work is primarily page assembly and composable creation -- no new infrastructure is needed. The main complexity lies in the Diverse Experience form (many fields, two-column from/to layout, 4-checkbox diff computation) and the Position Equivalence approval workflow (conditional action buttons, approve modal with date inputs).

**Primary recommendation:** Create 3 composables following useProbation.js pattern, then 3 page components following ProbationEndPage.vue pattern, with shared modal/confirmation dialog components built as simple overlay divs with Tailwind.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: All 3 pages follow ProbationEndPage layout: breadcrumb -> page header -> stat cards -> search bar -> data table -> PaginationBar
- D-02: Stat cards use existing StatCard component with lucide icons
- D-03: Search bar uses debounced input with Thai IME composition guard
- D-04: Data table uses raw `<table>` with Tailwind, not a table library
- D-05: Loading state uses SkeletonLoader, empty state uses EmptyState, error state with retry
- D-06: Create and edit use modal dialogs (not inline or slide-out)
- D-07: Personnel selection via searchable text input calling `/civil-servants?search=X` for autocomplete
- D-08: Job series selection (supportive page) via text input with autocomplete from loaded supportive_job_series
- D-09: Date inputs use native `<input type="date">` with Buddhist Era display in tables
- D-10: Form validation with red border + Thai error messages
- D-11 through D-22: Specific table columns, form fields, and behavior per page (see CONTEXT.md)
- D-23: Create 3 composables: useSupportive.js, useDiverse.js, useEquivalence.js
- D-24: Each composable returns fetchList(), fetchDetail(), create(), update(), remove()
- D-25: All text in Thai, page titles match sidebar labels
- D-26: Date display in tables always Buddhist Era (backend provides *_thai fields)
- D-27: Toast notifications via useUiStore().showToast()
- D-28: Color scheme matches existing (blue-500 primary, gray-800 sidebar)

### Claude's Discretion
- Modal component implementation (simple overlay div -- no library needed)
- Exact StatCard configurations per page
- Table responsive behavior on mobile
- Autocomplete dropdown styling
- Confirmation dialog implementation

### Deferred Ideas (OUT OF SCOPE)
- Personnel selection as a shared component (extract after v1.1)
- Inline editing (edit directly in table row)
- Bulk operations (select multiple + delete)
- CSV export from table (v2 requirement DV-03)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SE-03 | Supportive experience page: list + create/edit form per person | ProbationEndPage template, useProbation composable pattern, supportive.php API contract (GET/POST/PUT/DELETE /supportive) |
| DE-02 | Diverse experience page: 4-dimension list + create/edit form | Same template pattern, diverse.php API contract with GENERATED diff_count, from/to field structure |
| PE-02 | Position equivalence page: list + request form + approval status workflow | Same template pattern, equivalence.php API contract with PENDING/APPROVED/REJECTED transitions and conditional action buttons |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vue | 3.5.x | Component framework | Project standard |
| vue-router | 4.5.x | Client routing | Already configured with PlaceholderPage routes |
| pinia | 3.0.x | State management | useAuthStore, useUiStore already exist |
| lucide-vue-next | 0.470.x | Icons | Pencil, Trash2, Plus, Check, X, Eye, etc. |
| tailwindcss | 4.1.x | Styling | Project standard via @tailwindcss/vite |

### Supporting (no new dependencies needed)
No new npm packages are required. All functionality is achievable with existing dependencies.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `<table>` | AG Grid / TanStack Table | Decision D-04 locks raw tables -- consistent with existing pages |
| Native `<input type="date">` | vue-datepicker | Decision D-09 locks native inputs -- simpler, no dependency |
| Simple modal div | headlessui/radix-vue | Overkill for overlay+backdrop pattern in this project |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── composables/
│   ├── useSupportive.js        # NEW - API wrapper for /supportive
│   ├── useDiverse.js           # NEW - API wrapper for /diverse
│   └── useEquivalence.js       # NEW - API wrapper for /equivalence
├── pages/
│   ├── SupportivePage.vue      # NEW - การนับเกื้อกูล
│   ├── DiversePage.vue         # NEW - การนับแตกต่าง
│   └── EquivalencePage.vue     # NEW - การเทียบตำแหน่ง
├── components/
│   ├── StatusBadge.vue         # MODIFY - add 5 new status keys
│   └── (all existing components reused as-is)
└── router/
    └── index.js                # MODIFY - 3 route imports changed
```

### Pattern 1: Composable (API Wrapper)
**What:** Each composable wraps useApi() and maps snake_case backend fields to camelCase frontend fields.
**When to use:** Every page that calls a backend API.
**Example:**
```javascript
// Source: frontend/src/composables/useProbation.js (existing pattern)
import { useApi } from '@/composables/useApi.js'

export function useSupportive() {
  const api = useApi()

  async function fetchList({ search = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', limit)
    params.set('offset', offset)
    const result = await api.get(`/supportive?${params}`)
    return {
      success: result.success,
      data: result.data.map(mapRow),
      pagination: result.pagination,
    }
  }

  async function fetchDetail(id) {
    const result = await api.get(`/supportive/${id}`)
    return { success: result.success, data: mapRow(result.data) }
  }

  async function create(data) {
    return api.post('/supportive', data)
  }

  async function update(id, data) {
    return api.put(`/supportive/${id}`, data)
  }

  async function remove(id) {
    return api.del(`/supportive/${id}`)
  }

  function mapRow(row) {
    return {
      supportiveId: row.supportive_id,
      personnelId: row.personnel_id,
      fullName: row.full_name,
      jobSeriesName: row.job_series_name,
      startDate: row.start_date,
      startDateThai: row.start_date_thai,
      endDateThai: row.end_date_thai,
      totalDays: row.total_days,
      ratioPercent: row.ratio_percent,
      effectiveDays: row.effective_days,
      description: row.description,
    }
  }

  return { fetchList, fetchDetail, create, update, remove }
}
```

### Pattern 2: Page Component (CRUD with Modals)
**What:** Extends ProbationEndPage pattern with modal state management for create/edit/delete.
**When to use:** All 3 new pages.
**Example (modal state management):**
```javascript
// Modal state refs
const showModal = ref(false)
const editingRecord = ref(null)   // null = create mode, object = edit mode
const showDeleteConfirm = ref(false)
const deletingId = ref(null)

function openCreate() {
  editingRecord.value = null
  showModal.value = true
}

function openEdit(record) {
  editingRecord.value = { ...record }
  showModal.value = true
}

function confirmDelete(id) {
  deletingId.value = id
  showDeleteConfirm.value = true
}

async function handleSave(formData) {
  try {
    if (editingRecord.value) {
      await update(editingRecord.value.supportiveId, formData)
      showToast('อัปเดตสำเร็จ', 'success')
    } else {
      await create(formData)
      showToast('บันทึกสำเร็จ', 'success')
    }
    showModal.value = false
    fetchData()
  } catch (err) {
    showToast(err.message || 'เกิดข้อผิดพลาด', 'error')
  }
}
```

### Pattern 3: Simple Modal Overlay
**What:** Modal as a div with backdrop, no library.
**When to use:** Create/edit forms, confirmation dialogs.
**Example:**
```html
<!-- Modal backdrop + content -->
<div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
  <div class="fixed inset-0 bg-black/50" @click="showModal = false"></div>
  <div class="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
    <h3 class="text-lg font-bold text-gray-900 mb-4">
      {{ editingRecord ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่' }}
    </h3>
    <!-- form fields here -->
    <div class="flex justify-end gap-3 mt-6">
      <button @click="showModal = false" class="px-4 py-2 text-gray-700 border rounded-lg">ยกเลิก</button>
      <button @click="handleSave" class="px-4 py-2 bg-blue-500 text-white rounded-lg">บันทึก</button>
    </div>
  </div>
</div>
```

### Pattern 4: Personnel Autocomplete
**What:** Searchable input calling `/civil-servants?search=X` with dropdown results.
**When to use:** All 3 create/edit forms need personnel selection.
**Example:**
```javascript
const personnelSearch = ref('')
const personnelResults = ref([])
let personnelTimeout = null

function onPersonnelInput() {
  clearTimeout(personnelTimeout)
  personnelTimeout = setTimeout(async () => {
    if (personnelSearch.value.length < 2) {
      personnelResults.value = []
      return
    }
    const result = await api.get(`/civil-servants?search=${encodeURIComponent(personnelSearch.value)}&limit=10`)
    personnelResults.value = result.data
  }, 300)
}

function selectPersonnel(person) {
  formData.value.personnel_id = person.servant_id
  personnelSearch.value = person.full_name
  personnelResults.value = []
}
```

### Anti-Patterns to Avoid
- **Putting CRUD logic in the page component:** All API calls go through composables, not direct useApi() in pages.
- **Computing diff_count or total_days on frontend:** Backend computes these server-side. Frontend only displays them. Exception: live diff_count preview in diverse form (D-16) counts checked boxes locally for UX only.
- **Sending computed fields in POST/PUT:** Backend ignores total_days, effective_days, diff_count. Only send user-input fields.
- **Storing approval_status in create form:** POST /equivalence always creates with PENDING status (D-22). No status dropdown in create form.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pagination | Custom pagination component | Existing PaginationBar.vue | Already handles page numbers, Thai labels, offset math |
| Status badges | Custom colored spans | Existing StatusBadge.vue (extend statusMap) | Centralized styling, consistent look |
| Loading states | Custom spinners | Existing SkeletonLoader.vue | Supports 'table' and 'stat-cards' types |
| Empty states | Custom "no data" messages | Existing EmptyState.vue | Accepts icon, title, description, slot |
| Toast notifications | Custom notification system | Existing useUiStore().showToast() | Already wired up globally |
| HTTP requests + auth | Raw fetch with token | Existing useApi() composable | Handles JWT injection, 401 redirect, error parsing |

**Key insight:** The entire UI infrastructure already exists. Phase 6 is pure page assembly -- no component library or infrastructure work.

## Common Pitfalls

### Pitfall 1: Thai IME Composition Events
**What goes wrong:** Search input fires on every keystroke during Thai character composition, causing premature API calls with incomplete characters.
**Why it happens:** Thai characters are composed from multiple keystrokes. `input` event fires for each partial composition.
**How to avoid:** Use `compositionstart`/`compositionend` events to suppress search during composition, same as ProbationEndPage. The 300ms debounce partially mitigates but doesn't fully solve it.
**Warning signs:** Search results flicker or show wrong results when typing Thai text quickly.

### Pitfall 2: GENERATED Column in diverse_experience
**What goes wrong:** Sending `diff_count` in POST/PUT request body causes MySQL error because it's a GENERATED ALWAYS AS column.
**Why it happens:** Frontend developer might include diff_count in the form data.
**How to avoid:** Composable's create/update methods must only send allowed fields. Never include diff_count in request payload. The backend already handles this but frontend should be clean.
**Warning signs:** 500 error on diverse record create/update.

### Pitfall 3: Approval Status Transition Rules
**What goes wrong:** Showing edit/approve buttons on APPROVED or REJECTED records, or allowing invalid status transitions.
**Why it happens:** Not checking current approval_status before rendering action buttons.
**How to avoid:** Conditional rendering per D-20: PENDING rows show edit + approve + reject. APPROVED/REJECTED rows show view-only. Backend enforces validTransitions but UI should match.
**Warning signs:** 400 error "ไม่สามารถเปลี่ยนสถานะจาก X เป็น Y".

### Pitfall 4: Autocomplete Click-Outside Dismissal
**What goes wrong:** Autocomplete dropdown stays open when clicking elsewhere on the page.
**Why it happens:** No click-outside handler to close the dropdown.
**How to avoid:** Add a `@click` handler on the backdrop or use `@blur` on the input with a small delay (to allow clicking dropdown items before blur fires).
**Warning signs:** Dropdown persists after selecting or clicking away.

### Pitfall 5: Form Reset on Modal Close/Reopen
**What goes wrong:** Previous form data persists when opening modal for a new record.
**Why it happens:** Reactive form data not reset when switching between create and edit modes.
**How to avoid:** Reset form data in `openCreate()` and populate in `openEdit()`. Use a `watch` on `showModal` or explicit initialization.
**Warning signs:** Edit data appears in create form or vice versa.

### Pitfall 6: personnel_id vs servant_id Mismatch
**What goes wrong:** Autocomplete returns `servant_id` from civil-servants API but backend expects `personnel_id`.
**Why it happens:** The civil-servants API response uses `servant_id` as the primary key field.
**How to avoid:** Map `servant_id` to `personnel_id` when selecting a person from autocomplete results.
**Warning signs:** 400/500 error on create with wrong personnel reference.

## Code Examples

### StatusBadge New Keys (5 additions)
```javascript
// Source: StatusBadge.vue statusMap -- add these entries
// Approval statuses (Position Equivalence)
PENDING: { label: 'รออนุมัติ', class: 'bg-amber-50 text-amber-700' },
APPROVED: { label: 'อนุมัติแล้ว', class: 'bg-green-50 text-green-700' },
REJECTED: { label: 'ไม่อนุมัติ', class: 'bg-red-50 text-red-700' },
// Diff count badges (Diverse Experience)
DIFF_PASS: { label: 'ผ่านเกณฑ์', class: 'bg-green-50 text-green-700' },
DIFF_NOT_YET: { label: 'ยังไม่ครบ', class: 'bg-amber-50 text-amber-700' },
```

### Router Updates (3 route changes)
```javascript
// Source: frontend/src/router/index.js -- change 3 imports
{
  path: 'time-counting',
  name: 'time-counting',
  component: () => import('@/pages/SupportivePage.vue'),
},
{
  path: 'time-difference',
  name: 'time-difference',
  component: () => import('@/pages/DiversePage.vue'),
},
{
  path: 'position-compare',
  name: 'position-compare',
  component: () => import('@/pages/EquivalencePage.vue'),
},
```

### Backend API Response Shapes

**GET /supportive (list item fields):**
```json
{
  "supportive_id": 1,
  "personnel_id": 5,
  "full_name": "สมชาย ใจดี",
  "job_series_name": "นิติกร",
  "start_date": "2023-01-15",
  "end_date": "2024-06-30",
  "start_date_thai": "15 ม.ค. 2566",
  "end_date_thai": "30 มิ.ย. 2567",
  "total_days": 533,
  "ratio_percent": 50,
  "effective_days": 266.50,
  "net_end_date": "2023-09-28",
  "description": null
}
```

**GET /diverse (list item fields):**
```json
{
  "experience_id": 1,
  "personnel_id": 5,
  "full_name": "สมชาย ใจดี",
  "from_job_series": "นิติกร", "from_province": "กรุงเทพ",
  "to_job_series": "นักวิเคราะห์", "to_province": "เชียงใหม่",
  "is_diff_job_series": 1, "is_diff_org": 1, "is_diff_location": 1, "is_diff_work_nature": 0,
  "diff_count": 3,
  "qualified_date": "2024-01-15",
  "qualified_date_thai": "15 ม.ค. 2567",
  "from_start_date_thai": "...", "from_end_date_thai": "...",
  "to_start_date_thai": "...", "to_end_date_thai": "..."
}
```

**GET /equivalence (list item fields):**
```json
{
  "equivalence_id": 1,
  "personnel_id": 5,
  "full_name": "สมชาย ใจดี",
  "actual_position": "เจ้าพนักงานธุรการ",
  "equivalent_type": "นักจัดการงานทั่วไป",
  "request_start_date_thai": "1 ม.ค. 2566",
  "request_end_date_thai": "31 ธ.ค. 2567",
  "request_total_days": 731,
  "approval_status": "PENDING",
  "approved_start_date_thai": null,
  "approved_end_date_thai": null,
  "approved_total_days": null,
  "approved_by_name": null
}
```

**POST /supportive (request body -- user-input fields only):**
```json
{
  "personnel_id": 5,
  "job_series_name": "นิติกร",
  "primary_series_name": "นักทรัพยากรบุคคล",
  "start_date": "2023-01-15",
  "end_date": "2024-06-30",
  "description": "optional note"
}
```

**POST /diverse (request body):**
```json
{
  "personnel_id": 5,
  "from_job_series": "นิติกร", "from_work_group": "...", "from_division": "...",
  "from_org_id": 1, "from_province": "กรุงเทพ",
  "from_start_date": "2020-01-01", "from_end_date": "2022-12-31",
  "to_job_series": "นักวิเคราะห์", "to_work_group": "...", "to_division": "...",
  "to_org_id": 2, "to_province": "เชียงใหม่",
  "to_start_date": "2023-01-01", "to_end_date": "2024-12-31",
  "is_diff_job_series": 1, "is_diff_org": 1, "is_diff_location": 1, "is_diff_work_nature": 0
}
```

**POST /equivalence (request body):**
```json
{
  "personnel_id": 5,
  "actual_position": "เจ้าพนักงานธุรการ",
  "equivalent_type": "นักจัดการงานทั่วไป",
  "request_start_date": "2023-01-01",
  "request_end_date": "2024-12-31",
  "approval_order_ref": "คำสั่งที่ 123/2566"
}
```

**PUT /equivalence/{id} (approve action):**
```json
{
  "approval_status": "APPROVED",
  "approved_start_date": "2023-01-01",
  "approved_end_date": "2024-12-31"
}
```

### Diverse Form: Live diff_count Preview
```javascript
// Compute diff_count preview from checkboxes (UX only, not sent to backend)
const diffCountPreview = computed(() => {
  return (formData.value.is_diff_job_series ? 1 : 0)
       + (formData.value.is_diff_org ? 1 : 0)
       + (formData.value.is_diff_location ? 1 : 0)
       + (formData.value.is_diff_work_nature ? 1 : 0)
})

const diffCountStatus = computed(() => {
  return diffCountPreview.value >= 3 ? 'DIFF_PASS' : 'DIFF_NOT_YET'
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vanilla JS pages | Vue 3 SFC with `<script setup>` | Project migration (v1.0 Phase 1-3) | All new pages use Vue 3 Composition API |
| Custom API service (Axios) | useApi() composable (Fetch API) | v1.0 migration | No Axios dependency, simpler interceptor pattern |

**No deprecated patterns** -- project is on current Vue 3, Tailwind 4, Vite 6.

## Open Questions

1. **civil-servants API field name mapping**
   - What we know: The API returns `servant_id` for each person. Backend CRUD APIs expect `personnel_id`.
   - What's unclear: Whether `servant_id` and `personnel_id` are the same column or different. The supportive/diverse/equivalence tables use `personnel_id` FK.
   - Recommendation: Map `servant_id` from autocomplete result to `personnel_id` in form data. Verify with a test call.

2. **supportive_job_series autocomplete data source**
   - What we know: D-08 says "autocomplete from loaded supportive_job_series mapping data". No dedicated API endpoint visible for listing job series.
   - What's unclear: Whether a GET endpoint for supportive_job_series exists or needs to be added.
   - Recommendation: Check if a `/supportive-job-series` or similar endpoint exists. If not, load distinct values from existing records or hardcode common Thai government job series for v1.1. This may require a small backend addition.

## Sources

### Primary (HIGH confidence)
- `frontend/src/pages/ProbationEndPage.vue` -- Page layout template (232 lines)
- `frontend/src/composables/useProbation.js` -- Composable pattern (51 lines)
- `frontend/src/composables/useApi.js` -- API wrapper (48 lines)
- `frontend/src/components/StatusBadge.vue` -- Status badge with statusMap (42 lines)
- `frontend/src/components/PaginationBar.vue` -- Pagination component (81 lines)
- `frontend/src/components/StatCard.vue` -- Stat card component (55 lines)
- `frontend/src/components/EmptyState.vue` -- Empty state (20 lines)
- `frontend/src/components/SkeletonLoader.vue` -- Skeleton loader (48 lines)
- `frontend/src/router/index.js` -- Router with 3 PlaceholderPage routes to replace
- `backend/routes/supportive.php` -- Full API contract (369 lines)
- `backend/routes/diverse.php` -- Full API contract (351 lines)
- `backend/routes/equivalence.php` -- Full API contract (325 lines)
- `backend/api.php` lines 128-187 -- civil-servants search API

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions D-01 through D-28 -- User requirements

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all existing libraries verified in codebase
- Architecture: HIGH - Directly following established ProbationEndPage + useProbation patterns
- Pitfalls: HIGH - Based on actual code inspection of backend APIs and existing frontend patterns

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable -- no dependency changes expected)
