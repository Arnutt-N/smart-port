# Milestones

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
