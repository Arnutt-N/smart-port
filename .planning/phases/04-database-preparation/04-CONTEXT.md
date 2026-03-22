# Phase 4: Database Preparation - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Seed supportive_job_series mapping data and make diff_count a GENERATED column in diverse_experience. All 3 career path tables (supportive_experience, diverse_experience, position_equivalence) already exist but are empty. This phase prepares the data layer for CRUD operations in Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Seed Data Source
- **D-01:** Extract supportive_job_series mappings from ops-carrer-path.pdf pages 32-82 — focus on สายงาน pairs relevant to สำนักงานปลัดกระทรวงยุติธรรม
- **D-02:** Each mapping pair has a configurable ratio (percentage) — HR can adjust ratio per pair, not a fixed 100% for all
- **D-03:** Seed data goes into a new SQL init file (08-supportive-job-series-seed.sql) wired into Docker compose
- **D-04:** `SET NAMES utf8mb4;` at top of new SQL file (learned from v1.0 encoding bug)

### diff_count GENERATED Column
- **D-05:** ALTER TABLE diverse_experience to make diff_count a STORED GENERATED column: `diff_count INT GENERATED ALWAYS AS (is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature) STORED`
- **D-06:** Backend PHP also validates diff_count on INSERT/UPDATE as defense-in-depth (never trust client-sent diff_count)
- **D-07:** qualified_date auto-computed by backend: when diff_count >= 3, set qualified_date = the date when the 3rd difference was achieved (latest end_date among the qualifying records)

### supportive_job_series Schema
- **D-08:** Table already has ratio column via `mapping_type` — need to add explicit `ratio_percent INT DEFAULT 100` column if not present, or use mapping_type to derive ratio
- **D-09:** Each mapping is directional: primary_series → supportive_series (A supports B doesn't mean B supports A)

### Claude's Discretion
- Number of seed data pairs (extract what's available from PDF)
- ALTER TABLE migration strategy (new SQL file vs inline in existing)
- Whether to add indexes on new columns

</decisions>

<specifics>
## Specific Ideas

- Seed data should cover at minimum: นักทรัพยากรบุคคล, นักวิเคราะห์นโยบาย, นักวิชาการยุติธรรม, เจ้าพนักงานธุรการ — these are the active personnel in the system
- Ratio should be stored as integer percentage (100 = full credit, 50 = half credit)

</specifics>

<canonical_refs>
## Canonical References

### Career path rules
- `docs/documents/ops-carrer-path.pdf` pages 32-82 — supportive job series mapping tables and reduction ratios
- `docs/gap_analysis_career_path_v2.sql` — PostgreSQL schema for supportive_job_series, diverse_experience tables

### Existing schema
- `database/04-career-path.sql` — Current MySQL schema for all career path tables
- `database/06-seed-data.sql` — Example seed data pattern from v1.0

### Research findings
- `.planning/research/PITFALLS.md` — DATEDIFF off-by-one warning, GENERATED column recommendation
- `.planning/research/ARCHITECTURE.md` — Integration points and build order

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `database/06-seed-data.sql` — Seed data pattern (INSERT INTO with Thai text, SET NAMES utf8mb4)
- `docker-compose.yaml` — Docker entrypoint init file wiring pattern (volumes section)

### Established Patterns
- SQL init files numbered sequentially (01-07 exist, next is 08)
- All init files start with `SET NAMES utf8mb4;`
- Tables use `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`

### Integration Points
- `docker-compose.yaml` volumes section — new SQL file must be added
- `diverse_experience` table — ALTER TABLE for GENERATED column
- `supportive_job_series` table — INSERT seed data

</code_context>

<deferred>
## Deferred Ideas

- supportive_job_series CRUD UI for HR to manage mappings — Phase 6 or v2
- Automatic PDF parsing for seed data extraction — out of scope (manual extraction)

</deferred>

---

*Phase: 04-database-preparation*
*Context gathered: 2026-03-22*
