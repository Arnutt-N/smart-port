# Roadmap: Smart Port — Candidate List & Probation Tracking

## Milestones

- ✅ **v1.0 Candidate List & Probation Tracking** — Phases 1-3 (shipped 2026-03-22)
- **v1.1 การนับเวลาเพิ่มเติม** — Phases 4-7 (in progress)

## Phases

<details>
<summary>v1.0 (Phases 1-3) — SHIPPED 2026-03-22</summary>

- [x] Phase 1: Database Foundation (2/2 plans) — completed 2026-03-22
- [x] Phase 2: Backend APIs (2/2 plans) — completed 2026-03-22
- [x] Phase 3: Frontend Integration (3/3 plans) — completed 2026-03-22

See: `.planning/milestones/v1.0-ROADMAP.md` for full details

</details>

### v1.1 การนับเวลาเพิ่มเติม

- [ ] **Phase 4: Database Preparation** - Seed supportive_job_series mappings and make diff_count a GENERATED column
- [ ] **Phase 5: Backend CRUD APIs** - REST endpoints for supportive, diverse, and equivalence features with server-side computation
- [ ] **Phase 6: Frontend CRUD Pages** - Vue pages for all 3 sub-menus replacing PlaceholderPage
- [ ] **Phase 7: QualificationEngine Integration** - Extend qualification date computation with all 3 data sources

## Phase Details

### Phase 4: Database Preparation
**Goal**: Database has seed data and schema refinements needed for all 3 CRUD features
**Depends on**: Phase 3 (v1.0 complete)
**Requirements**: SE-01
**Success Criteria** (what must be TRUE):
  1. supportive_job_series table contains seed data mapping which job series support each other with reduction ratios
  2. diff_count column in diverse_experience is a MySQL GENERATED column computed from the 4 boolean flags
  3. Docker compose initializes new seed data correctly on fresh database creation
**Plans**: TBD

### Phase 5: Backend CRUD APIs
**Goal**: All 3 features have working REST endpoints with server-side date arithmetic and business logic
**Depends on**: Phase 4
**Requirements**: SE-02, SE-04, DE-01, DE-03, PE-01, PE-03
**Success Criteria** (what must be TRUE):
  1. HR can create/read/update/delete supportive experience records via API, and effective_days is auto-computed from total_days and ratio
  2. HR can create/read/update/delete diverse experience records via API, and diff_count is server-computed (never client-submitted)
  3. HR can create/read/update/delete position equivalence records via API, with approval status transitions enforced (PENDING to APPROVED/REJECTED only)
  4. Only APPROVED equivalence records contribute to approved_total_days computation
**Plans**: TBD

### Phase 6: Frontend CRUD Pages
**Goal**: HR can manage all 3 types of time-counting records through Vue pages with Thai UI
**Depends on**: Phase 5
**Requirements**: SE-03, DE-02, PE-02
**Success Criteria** (what must be TRUE):
  1. HR can navigate to the supportive experience page, see a list of records, and create/edit entries with personnel selection and job series autocomplete
  2. HR can navigate to the diverse experience page, see the 4-dimension checklist per record, and the system shows diff_count with visual indication of 3-or-more qualification
  3. HR can navigate to the position equivalence page, see records with approval status badges (PENDING/APPROVED/REJECTED), and submit new equivalence requests
  4. All 3 pages display dates in Buddhist Era format and use Thai language throughout
**Plans**: TBD

### Phase 7: QualificationEngine Integration
**Goal**: Candidate list qualification dates incorporate supportive days, diverse experience gates, and equivalence days
**Depends on**: Phase 5, Phase 6
**Requirements**: QE-01, QE-02, QE-03, QE-04
**Success Criteria** (what must be TRUE):
  1. Candidate list qualification_date is adjusted earlier when a person has approved supportive experience days
  2. M1 (อำนวยการต้น) candidates show diverse experience qualification status, and those without 3+ differences are flagged
  3. Cross-type promotion candidates (e.g., K4 to S1) have equivalence days incorporated into their qualification date
  4. Existing candidate list output is unchanged when no new data exists (regression safety)
  5. Candidate list UI reflects the adjusted qualification dates from the engine
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Database Foundation | v1.0 | 2/2 | Complete | 2026-03-22 |
| 2. Backend APIs | v1.0 | 2/2 | Complete | 2026-03-22 |
| 3. Frontend Integration | v1.0 | 3/3 | Complete | 2026-03-22 |
| 4. Database Preparation | v1.1 | 0/? | Not started | - |
| 5. Backend CRUD APIs | v1.1 | 0/? | Not started | - |
| 6. Frontend CRUD Pages | v1.1 | 0/? | Not started | - |
| 7. QualificationEngine Integration | v1.1 | 0/? | Not started | - |
