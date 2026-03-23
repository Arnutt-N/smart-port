# Milestones

## v1.1 การนับเวลาเพิ่มเติม (Shipped: 2026-03-23)

**Phases completed:** 4 phases, 10 plans, 14 tasks

**Key accomplishments:**

- ALTER TABLE adds ratio_percent + GENERATED diff_count columns, 14 K-series directional seed mappings wired into Docker init
- Supportive experience CRUD with server-side date arithmetic, ratio lookup via supportive_job_series, and Thai date formatting
- Diverse experience CRUD API with GENERATED column handling, server-side day counting, and qualified_date auto-computation
- Position equivalence CRUD with PENDING->APPROVED/REJECTED approval workflow, JWT-based approved_by tracking, and all 3 Phase 5 routes registered in api.php gateway
- 3 API composables (useSupportive, useDiverse, useEquivalence) with snake-to-camelCase mapping, 5 new StatusBadge keys, and router wired to real pages
- Full CRUD page for supportive experience (การนับเกื้อกูล) with personnel autocomplete, Thai IME search guard, modal forms, and delete confirmation
- Vue CRUD page for diverse experience (การนับแตกต่าง) with two-column from/to layout, 4-dimension checkboxes, live diff_count preview, and colored qualification badges
- EquivalencePage.vue with approval workflow -- list with status badges, create/edit/approve/reject modals, conditional action buttons by approval status
- Extended QualificationEngine with 3 LEFT JOIN aggregated subqueries incorporating supportive days, equivalence days, and diverse experience into qualification_date computation
- Added 3 new columns (supportive days, diverse status badge, equivalence days) to CandidateListsPage table with conditional display logic

---

## v1.0 Candidate List & Probation Tracking (Shipped: 2026-03-22)

**Phases completed:** 3 phases, 7 plans, 13 tasks

**Key accomplishments:**

- MySQL 8.0 schema with 20 tables, 2 DATEDIFF views, and K/O-series promotion criteria seed data for career path candidate list features
- 10 MySQL probation tables with dashboard view using DATEDIFF for remaining_days, plus Docker compose wiring for full 6-file schema init
- QualificationEngine with education-aware promotion criteria matching, DATE_ADD-based qualification date computation, Thai date/level helpers, and candidate list REST endpoints with search, pagination, and summary counts
- Probation tracking CRUD endpoints with vw_probation_dashboard for list, DATEDIFF-based remaining_days computation, search/pagination/summary counts, and dynamic update with allowed-fields whitelist
- API composables (useCandidates, useProbation), remaining days utility, StatusBadge with 7 new statuses, PaginationBar component, sidebar overview tab, and router redirect
- CandidateListsPage.vue rewritten with live API integration: overview dashboard (Promise.allSettled 5-level aggregation), general/academic sub-tab data tables, search debounce, pagination, and placeholder sections
- Probation tracking page with live API stat cards, color-coded remaining days, Thai status badges, debounced search, and pagination

---
