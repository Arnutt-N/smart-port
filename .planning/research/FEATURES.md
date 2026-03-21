# Feature Research

**Domain:** Thai Government HR — Career Path Candidate Lists & Probation Tracking
**Researched:** 2026-03-22
**Confidence:** HIGH (domain rules are well-documented in SQL schemas and legal references; UI patterns verified against industry probation/career software)

## Feature Landscape

### Table Stakes (Users Expect These)

Features HR staff at the Ministry of Justice assume exist. Missing these = the system is not usable and they revert to Excel.

#### Candidate List (บัญชีรายชื่อผู้มีคุณสมบัติเลื่อนระดับ)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Tab-based view by position type (ประเภท)** | HR staff think in 4 categories: ทั่วไป, วิชาการ, อำนวยการ, บริหาร — this matches their mental model from Excel sheets | LOW | 4 tabs, 2 active (Phase 1), 2 placeholder |
| **Qualification status per person** | The whole point — "who qualifies for promotion and when?" Currently done via Excel col-by-col | HIGH | Must compute from promotion_criteria + tenure + education + supportive days. This is the core calculation engine |
| **Remaining days display** | Every Excel sheet (to-K2, to-K3, etc.) has a "จำนวนวันเหลือ" column — HR uses this to plan promotion rounds | MEDIUM | remaining_days = qualification_date - current_date; negative = already qualified |
| **Status indicators (ถึงเกณฑ์/ยังไม่ถึงเกณฑ์/Check Data)** | Three states from the Excel: qualified long ago, not yet qualified, data incomplete | LOW | Color-coded badges: green/gray/orange |
| **Search/filter by name and position** | Basic usability — HR manages hundreds of personnel | LOW | Already in mock UI |
| **Summary stat cards** | Dashboard-level overview: total in list, eligible count, overdue count | LOW | Already in mock UI |
| **Sub-tabs by promotion path within each type** | Each ประเภท has multiple paths (e.g., วิชาการ has K1->K2, K2->K3, K3->K4) — HR needs to work one path at a time | MEDIUM | Nested navigation within each main tab |
| **Education-aware qualification rules** | K1->K2 requires 6 years (bachelor), 4 years (master), 2 years (doctorate) — different timelines per education level | HIGH | Must implement promotion_criteria with education_condition lookup |

#### Probation Tracking (พ้นทดลองปฏิบัติราชการ)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Probation list with remaining days** | Core view — "who is in probation and how many days left?" | LOW | Simple query from probation_enrollment |
| **Color-coded urgency (green/yellow/orange/red)** | Visual triage: >30 days = green, 15-30 = yellow, 7-14 = orange, <7 = red — matches PROJECT.md spec | LOW | CSS classes on remaining_days column |
| **Status tracking (IN_PROGRESS/COMPLETED/FAILED/EXTENDED)** | HR needs to see overall probation outcome at a glance | LOW | Badge component with 4 states |
| **Personnel details per enrollment** | Name, position, department, hire date, probation start/end — basic identification | LOW | JOIN with personnel + organization tables |
| **Search/filter** | Same usability need as candidate list | LOW | Already in mock UI |
| **Summary stat cards** | Total, ready, upcoming, overdue counts — already in mock UI | LOW | Already structured |

#### Shared / Cross-cutting

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Database schema (MySQL conversion)** | No feature works without tables — PostgreSQL schemas must be converted to MySQL 8.0 | MEDIUM | BIGSERIAL->BIGINT AUTO_INCREMENT, BOOLEAN->TINYINT, string concat, date arithmetic differences |
| **REST API endpoints** | Frontend needs data from backend — currently all mock data | MEDIUM | CRUD for candidate list + probation, plus computed qualification endpoints |
| **Seed data for promotion criteria** | System is useless without the rules loaded — O1->O2, O2->O3, K1->K2, K2->K3, K3->K4 criteria from กฎ ก.พ. | MEDIUM | Insert statements derived from PDF pages 31-82 and legal references |
| **Thai date formatting** | All dates displayed in Buddhist Era (พ.ศ.) format, Thai month names | LOW | Utility function, used throughout |

### Differentiators (Competitive Advantage)

Features that make this system better than Excel. The value proposition is automation and real-time visibility — these features deliver on that promise.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Auto-calculation of qualification date** | Excel requires manual formula maintenance across 10+ sheets. System computes qualification_date automatically from personnel data + promotion_criteria rules | HIGH | This is THE differentiator — replaces the entire Excel workflow. Backend logic using promotion_criteria + tenure + education + supportive days |
| **Supportive experience (เกื้อกูล) integration** | Currently tracked in separate Excel sheet "นับเกื้อกูล". System incorporates supportive_days into total qualifying days automatically | HIGH | Requires supportive_experience table + supportive_job_series mapping. Ratio calculations (50-100%) |
| **Diverse experience (3 ต่าง) tracking for M1** | Complex rule: need 3 out of 4 "differences" (job series, org, location, work nature). Currently manual tracking | HIGH | Phase 2 feature (M1 is อำนวยการ = deferred), but schema should be ready |
| **Probation task checklist with progress** | Most Thai gov systems just track dates. Adding per-task progress (training, e-learning, assessments) gives visibility into WHY someone is behind | MEDIUM | probation_task_template + probation_task_progress tables. Each enrollment gets tasks from template |
| **Probation stakeholder visibility** | Know who the mentor, supervisor, director, and committee members are for each new hire — accountability | LOW | probation_stakeholder table, display in detail view |
| **Detail/drill-down view per person** | Click a row to see full qualification breakdown or full probation progress — not just the summary table | MEDIUM | Modal or sub-page showing calculation details, task progress, evaluation history |
| **Data completeness warnings ("Check Data")** | When personnel records are incomplete, show orange "Check Data" status instead of wrong calculation — prevents false negatives | LOW | NULL checks on required fields during calculation |
| **Batch recalculation** | Recalculate all qualification statuses on demand (e.g., when a deadline date changes or new criteria are added) | MEDIUM | Backend endpoint to recalculate qualification_calculation for all or filtered personnel |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time notification/email alerts** | "Notify me when someone is about to reach qualification" | Requires email infrastructure, scheduled jobs, notification preferences — massive scope increase for Phase 1. Also: Thai gov email systems are unreliable | Defer to Phase 2. Phase 1 provides the dashboard with color-coded urgency — HR can check daily |
| **PDF report generation** | "I need to print the candidate list for the meeting" | PDF generation in PHP requires libraries (TCPDF/mPDF), Thai font handling is notoriously difficult, layout tuning is time-consuming | Defer to Phase 2. Phase 1: browser print CSS or CSV export as interim |
| **Full อำนวยการ/บริหาร implementation** | "We need all 4 types complete" | M1/M2/S1/S2 have significantly more complex rules: screening lists, position equivalence, combination groups, lateral transfers. Trying to build all 4 types at once guarantees none work well | Phase 1: ทั่วไป + วิชาการ only (O1->O2, O2->O3, K1->K2, K2->K3, K3->K4). Phase 2+: อำนวยการ/บริหาร with proper research into screening list workflows |
| **Approval workflow for promotions** | "HR should approve each promotion through the system" | Promotion approval is a bureaucratic process involving committees, written orders (คำสั่ง), and physical signatures. Digitizing this workflow is a separate project | System shows who qualifies. Approval happens outside the system. Track outcome (promoted/not) as a status update |
| **e-Learning integration with ก.พ.** | "System should pull e-Learning completion from OCSC" | ก.พ. e-Learning is a separate platform with no documented API. Integration would require scraping or manual data entry anyway | Manual checkbox or data entry for e-Learning completion status. Store certificate URL for verification |
| **Mobile-responsive optimization** | "Staff should check on their phones" | Current UI is desktop-focused. Full mobile optimization is a significant effort that doesn't match how Thai gov HR actually works (desktop in office) | Basic responsive via Tailwind (already partially done). Full mobile: Phase 2+ |
| **Multi-organization support** | "Other ministries should use this too" | Current schema and rules are specific to สำนักงานปลัดกระทรวงยุติธรรม. Generalizing adds abstraction layers everywhere | Build for one organization first. Generalize only if there's actual demand |
| **Probation evaluation scoring in system** | "Evaluators should score new hires in the system" | Multi-evaluator workflow (mentor -> supervisor -> director -> committee) is complex. Getting all evaluators to use a digital system requires change management | Phase 1: Track enrollment status and remaining days. Phase 2+: Add evaluation forms if there's buy-in from evaluators |

## Feature Dependencies

```
[MySQL Schema Conversion]
    |
    +---> [Seed Data (promotion_criteria)]
    |         |
    |         +---> [Qualification Calculation Engine]
    |                    |
    |                    +---> [Candidate List API]
    |                              |
    |                              +---> [Candidate List UI (tabs + table)]
    |                                        |
    |                                        +---> [Sub-tabs by promotion path]
    |                                        +---> [Detail/drill-down view]
    |
    +---> [Probation Enrollment API]
              |
              +---> [Probation List UI (color-coded)]
              |         |
              |         +---> [Detail view with tasks]
              |
              +---> [Probation Task Progress API] (Phase 1.5)
                        |
                        +---> [Task Checklist UI]

[Supportive Experience] --enhances--> [Qualification Calculation Engine]
[Diverse Experience]    --enhances--> [Qualification Calculation Engine] (Phase 2, for M1)
[Position Equivalence]  --enhances--> [Qualification Calculation Engine] (Phase 2, for S1)
[Screening List]        --enhances--> [Qualification Calculation Engine] (Phase 2, for M1/M2)
```

### Dependency Notes

- **Candidate List UI requires Qualification Calculation Engine:** The table is meaningless without computed qualification status. You cannot show "ถึงเกณฑ์" or "remaining days" without the calculation.
- **Qualification Calculation Engine requires Seed Data:** Without promotion_criteria rows defining the rules (years, education, etc.), there is nothing to calculate against.
- **All features require MySQL Schema Conversion:** PostgreSQL syntax in the SQL files must be converted before any table can be created.
- **Probation Task Progress enhances Probation List:** The list works without tasks (just showing enrollment status), but tasks add depth. This can be a Phase 1.5 enhancement.
- **Supportive Experience enhances Qualification Calculation:** For K2/K3 paths, supportive days are added to tenure days. Without this, calculations are conservative (undercount qualifying days). Can be added incrementally.

## MVP Definition

### Launch With (v1 — Phase 1)

Minimum to replace the Excel workflow for the most common promotion paths.

- [ ] **MySQL schema conversion** — All tables from gap_analysis_career_path_v2.sql + probation_tracking_schema.sql converted to MySQL 8.0
- [ ] **Promotion criteria seed data** — Rules for O1->O2, O2->O3, K1->K2, K2->K3, K3->K4 loaded
- [ ] **Qualification calculation API** — Backend computes qualification status from personnel data + criteria
- [ ] **Candidate List page with 4 tabs** — ทั่วไป and วิชาการ functional, อำนวยการ and บริหาร show "อยู่ระหว่างพัฒนา"
- [ ] **Sub-tabs for promotion paths** — Within ทั่วไป: O1->O2, O2->O3. Within วิชาการ: K1->K2, K2->K3, K3->K4
- [ ] **Probation enrollment list** — Table with color-coded remaining days, search, stat cards
- [ ] **Probation enrollment API** — CRUD endpoints for probation tracking
- [ ] **Status badges and Thai date formatting** — Consistent UX across both features

### Add After Validation (v1.x — Phase 1.5)

Features to add once core calculation and display are working correctly.

- [ ] **Detail/drill-down view** — Click a candidate to see full calculation breakdown (tenure days, education, supportive days, qualification date)
- [ ] **Probation task checklist** — Per-enrollment task tracking with progress (training, e-learning, assessments)
- [ ] **Probation stakeholder display** — Show mentor, supervisor, director for each enrollment
- [ ] **Supportive experience (เกื้อกูล) calculation** — Add supportive days to qualifying days for K2/K3 paths
- [ ] **Batch recalculation** — Recalculate all qualification statuses on demand
- [ ] **CSV export** — Export candidate list or probation list to CSV for printing/sharing

### Future Consideration (v2+)

Features to defer until Phase 1 is validated and in use.

- [ ] **อำนวยการ (M1/M2) full implementation** — Requires screening list, diverse experience (3 ต่าง), combination rules
- [ ] **บริหาร (S1/S2) full implementation** — Requires position equivalence, complex combination groups
- [ ] **Email/notification alerts** — Automated notifications at 30/15/7 day thresholds
- [ ] **PDF report generation** — Formatted reports with Thai fonts for committee meetings
- [ ] **Probation evaluation forms** — Multi-evaluator scoring workflow (mentor -> supervisor -> director -> committee)
- [ ] **Probation committee management** — Committee creation, member assignment, meeting scheduling
- [ ] **Professional license tracking** — Required for specific job series (engineers, architects)
- [ ] **Promotion required training** — Track mandatory courses for each target level

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| MySQL schema conversion | HIGH | MEDIUM | P1 |
| Promotion criteria seed data | HIGH | MEDIUM | P1 |
| Qualification calculation engine | HIGH | HIGH | P1 |
| Candidate List tabs + table | HIGH | LOW | P1 |
| Sub-tabs by promotion path | HIGH | MEDIUM | P1 |
| Probation list with color-coded days | HIGH | LOW | P1 |
| Probation enrollment API (CRUD) | HIGH | MEDIUM | P1 |
| Search/filter | MEDIUM | LOW | P1 |
| Stat cards (summary) | MEDIUM | LOW | P1 |
| Status badges + Thai dates | MEDIUM | LOW | P1 |
| Detail/drill-down view | MEDIUM | MEDIUM | P2 |
| Supportive experience calculation | MEDIUM | HIGH | P2 |
| Probation task checklist | MEDIUM | MEDIUM | P2 |
| CSV export | LOW | LOW | P2 |
| Batch recalculation | MEDIUM | MEDIUM | P2 |
| อำนวยการ full implementation | HIGH | HIGH | P3 |
| บริหาร full implementation | HIGH | HIGH | P3 |
| Email notifications | MEDIUM | HIGH | P3 |
| PDF reports | MEDIUM | HIGH | P3 |
| Probation evaluation forms | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for Phase 1 launch — system is not usable without these
- P2: Should have, add in Phase 1.5 once core is validated
- P3: Future phases, requires additional research or infrastructure

## Competitor / Reference Analysis

| Feature | Excel (current workflow) | HRCS (กรมส่งเสริมการเกษตร) | Ascent E-Probation | Our Approach |
|---------|--------------------------|-------------------------------|---------------------|--------------|
| Qualification calculation | Manual formulas per sheet | Unknown (login-gated) | N/A (private sector) | Auto-calculate from rules + personnel data |
| Multi-path criteria | Separate sheets per path (to-K2, to-K3...) | Unknown | N/A | Tabs + sub-tabs mirroring Excel mental model |
| Education-aware rules | IF formulas in Excel | Unknown | N/A | promotion_criteria rows per education level |
| Probation tracking | Separate process | Unknown | Configurable templates, multi-evaluator, auto-letters | Color-coded list first; evaluation forms in Phase 2 |
| Status visibility | Scroll through sheet, check manually | Unknown | Dashboard with overdue alerts | Stat cards + color coding + search |
| Report generation | Print Excel sheet | Unknown | One-click letter generation | Phase 2 (CSV export as interim) |

## Sources

- SQL schema designs: `docs/gap_analysis_career_path_v2.sql` (9 tables, 2 views, 3 ALTERs), `docs/probation_tracking_schema.sql` (8 tables, 1 view)
- Legal references: กฎ ก.พ. ว่าด้วยการทดลองปฏิบัติหน้าที่ราชการ พ.ศ. 2553, นร 1006/ว5, นร 1006/ว3, นร 1006/ว17
- Career path rules: `docs/documents/ops-carrer-path.pdf` (86 pages)
- [Ascent E-Probation & Confirmation](https://www.eilisys.com/e-probation-confirmation/) — commercial probation management features
- [Folks Probation Review Software](https://folksrh.com/en/feature/probation-review-software/) — probation review feature set
- [NEOGOV Government HR Software](https://www.neogov.com/) — government-specific HR onboarding
- [HRCS กรมส่งเสริมการเกษตร](https://hrcs.doae.go.th/home) — Thai government HR system (login-gated, limited analysis possible)
- Existing mock UI: `frontend/src/pages/CandidateListsPage.vue`, `frontend/src/pages/ProbationEndPage.vue`

---
*Feature research for: Thai Government HR Career Path & Probation Tracking*
*Researched: 2026-03-22*
