# Phase 1: Database Foundation - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert PostgreSQL schemas (gap_analysis_career_path_v2.sql + probation_tracking_schema.sql) to MySQL 8.0, seed promotion criteria for ประเภททั่วไป + วิชาการ, create dashboard views, and provide sample data to verify views return results. This phase delivers the data layer only — no backend API or frontend changes.

</domain>

<decisions>
## Implementation Decisions

### Table naming & main entity
- **D-01:** Create new `personnel` table following PostgreSQL schema structure (PK: `personnel_id`) — career path and probation tables FK to `personnel`
- **D-02:** Existing `civil_servants` table remains untouched — coexists with `personnel` for now. Migration/unification is a future concern, not Phase 1
- **D-03:** ALTER on `personnel` (not `civil_servants`) to add `current_level_start_date`, `current_level_code`, `probation_end_date` — new columns default NULL, no backfill needed

### Missing FK dependencies
- **D-04:** Create stub tables (PK + name column only) for referenced tables that don't exist: `organization`, `position`, `users`, `training_course`, `lookup_value`, `personnel_order`, `notification_config`
- **D-05:** Create `personnel_position_history` as a full table (not stub) — required by views `vw_job_series_tenure` and `vw_executive_tenure` to return real results

### SQL file organization & Docker deployment
- **D-06:** Split into separate files by domain:
  - `03-personnel-stubs.sql` — `personnel` table + stub tables + `personnel_position_history`
  - `04-career-path.sql` — career path tables (promotion_criteria, qualification_calculation, diverse_experience, supportive_experience, position_equivalence, screening_list, promotion_evaluation, supportive_job_series, rotation_assignment, promotion_required_training, professional_license) + views
  - `05-probation.sql` — probation tables (probation_program, probation_task_template, probation_enrollment, probation_stakeholder, probation_task_progress, elearning_course, elearning_enrollment, probation_evaluation, probation_committee, probation_committee_member) + vw_probation_dashboard
  - `06-seed-data.sql` — promotion_criteria seed + sample personnel + sample probation enrollments
- **D-07:** Mount all files into `docker-entrypoint-initdb.d/` via docker-compose — numeric prefix ensures correct execution order
- **D-08:** Dev workflow: `docker-compose down -v` then `docker-compose up` to recreate from scratch. No migration system needed at this stage — only sample data exists

### Seed data scope
- **D-09:** Seed promotion_criteria for Phase 1 scope only: O1→O2, O2→O3 (ประเภททั่วไป) and K1→K2, K2→K3, K3→K4 (ประเภทวิชาการ) — approximately 10-15 rows with education-dependent year thresholds
- **D-10:** Year threshold values (min_years) extracted from ops-carrer-path.pdf and SQL comments — researcher agent reads PDF to confirm exact values
- **D-11:** Do NOT seed M1/M2/S1/S2/K5 criteria — no backend to verify correctness yet, risk of silent wrong data

### Sample data for view verification
- **D-12:** Insert 5-10 sample personnel records with `current_level_code`, `current_level_start_date`, and position history entries — enough to test career path views return computed results
- **D-13:** Insert 1 sample probation_program + 2-3 sample probation_enrollment records with varying end_dates — enough to test vw_probation_dashboard returns rows with dynamically computed remaining_days and different color-code thresholds

### Claude's Discretion
- Exact stub table column definitions (beyond PK + name)
- personnel_position_history full column list (follow PostgreSQL schema + MySQL adaptations)
- Sample data names and values (Thai names, realistic dates)
- Index strategy for new tables
- MySQL-specific syntax choices (ENGINE=InnoDB, CHARSET, etc.)

</decisions>

<specifics>
## Specific Ideas

- PostgreSQL → MySQL conversion checklist: BIGSERIAL→BIGINT AUTO_INCREMENT, BOOLEAN→TINYINT(1), date1-date2→DATEDIFF(date1,date2), ||→CONCAT(), COMMENT ON TABLE→table/column comments in CREATE syntax, CREATE OR REPLACE VIEW→CREATE VIEW (drop first if exists)
- Sample probation enrollments should include: one with >30 days remaining (green), one with 7-14 days (orange), one already past end_date (red) — to verify view computes all threshold ranges

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Career path schema (source PostgreSQL)
- `docs/gap_analysis_career_path_v2.sql` — Full PostgreSQL schema: 3 ALTERs, 9 new tables, 2 views. Every CREATE TABLE and COMMENT contains exact column definitions and business rules
- `docs/hr_database_schema.sql` — Original 112-table PostgreSQL reference schema. Use for `personnel_position_history` full structure and understanding FK targets

### Probation schema (source PostgreSQL)
- `docs/probation_tracking_schema.sql` — Full PostgreSQL schema: 1 ALTER, 10 new tables, 1 view (vw_probation_dashboard), notification config INSERTs

### Promotion criteria values
- `docs/documents/ops-carrer-path.pdf` — 86 pages, Thai civil service career path rules. Pages 31-82 contain year thresholds per level per education. Researcher agent must extract exact min_years values for O1→O2, O2→O3, K1→K2, K2→K3, K3→K4

### Existing MySQL database
- `init.sql` — Current MySQL schema: `prefixes`, `civil_servants`, `civil_servant_photos`, view, procedure, 1 sample row
- `docker-compose.yaml` — Lines 52-55: current init script mounting pattern (`docker-entrypoint-initdb.d/`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `init.sql` — Establishes MySQL conventions already in use: `AUTO_INCREMENT`, `BOOLEAN`, `TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, `ON UPDATE CURRENT_TIMESTAMP`, `ENUM()` types, `CHARACTER SET utf8mb4`

### Established Patterns
- Table naming: snake_case lowercase
- PK naming: `{table_name}_id` with `INT AUTO_INCREMENT` (existing) or `BIGINT AUTO_INCREMENT` (new tables follow PostgreSQL's BIGSERIAL pattern)
- FK declared inline with `FOREIGN KEY (col) REFERENCES table(col)`
- Views prefixed with `v_` (existing) — new views use `vw_` prefix per PostgreSQL source
- Docker init via numeric-prefixed `.sql` files in `docker-entrypoint-initdb.d/`

### Integration Points
- `docker-compose.yaml` volumes section — new SQL files must be added here
- `db-data` named volume — must be deleted (`docker-compose down -v`) for new init scripts to take effect

</code_context>

<deferred>
## Deferred Ideas

- Migration from `civil_servants` → `personnel` data unification — future phase when real data exists
- Migration system (versioned SQL scripts with tracking) — not needed until schema stabilizes
- M1/M2/S1/S2/K5 promotion criteria seed data — Phase 2+ when backend can verify
- Notification config INSERTs from probation schema — Phase 2+ (notification feature is out of scope v1)

</deferred>

---

*Phase: 01-database-foundation*
*Context gathered: 2026-03-22*
