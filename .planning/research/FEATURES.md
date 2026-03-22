# Feature Research: v1.1 Time-Counting Sub-Menus

**Domain:** Thai Government HR -- Career Path Time Counting (การนับเวลาเพิ่มเติม)
**Researched:** 2026-03-22
**Confidence:** HIGH (domain rules documented in gap_analysis_career_path_v2.sql, database/04-career-path.sql, and legal references นร 1006/ว5, ว3, ว17)
**Mode:** Ecosystem -- What features does each sub-menu need?

## Context

v1.0 shipped a QualificationEngine that computes `qualification_date = current_level_start_date + min_years`. This is a simplified calculation that ignores three critical time-adjustment mechanisms used in Thai civil service promotion:

1. **Supportive Experience (เกื้อกูล)** -- days worked in a related job series count toward promotion at a ratio (50-100%)
2. **Diverse Experience (3 ต่าง)** -- prerequisite for อำนวยการ (M1) requiring experience across 3+ different dimensions (job series, org, location, work nature)
3. **Position Equivalence (เทียบตำแหน่ง)** -- cross-type promotions (e.g., K4 to S1) require approved equivalent time in the target type

These three mechanisms are currently **not** factored into the QualificationEngine. The v1.1 milestone adds CRUD sub-menus for each, then integrates their computed days into the existing qualification calculation.

---

## Sub-Menu 1: Supportive Experience (เกื้อกูล)

### What It Is

When a civil servant worked in a **related job series** (สายงานเกื้อกูล), those days can be counted toward their promotion tenure at a specified ratio. Example: A นักทรัพยากรบุคคล who previously worked as นักวิเคราะห์นโยบายและแผน can count those days at 100% because those series are officially mapped as "supportive" to each other.

The mapping of which series support which is defined by OCSC (ก.พ.) and varies per job series. Some series (e.g., นิติกร) have **no** supportive mappings (exclusive).

**Database tables already created:**
- `supportive_experience` -- personnel-level records (start_date, end_date, total_days, ratio_percent, effective_days)
- `supportive_job_series` -- mapping table defining which series are supportive of each other

**Impact on QualificationEngine:**
- `effective_days = total_days * ratio_percent / 100`
- Added to `qualification_calculation.supportive_days`
- Changes `total_qualifying_days = job_series_days + supportive_days`
- This can **accelerate** the qualification_date (person qualifies earlier)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **CRUD for supportive_experience records** | HR must add/edit/delete periods of supportive experience per person | MEDIUM | Standard form: personnel selector, job_series_name, start_date, end_date, ratio_percent |
| **Auto-compute total_days and effective_days** | Excel does this automatically; HR expects it -- no manual day counting | LOW | `total_days = DATEDIFF(end_date, start_date)`, `effective_days = total_days * ratio / 100` |
| **Auto-compute net breakdown (years/months/days)** | Excel sheets show Y/M/D columns for the net supportive time | LOW | Derive from effective_days: `net_years`, `net_months`, `net_day_remainder` |
| **Personnel search/selection** | HR needs to quickly find the person they are entering data for | LOW | Reuse existing search pattern from CandidateListsPage |
| **List view with summary per person** | "Show me all supportive experience entries for this person" with a sum | LOW | Table with rows per entry + footer sum of effective_days |
| **Date validation** | start_date must be before end_date; periods should not overlap for same person | LOW | Frontend + backend validation |
| **Ratio dropdown (50%, 75%, 100%)** | Ratios are predefined by ก.พ. rules, not free-form | LOW | The DB allows DECIMAL(5,2) but in practice only specific ratios are used |
| **Job series autocomplete from supportive_job_series mapping** | HR should only be able to select series that are officially supportive of the person's current series | MEDIUM | Query supportive_job_series WHERE primary_series matches person's current series |
| **Thai date display (Buddhist Era)** | All dates must display in พ.ศ. format -- existing helpers handle this | LOW | Reuse `formatThaiDate()` from helpers.php |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Side-by-side view: job series tenure + supportive days = total** | Shows HR the complete picture: "ตน. X วัน + เกื้อกูล Y วัน = รวม Z วัน" like the Excel formula | MEDIUM | Mirrors Excel "นับเกื้อกูล" sheet layout; high clarity for HR staff |
| **Seed data for supportive_job_series mapping** | Pre-populated mappings from PDF pages 32-82 so HR does not have to configure from scratch | HIGH | ~50+ mappings across all job series in MOJ. This is the single most labor-intensive seed data task |
| **Inline impact preview** | When adding supportive days, show how it changes the qualification_date in real-time | MEDIUM | Requires calling QualificationEngine with/without supportive_days |
| **Bulk import from Excel** | HR currently has this data in Excel "นับเกื้อกูล" sheet; importing saves weeks of re-entry | MEDIUM | Parse XLSX, validate against supportive_job_series mapping, insert |
| **Admin management of supportive_job_series mapping** | Allow HR admin to add/edit the supportive series mappings when ก.พ. issues new rules | LOW | Simple CRUD on the mapping table; rarely changes |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Free-text ratio entry** | Ratios are legally defined; free-text invites errors like 37.5% | Use a dropdown with valid ratios (50, 75, 100) or at most a constrained numeric input |
| **Auto-detecting supportive series from position_history** | Position history may have inconsistent job_series_name values; auto-detection would be unreliable | Let HR manually select the supportive series from the validated mapping |
| **Allowing supportive entries for exclusive series** | Some series like นิติกร explicitly have no supportive mappings per ก.พ. rules | Check mapping_type = 'EXCLUSIVE' and block entry with clear message |

---

## Sub-Menu 2: Diverse Experience (3 ต่าง / นับแตกต่าง)

### What It Is

To be promoted to อำนวยการต้น (M1), a civil servant must demonstrate **diverse experience** across at least 3 of 4 dimensions:
1. ต่างสายงาน (different job series)
2. ต่างหน่วยงาน (different organization/division)
3. ต่างพื้นที่ (different location/province)
4. ต่างลักษณะงาน (different work nature/work group)

This is a **prerequisite check**, not a day-counting mechanism. The system records two positions (from/to) and checks which dimensions differ. If `diff_count >= 3`, the person meets the requirement and a `qualified_date` is set.

Legal reference: นร 1006/ว17 (28 ก.ค. 2558) + ประกาศ อ.ก.พ. กระทรวงยุติธรรม (4 ม.ค. 2562)

**Database table already created:**
- `diverse_experience` -- records from/to position pairs with boolean flags for each dimension + diff_count + qualified_date

**Impact on QualificationEngine:**
- M1 promotion requires `diverse_exp_date IS NOT NULL` (person has met the 3 ต่าง requirement)
- If not met, qualification status should show "ยังไม่ครบ 3 ต่าง" regardless of tenure
- This is a **gate** (pass/fail), not a day adjustment

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **CRUD for diverse_experience records** | HR must record from/to position pairs showing what changed | MEDIUM | Form with from-side and to-side fields (job_series, work_group, division, org, province, dates) |
| **Auto-compute diff flags** | System should auto-detect which dimensions differ based on entered from/to data | MEDIUM | Compare from_job_series vs to_job_series, from_org vs to_org, etc. and set boolean flags |
| **Auto-compute diff_count** | Sum of boolean flags (0-4), highlight when >= 3 | LOW | `diff_count = is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature` |
| **Auto-set qualified_date** | When diff_count >= 3, set qualified_date = to_start_date (the date the 3rd difference was achieved) | LOW | Triggered on save |
| **Visual checklist of 4 dimensions** | Show 4 checkboxes/icons indicating which differences are met -- this is how HR thinks about it | LOW | 4 colored badges: green (met) / gray (not met) |
| **Personnel search/selection** | Same as supportive experience | LOW | Reuse pattern |
| **From/To date period tracking** | Each position pair has start_date and end_date on both sides | LOW | Standard date fields |
| **Total days per period** | Auto-computed from date ranges | LOW | DATEDIFF |
| **List view per person** | Show all diverse experience entries for one person with overall diff status | LOW | Table with visual diff indicators |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Dashboard summary: who has/hasn't met 3 ต่าง** | Quick view for HR to see which M1 candidates still need diverse experience | LOW | Aggregate query on diverse_experience grouped by personnel_id |
| **Auto-populate from position_history** | Pre-fill from/to pairs from personnel_position_history to reduce manual entry | HIGH | Match on personnel_id, order by effective_date, detect changes in job_series, org, province, work_group |
| **Timeline visualization** | Show career timeline with colored markers at each "ต่าง" transition point | HIGH | Nice-to-have; complex UI but very intuitive for HR |
| **Warning when only 2 ต่าง** | Proactive alert: "บุคคลนี้ยังขาดอีก 1 ต่าง (ต่างพื้นที่)" | LOW | Simple check on diff_count < 3 with specific missing dimension |
| **Bulk import from Excel** | Existing data in "นับต่าง" Excel sheet | MEDIUM | Parse XLSX, map columns |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Requiring 3 ต่าง for non-M1 promotions** | The 3 ต่าง requirement applies specifically to อำนวยการต้น (M1) promotion per ว17 | Only enforce as gate for M1 target level in QualificationEngine |
| **Allowing HR to manually override diff flags** | If from_org = to_org, the system should NOT allow marking is_diff_org = true | Auto-compute flags from data; make them read-only display |
| **Complex multi-hop diff tracking** | Some might want to track diffs across 3+ positions in sequence | Keep it simple: each record is one from/to pair. Multiple records per person are fine. The qualified_date is set when any combination reaches diff_count >= 3 |
| **Counting ต่างลักษณะงาน automatically** | Work nature (ลักษณะงาน) is subjective and cannot be derived from structured data alone | Allow HR to manually flag is_diff_work_nature with a checkbox; other 3 dimensions can be auto-detected |

---

## Sub-Menu 3: Position Equivalence (เทียบตำแหน่ง)

### What It Is

When a civil servant moves **across position types** (e.g., วิชาการ K4 to บริหาร S1), they may need to demonstrate equivalent experience in the target type. For example, K4 to S1 requires at least 2 years of experience **equivalent to อำนวยการ level**.

This involves an **approval workflow**: HR submits a request with the period claimed, and a supervisor/committee approves the actual equivalent period. The approved days count toward the cross-type promotion requirement.

Legal reference: PDF page 6 "K4 to S1 ต้องเทียบอำนวยการ >= 2 ปี"

**Database table already created:**
- `position_equivalence` -- records with request vs approved periods, approval_status (PENDING/APPROVED/REJECTED), approved_by

**Impact on QualificationEngine:**
- `equivalence_days` in qualification_calculation is populated from approved entries
- Used specifically for cross-type promotions (K4->S1, K3->M1 in some cases)
- Only `APPROVED` entries count

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **CRUD for position_equivalence records** | HR must submit equivalence requests and track their status | MEDIUM | Form: personnel, actual_position, equivalent_type, request dates, approval fields |
| **Request vs Approved split** | Two sets of date fields: what was requested vs what was approved -- this distinction is critical | LOW | Already in schema: request_start/end_date vs approved_start/end_date |
| **Auto-compute total days for both request and approved periods** | `request_total_days` and `approved_total_days` from date ranges | LOW | DATEDIFF on each pair |
| **Approval status tracking** | PENDING / APPROVED / REJECTED with visual badges | LOW | Reuse StatusBadge pattern from probation tracking |
| **Approval order reference** | Link to the official approval document (คำสั่ง) reference number | LOW | Text field `approval_order_ref` |
| **Personnel search/selection** | Same as other sub-menus | LOW | Reuse pattern |
| **List view per person** | Show all equivalence entries with status indicators | LOW | Table with approval status badges |
| **Filter by approval status** | HR needs to see "all pending" vs "all approved" entries | LOW | Dropdown filter on approval_status |
| **Thai date display** | Same as other sub-menus | LOW | Reuse existing helpers |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Approval workflow with approved_by tracking** | Record who approved and when, creating an audit trail | MEDIUM | Set approved_by = current user ID when status changes to APPROVED |
| **Dashboard: pending approvals count** | HR supervisor sees "5 รายการรออนุมัติ" on their dashboard | LOW | COUNT where approval_status = 'PENDING' |
| **Impact preview on qualification** | Show how approved equivalence days affect the cross-type promotion date | MEDIUM | Similar to supportive experience impact preview |
| **Notification when status changes** | Alert the submitting HR when their request is approved/rejected | MEDIUM | Out of scope for v1.1 per PROJECT.md, but note for v2 |
| **Bulk import** | Existing data in "เทียบ-ตน." Excel sheet | MEDIUM | Parse XLSX |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full approval workflow engine** | Building a configurable multi-step approval chain is over-engineering for this use case | Simple status field (PENDING/APPROVED/REJECTED) with approved_by. One-step approval is sufficient |
| **Allowing non-HR users to self-submit** | Position equivalence is an HR administrative function, not employee self-service | Restrict to authenticated HR users only (existing JWT auth) |
| **Auto-approving equivalence** | Equivalence requires committee/supervisor judgment -- it cannot be automated | Always start as PENDING; require explicit approval action |
| **Applying equivalence to same-type promotions** | Equivalence is only for cross-type moves (K4->S1, etc.) | Only factor into QualificationEngine for target levels that have `requires_equiv_years` in promotion_criteria |

---

## Cross-Cutting Features (All 3 Sub-Menus)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Navigation sub-menu under "การนับเวลาเพิ่มเติม"** | Three features grouped as sub-menus under a single parent menu item in the sidebar | LOW | Matches PROJECT.md: "3 sub-menus: เกื้อกูล, แตกต่าง, เทียบตำแหน่ง" |
| **QualificationEngine integration** | The whole point of v1.1 -- supportive_days, diverse_exp_date, and equivalence_days must feed into the existing qualification calculation | HIGH | Extend `computeForLevel()` and `computeDetail()` to JOIN with these tables and adjust qualification_date |
| **Candidate List reflects adjusted dates** | After entering supportive/diverse/equivalence data, the candidate list must show updated qualification_dates | MEDIUM | QualificationEngine must subtract supportive_days from required tenure, check diverse_exp gate for M1, add equivalence_days for cross-type |
| **Consistent UI patterns** | All 3 sub-menus should share the same layout: breadcrumb, page header, search, table, pagination | LOW | Reuse CandidateListsPage patterns: PaginationBar, StatusBadge, search input |
| **Backend REST endpoints** | Standard CRUD pattern for each: GET (list + detail), POST (create), PUT (update), DELETE | MEDIUM | 3 new route files following candidates.php pattern |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Person detail panel showing all 3 time adjustments** | Single view: "สำหรับ นายสมชาย: เกื้อกูล 365 วัน, 3 ต่าง ผ่าน, เทียบ ตน. 730 วัน" | MEDIUM | Aggregate view pulling from all 3 tables |
| **Excel export** | HR still needs to produce Excel reports for committee meetings | MEDIUM | Generate XLSX matching the original Excel sheet format |
| **Audit trail / change log** | Track who entered/modified records and when | LOW | `created_at` already exists; add `updated_by` if needed |

---

## Feature Dependencies

```
supportive_job_series (seed data)
    --> supportive_experience (CRUD)
        --> QualificationEngine (supportive_days integration)
            --> Candidate List (adjusted qualification_date)

diverse_experience (CRUD)
    --> QualificationEngine (diverse_exp_date gate for M1)
        --> Candidate List (M1 tab shows 3 ต่าง status)

position_equivalence (CRUD)
    --> QualificationEngine (equivalence_days for cross-type)
        --> Candidate List (cross-type targets show equivalence status)

All 3 sub-menus depend on:
    --> Sidebar navigation update (parent menu item)
    --> Backend route registration in api.php
    --> Vue Router route registration
```

## MVP Recommendation

### Phase structure for v1.1:

**Build order (based on dependencies and complexity):**

1. **Supportive Experience (เกื้อกูล) first** -- This is the most universally needed feature. Every K2 and K3 candidate potentially has supportive days. It also has the clearest data model (dates + ratio = effective days). Build this end-to-end (backend CRUD + frontend + QualificationEngine integration) as the template for the other two.

2. **Diverse Experience (3 ต่าง) second** -- Simpler data model (boolean flags + count), but only applies to M1 candidates. The QualificationEngine integration is different (gate check vs. day adjustment), so it exercises a new pattern.

3. **Position Equivalence (เทียบตำแหน่ง) third** -- Applies to the fewest candidates (only cross-type promotions like K4->S1). Has the approval workflow complexity. Build last because it is the least urgent and builds on patterns from the first two.

**For each sub-menu, prioritize:**
1. Backend CRUD API endpoints
2. Frontend list + form pages
3. QualificationEngine integration
4. Seed data (especially supportive_job_series mapping)

**Defer to v2:**
- Bulk Excel import/export (useful but not blocking)
- Timeline visualization for diverse experience
- Notification system for approval status changes
- Auto-populate from position_history (risky data quality)

## Sources

- `docs/gap_analysis_career_path_v2.sql` -- Table designs with Thai comments explaining each field's purpose and legal reference (HIGH confidence)
- `database/04-career-path.sql` -- MySQL-converted schema actually deployed (HIGH confidence)
- `backend/QualificationEngine.php` -- Current qualification computation logic showing what needs extension (HIGH confidence)
- `.planning/PROJECT.md` -- v1.1 milestone definition and constraints (HIGH confidence)
- Legal references: นร 1006/ว5 (22 มี.ค. 67), นร 1006/ว3 (22 ก.พ. 67), นร 1006/ว17 (28 ก.ค. 58) -- Referenced in SQL comments (MEDIUM confidence, not directly verified against original documents)
- [OCSC Q&A for อำนวยการ ว3/2567](https://www.ocsc.go.th/wp-content/uploads/2024/05/%E0%B8%96%E0%B8%B2%E0%B8%A1-%E0%B8%95%E0%B8%AD%E0%B8%9A-%E0%B8%AD%E0%B8%B3%E0%B8%99%E0%B8%A7%E0%B8%A2%E0%B8%81%E0%B8%B2%E0%B8%A3-%E0%B8%A7-3-2567.pdf) -- Official OCSC document (could not extract text from PDF)
- [Thai civil service position type comparison](https://www.moe.go.th/%E0%B9%80%E0%B8%97%E0%B8%B5%E0%B8%A2%E0%B8%9A%E0%B8%95%E0%B8%B3%E0%B9%81%E0%B8%AB%E0%B8%99%E0%B9%88%E0%B8%87%E0%B8%82%E0%B9%89%E0%B8%B2%E0%B8%A3%E0%B8%B2%E0%B8%8A%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B9%83/) -- Ministry of Education comparison table (LOW confidence, different ministry)
