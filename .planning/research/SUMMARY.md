# Research Summary: v1.1 การนับเวลาเพิ่มเติม

**Project:** Smart Port HRIS - Time Counting Sub-menus
**Domain:** Thai Government HR Career Path Time Adjustments
**Researched:** 2026-03-22
**Confidence:** HIGH

## Executive Summary

v1.1 adds three CRUD sub-menus (เกื้อกูล, แตกต่าง, เทียบตำแหน่ง) that feed time-adjustment data into the existing QualificationEngine. This is **extension work, not greenfield** -- database tables exist (empty), sidebar links exist (pointing to placeholders), router entries exist, and the QualificationEngine has columns ready for the new data. The work is filling in slots at every layer: 4 backend route handlers, 3 frontend pages with composables, seed data for supportive job series mappings, and extending the QualificationEngine SQL to incorporate the new data sources.

The recommended approach is zero new dependencies. All date arithmetic stays server-side in MySQL (DATEDIFF, DATE_ADD, DATE_SUB). The frontend is display + forms only. Each feature follows the proven `routes/probation.php` + `useProbation.js` CRUD pattern. Build order should be: Supportive (simplest, establishes pattern) then Diverse (adds boolean logic) then Equivalence (adds approval workflow) then QualificationEngine integration (depends on all three having data).

The top risks are: (1) off-by-one date counting errors that shift qualification dates and break HR trust, (2) QualificationEngine JOIN changes producing duplicate rows that break the existing candidate list, (3) approval state machine gaps allowing unapproved equivalence days to count, and (4) diff_count inconsistency if not enforced as a server-computed or generated column. All four are preventable with specific patterns documented in the pitfalls research.

## Stack Additions

**Zero new dependencies.** No npm packages, no Composer packages, no build config changes.

| Category | What Is Needed | Already Exists |
|----------|---------------|----------------|
| Backend routes | 4 new PHP files in `routes/` | Pattern from `routes/probation.php` |
| Frontend pages | 3 Vue pages + 3 composables | Pattern from `ProbationEndPage.vue` + `useProbation.js` |
| Database schema | No changes (tables exist in `04-career-path.sql`) | All 3 tables + qualification_calculation columns |
| Seed data | 1 new SQL file for `supportive_job_series` mappings | Table exists, needs 50-100 rows |
| Shared components | 0 new (reuse StatCard, StatusBadge, PaginationBar) | All exist from v1.0 |

**Optional extraction:** A `PersonnelPicker.vue` shared component (personnel search/select used by all 3 pages). Not strictly required but prevents triple-implementation of the same search UI.

## Feature Landscape

### Sub-Menu 1: Supportive Experience (เกื้อกูล) -- affects ALL promotion levels

**Table stakes:** CRUD records, auto-compute total_days/effective_days from dates + ratio, personnel search, job series autocomplete from mapping table, Thai date display (B.E.), date validation, summary per person.

**Differentiators:** Side-by-side view (series tenure + supportive = total), seed data for job series mappings (biggest effort), inline impact preview on qualification_date.

**Defer:** Bulk Excel import, admin UI for mapping management.

### Sub-Menu 2: Diverse Experience (แตกต่าง / 3 ต่าง) -- affects M1 promotion only

**Table stakes:** CRUD for from/to position pairs, auto-compute 4 diff flags and diff_count, visual checklist of 4 dimensions, auto-set qualified_date when diff_count >= 3, personnel search.

**Differentiators:** Dashboard showing who has/hasn't met 3 ต่าง, warning when only 2 ต่าง met.

**Defer:** Auto-populate from position_history, timeline visualization, bulk import.

### Sub-Menu 3: Position Equivalence (เทียบตำแหน่ง) -- affects cross-type promotions (K4->S1)

**Table stakes:** CRUD with request vs approved date splits, approval status tracking (PENDING/APPROVED/REJECTED), auto-compute days for both periods, status badges, filter by status.

**Differentiators:** Approval workflow with approved_by audit trail, pending count on dashboard.

**Defer:** Notification system, bulk import.

### Cross-Cutting

**Table stakes:** Navigation sub-menu grouping, QualificationEngine integration (the point of v1.1), candidate list reflecting adjusted dates, consistent UI patterns across all 3 pages, REST CRUD endpoints.

**Defer to v2:** Excel export, person detail panel aggregating all 3 adjustments, full audit trail.

## Architecture Integration

The architecture is straightforward extension at every layer.

**Backend:** 4 new `case` blocks in `api.php` dispatching to 4 new route files (`routes/supportive.php`, `routes/diverse.php`, `routes/equivalence.php`, `routes/supportive-series.php`). Each follows `routes/probation.php` handler pattern. QualificationEngine gets LEFT JOINs to aggregate per-personnel data from the 3 new tables into subqueries returning exactly one row per personnel_id.

**Frontend:** 3 new pages replace PlaceholderPage at existing routes. Each has a matching composable wrapping `useApi()`. Existing shared components (StatCard, StatusBadge, PaginationBar) cover all UI needs. StatusBadge needs new status mappings for PENDING/APPROVED/REJECTED.

**Database:** No schema changes needed. One seed data file for `supportive_job_series`. One optional ALTER TABLE to make `diff_count` a GENERATED column (strongly recommended).

**Key integration point:** QualificationEngine.php is the single most critical modification. It must aggregate supportive/diverse/equivalence data into subqueries that return one row per personnel, then incorporate them into the existing DATE_ADD computation without breaking existing candidate list output.

**Build order by layer:**
1. Database prep (seed + optional ALTER) -- no dependencies
2. Backend CRUD routes (supportive -> diverse -> equivalence) -- depends on DB
3. Frontend pages (same order) -- depends on backend APIs
4. QualificationEngine extension -- depends on all 3 CRUDs having data

## Critical Pitfalls

### 1. Date Arithmetic Off-by-One (CRITICAL)
`DATEDIFF` is exclusive but Thai civil service counting is inclusive. Every supportive record is 1 day short. Compounds across records. **Prevention:** Add +1 to DATEDIFF, validate against HR Excel for 5+ known records.

### 2. QualificationEngine Extension Breaks Existing Candidate List (CRITICAL)
Adding JOINs to supportive/diverse/equivalence can produce duplicate rows (one per supportive record per person). **Prevention:** Aggregate into subquery returning one row per personnel_id before joining. Run regression test: existing candidate list output must be identical when no new data exists.

### 3. Approval State Machine Missing for Position Equivalence (CRITICAL)
Without state transition enforcement, records can go REJECTED->APPROVED or be edited after approval. QualificationEngine might count PENDING records. **Prevention:** Enforce PENDING->APPROVED/REJECTED only (no backward transitions). Filter `WHERE approval_status = 'APPROVED'` exclusively in engine.

### 4. diff_count Inconsistency (CRITICAL)
If diff_count is client-submitted rather than server-computed, it can disagree with the boolean flags. **Prevention:** Make diff_count a MySQL GENERATED column. Never accept from client.

## Recommended Build Order

All four researchers converge on the same sequence:

### Phase 1: Database Preparation
**Rationale:** Foundation -- seed data and schema refinements must exist before CRUD or engine work.
**Delivers:** `supportive_job_series` seed data, `diff_count` GENERATED column migration, UTF-8-safe SQL files.
**Avoids:** Pitfall #4 (diff_count inconsistency), Pitfall #6 (UTF-8 in seed files), Pitfall #11 (Docker volume stale schema).
**Research needed:** No -- standard SQL patterns.

### Phase 2: Backend CRUD APIs (all 3 features)
**Rationale:** Backend can be tested independently via cURL. Establishes the data layer before UI work.
**Delivers:** 4 route handlers (supportive, diverse, equivalence, supportive-series) + registration in api.php.
**Sub-order:** Supportive first (simplest), then Diverse (adds diff_count logic), then Equivalence (adds approval workflow).
**Avoids:** Pitfall #1 (date arithmetic), Pitfall #3 (approval state machine), Pitfall #5 (route bloat), Pitfall #8 (validation gaps).
**Research needed:** No -- direct copy of probation.php pattern.

### Phase 3: Frontend CRUD Pages (all 3 features)
**Rationale:** Depends on backend APIs being available. All 3 pages share the same structure.
**Delivers:** SupportiveExpPage, DiverseExpPage, PositionEquivPage + composables + router updates.
**Sub-order:** Build PersonnelPicker shared component first (if extracting), then pages in same order as backend.
**Avoids:** Pitfall #6 (Thai IME), Pitfall #9 (personnel picker duplication), Pitfall #10 (navigation structure).
**Research needed:** No -- direct adaptation of ProbationEndPage pattern.

### Phase 4: QualificationEngine Integration
**Rationale:** Must come last -- depends on all 3 CRUDs being functional with data to test against.
**Delivers:** Extended computeForLevel() and computeDetail() incorporating supportive_days, diverse_exp gate for M1, equivalence_days for S1. Candidate list reflects adjusted dates.
**Avoids:** Pitfall #2 (engine extension breaks existing). This phase MUST include regression testing.
**Research needed:** YES -- the SQL subquery aggregation pattern needs careful design. Recommend `/gsd:research-phase` before implementation.

### Phase Ordering Rationale

- Database before backend: seed data needed for job series validation in supportive CRUD
- Backend before frontend: APIs must exist for frontend to call
- All 3 CRUDs before engine: engine integration needs data in all 3 tables to test
- Supportive before Diverse before Equivalence: increasing complexity, each builds on patterns from the previous
- Engine integration last: highest risk, needs all other pieces working

### Research Flags

**Needs `/gsd:research-phase`:**
- Phase 4 (QualificationEngine Integration) -- SQL aggregation with multiple LEFT JOIN subqueries is the highest-risk change. Needs query design, performance testing, and regression verification.

**Standard patterns (skip research):**
- Phase 1 (Database Preparation) -- standard SQL seed + ALTER TABLE
- Phase 2 (Backend CRUD) -- direct replication of probation.php
- Phase 3 (Frontend Pages) -- direct adaptation of ProbationEndPage

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies. All patterns verified against working codebase. |
| Features | HIGH | Domain rules documented in SQL comments with legal references. Schema already reflects feature design. |
| Architecture | HIGH | Direct codebase analysis. Every integration point verified (routes, composables, engine, router). |
| Pitfalls | HIGH | Based on v1.0 retrospective lessons + schema review + pattern analysis of the template code being copied. |

**Overall confidence:** HIGH

### Gaps to Address

- **Supportive job series seed data completeness:** Only a subset of the 200+ mappings from the PDF can be seeded initially. HR will need a way to report missing mappings.
- **RBAC for approval workflow:** Any authenticated user can currently approve position equivalence. Acceptable for v1.1 (single HR admin), must be flagged for v2.
- **QualificationEngine query performance:** Adding 3 LEFT JOIN subqueries may degrade performance. Must test with realistic data volume (500+ personnel).
- **Inclusive vs exclusive date counting convention:** The +1 convention for DATEDIFF needs HR Excel validation before go-live.
- **Legal reference verification:** Domain rules derived from SQL comments referencing ว5, ว3, ว17 circulars -- not directly verified against original documents.

## Open Questions

1. **Inclusive date counting:** Should `DATEDIFF(end_date, start_date) + 1` be universal, or does it vary by record type? Need HR confirmation.
2. **Ratio values:** Are only 50/75/100 valid for supportive experience, or are there other ratios? Schema allows DECIMAL(5,2) but UI should constrain.
3. **Active job series at MOJ:** Which series are actually used? Seed data should prioritize these.
4. **is_diff_work_nature:** Confirmed subjective -- HR must manually flag this. Other 3 dimensions can be auto-detected.
5. **Who can approve equivalence?** Current design allows any authenticated user. Is this acceptable for v1.1?

## Sources

### Primary (HIGH confidence)
- `backend/QualificationEngine.php` -- current computation logic
- `database/04-career-path.sql` -- table schemas for all 3 features
- `backend/routes/probation.php` -- CRUD pattern template
- `backend/routes/candidates.php` -- route handler pattern
- `backend/api.php` -- gateway routing structure
- `frontend/src/composables/useProbation.js` -- composable pattern
- `frontend/src/router/index.js` -- placeholder routes
- `.planning/PROJECT.md` -- v1.1 requirements
- `.planning/RETROSPECTIVE.md` -- v1.0 lessons learned

### Secondary (MEDIUM confidence)
- `docs/gap_analysis_career_path_v2.sql` -- domain rules with Thai legal references
- Legal references: นร 1006/ว5, ว3, ว17 -- cited in SQL but not directly verified

### Tertiary (LOW confidence)
- OCSC PDF (pages 32-82) for supportive job series mappings -- not machine-readable

---
*Research completed: 2026-03-22*
*Ready for roadmap: yes*
