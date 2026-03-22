# Phase 04: Database Preparation - Research

**Researched:** 2026-03-22
**Domain:** MySQL schema migration, seed data, Docker init scripts
**Confidence:** HIGH

## Summary

This phase prepares the data layer for the v1.1 time-counting features. Three tasks are needed: (1) seed the `supportive_job_series` mapping table with job series pairs and default ratios extracted from the PDF career path document, (2) convert `diverse_experience.diff_count` from a regular INT column to a STORED GENERATED column, and (3) add a `ratio_percent` column to `supportive_job_series` since the table currently only has `mapping_type` without an explicit ratio. All three changes go into a new SQL init file (`08-supportive-job-series-seed.sql`) wired into Docker compose.

The existing tables (`supportive_experience`, `diverse_experience`, `position_equivalence`, `supportive_job_series`) are already created in `04-career-path.sql` but are empty. The `supportive_experience` table already has a `ratio_percent` column for per-record ratios, but the mapping table (`supportive_job_series`) needs a `ratio_percent` column to store the default ratio per series pair. The `diverse_experience.diff_count` column exists as a plain `INT DEFAULT 0` and must be converted to `GENERATED ALWAYS AS (is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature) STORED` to prevent client/server data inconsistency.

**Primary recommendation:** Create a single new SQL file (`database/08-career-path-v11.sql`) containing the ALTER TABLE statements and seed INSERT statements, following the established `SET NAMES utf8mb4;` pattern, and wire it into `docker-compose.yaml`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Extract supportive_job_series mappings from ops-carrer-path.pdf pages 32-82 -- focus on สายงาน pairs relevant to สำนักงานปลัดกระทรวงยุติธรรม
- **D-02:** Each mapping pair has a configurable ratio (percentage) -- HR can adjust ratio per pair, not a fixed 100% for all
- **D-03:** Seed data goes into a new SQL init file (08-supportive-job-series-seed.sql) wired into Docker compose
- **D-04:** `SET NAMES utf8mb4;` at top of new SQL file (learned from v1.0 encoding bug)
- **D-05:** ALTER TABLE diverse_experience to make diff_count a STORED GENERATED column: `diff_count INT GENERATED ALWAYS AS (is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature) STORED`
- **D-06:** Backend PHP also validates diff_count on INSERT/UPDATE as defense-in-depth (never trust client-sent diff_count)
- **D-07:** qualified_date auto-computed by backend: when diff_count >= 3, set qualified_date = the date when the 3rd difference was achieved (latest end_date among the qualifying records)
- **D-08:** Table already has ratio column via `mapping_type` -- need to add explicit `ratio_percent INT DEFAULT 100` column if not present, or use mapping_type to derive ratio
- **D-09:** Each mapping is directional: primary_series -> supportive_series (A supports B doesn't mean B supports A)

### Claude's Discretion
- Number of seed data pairs (extract what's available from PDF)
- ALTER TABLE migration strategy (new SQL file vs inline in existing)
- Whether to add indexes on new columns

### Deferred Ideas (OUT OF SCOPE)
- supportive_job_series CRUD UI for HR to manage mappings -- Phase 6 or v2
- Automatic PDF parsing for seed data extraction -- out of scope (manual extraction)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SE-01 | Seed data for supportive_job_series mapping (สายงานไหนเกื้อกูลกัน + อัตราลดทอน) | Mapping pairs identified from PDF comments in gap_analysis SQL; ALTER TABLE for ratio_percent column; INSERT statements with Thai text |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| MySQL | 8.0 | Database engine | Already in docker-compose, supports GENERATED columns and CHECK constraints |
| Docker MySQL init | N/A | Schema initialization | Existing pattern: files in `/docker-entrypoint-initdb.d/` run on first volume creation |

### Supporting
No additional libraries needed. This phase is pure SQL.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| STORED generated column | VIRTUAL generated column | VIRTUAL saves disk but cannot be indexed; STORED is correct here because diff_count is used in WHERE clauses and JOINs by QualificationEngine |
| Single SQL file for all changes | Separate files for ALTER vs INSERT | Single file is simpler; numbered init scripts run in order so one file is fine |

## Architecture Patterns

### Recommended File Structure
```
database/
├── 04-career-path.sql           # Existing: creates tables (already deployed)
├── 06-seed-data.sql             # Existing: promotion_criteria + sample personnel
├── 07-add-education-level.sql   # Existing: ALTER TABLE pattern to follow
└── 08-career-path-v11.sql       # NEW: ALTER TABLEs + supportive_job_series seed
```

### Pattern 1: SQL Init File Structure
**What:** Every new SQL file follows the established header pattern.
**When to use:** Any new `.sql` file added to Docker init.
**Example:**
```sql
-- Source: database/07-add-education-level.sql (existing pattern)
SET NAMES utf8mb4;
-- ============================================================================
-- 08-career-path-v11.sql
-- v1.1 Database Preparation: ALTER TABLEs + Seed Data
-- สำนักงานปลัดกระทรวงยุติธรรม
--
-- Contents:
--   Section 1: ALTER supportive_job_series (add ratio_percent)
--   Section 2: ALTER diverse_experience (diff_count -> GENERATED)
--   Section 3: Seed supportive_job_series mapping data
--
-- Dependencies: 04-career-path.sql (tables must exist)
-- ============================================================================
```

### Pattern 2: ALTER TABLE for GENERATED Column (DROP + ADD approach)
**What:** Convert existing `diff_count` column from regular INT to STORED GENERATED.
**When to use:** When an existing column needs to become generated.
**Example:**
```sql
-- Source: MySQL 8.0 docs - ALTER TABLE and Generated Columns
-- https://dev.mysql.com/doc/refman/8.0/en/alter-table-generated-columns.html
--
-- Option A: MODIFY (works for non-generated -> stored generated)
ALTER TABLE diverse_experience
  MODIFY COLUMN diff_count INT
  GENERATED ALWAYS AS (is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature) STORED;

-- Option B: DROP + ADD (safer if MODIFY fails due to DEFAULT clause conflict)
ALTER TABLE diverse_experience DROP COLUMN diff_count;
ALTER TABLE diverse_experience ADD COLUMN diff_count INT
  GENERATED ALWAYS AS (is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature) STORED;
```

**Recommendation:** Use Option A (MODIFY) first. MySQL 8.0 explicitly supports converting non-generated to stored generated columns. If it fails due to the existing `DEFAULT 0` clause, fall back to Option B (DROP + ADD). The table is empty so no data loss either way.

### Pattern 3: Seed Data INSERT with Thai Text
**What:** Multi-row INSERT for supportive_job_series mapping data.
**When to use:** Seeding reference/lookup data.
**Example:**
```sql
-- Source: database/06-seed-data.sql (existing pattern)
INSERT INTO supportive_job_series
  (primary_series_name, supportive_series_name, mapping_type, ratio_percent, is_active, effective_date)
VALUES
  ('นักวิเคราะห์นโยบายและแผน', 'นักวิชาการยุติธรรม', 'SAME_GROUP', 100, 1, '2024-03-22'),
  ('นักวิเคราะห์นโยบายและแผน', 'นักทรัพยากรบุคคล', 'SAME_GROUP', 100, 1, '2024-03-22');
```

### Pattern 4: Docker Compose Volume Mount
**What:** Wire new SQL file into Docker init.
**When to use:** Any new init SQL file.
**Example:**
```yaml
# docker-compose.yaml - add after line 59 (07-add-education-level.sql)
- ./database/08-career-path-v11.sql:/docker-entrypoint-initdb.d/08-career-path-v11.sql
```

### Anti-Patterns to Avoid
- **Modifying 04-career-path.sql directly:** This file creates tables. Schema modifications for v1.1 go in a new numbered file so fresh installs and migrations both work.
- **Omitting SET NAMES utf8mb4:** Causes Thai text mojibake. Every SQL file must start with this.
- **Using primary_series_id/supportive_series_id FK references:** The lookup_value table may not have matching IDs. Use name-based matching (primary_series_name/supportive_series_name) for seed data. FK IDs can be populated later if lookup data becomes available.
- **Trusting client-sent diff_count:** The GENERATED column makes this impossible at the DB level, but backend must also strip diff_count from INSERT/UPDATE input.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| diff_count consistency | PHP-only validation | MySQL GENERATED ALWAYS AS (STORED) | DB-level guarantee; cannot be bypassed by direct SQL inserts or bugs |
| Thai text encoding | Manual charset headers | `SET NAMES utf8mb4;` + table COLLATE utf8mb4_unicode_ci | Established pattern, proven in v1.0 |
| Init script ordering | Custom migration runner | Docker MySQL init alphabetical ordering (01-, 02-, ..., 08-) | Docker handles execution order by filename sort |

**Key insight:** The GENERATED column is the single most important decision in this phase. It eliminates an entire class of data consistency bugs at the database level, which no amount of application-level validation can match.

## Common Pitfalls

### Pitfall 1: MODIFY with DEFAULT Clause Conflict
**What goes wrong:** The existing `diff_count` column is defined as `INT DEFAULT 0`. When you try `MODIFY COLUMN diff_count INT GENERATED ALWAYS AS (...) STORED`, MySQL may reject it because generated columns cannot have a DEFAULT clause.
**Why it happens:** The original CREATE TABLE defined `diff_count INT DEFAULT 0`. MODIFY replaces the definition entirely, but some MySQL versions may error if the old definition conflicts.
**How to avoid:** If MODIFY fails, use DROP COLUMN + ADD COLUMN. The table is empty so no data loss risk.
**Warning signs:** Error message mentioning "DEFAULT" and "GENERATED" conflict.

### Pitfall 2: Docker Volume Prevents Init Script Execution
**What goes wrong:** Docker MySQL only runs init scripts on first volume creation. If the `db-data` volume already exists, adding `08-career-path-v11.sql` does nothing.
**Why it happens:** MySQL Docker image checks if the data directory is empty before running init scripts.
**How to avoid:** Document that developers must run `docker-compose down -v && docker-compose up` after adding the new SQL file. Add a comment in docker-compose.yaml.
**Warning signs:** Table exists but has no seed data; `diff_count` is still a regular column.

### Pitfall 3: Thai Series Name Typos Break JOINs
**What goes wrong:** The `supportive_job_series.primary_series_name` must exactly match what is stored in `personnel_position_history.job_series_name` for lookups to work. A single space, abbreviation, or character difference causes zero matches.
**Why it happens:** Thai text has subtle variations -- spaces before/after, use of abbreviation marks, different romanization.
**How to avoid:** Cross-reference seed data names against existing `personnel_position_history.job_series_name` values and `position.position_name` values in the seed data (06-seed-data.sql). Use the exact same Thai strings.
**Warning signs:** `SELECT COUNT(*) FROM supportive_job_series sjs JOIN personnel_position_history pph ON sjs.primary_series_name = pph.job_series_name` returns 0.

### Pitfall 4: Missing ratio_percent Column on supportive_job_series
**What goes wrong:** The existing `supportive_job_series` table (created by 04-career-path.sql) does NOT have a `ratio_percent` column. It only has `mapping_type VARCHAR(50)`. If the seed INSERT includes `ratio_percent`, it will fail.
**Why it happens:** The original PostgreSQL schema did not include ratio_percent on the mapping table (it was only on supportive_experience per-record). D-08 explicitly calls for adding it.
**How to avoid:** The new SQL file must ALTER TABLE to add the column before INSERTing seed data.
**Warning signs:** INSERT fails with "Unknown column 'ratio_percent'".

## Code Examples

### Complete ALTER TABLE Sequence
```sql
-- Source: MySQL 8.0 Reference Manual + project decisions D-05, D-08

-- 1. Add ratio_percent to supportive_job_series (D-08)
ALTER TABLE supportive_job_series
  ADD COLUMN ratio_percent INT DEFAULT 100
  AFTER mapping_type;

-- 2. Convert diff_count to GENERATED column (D-05)
-- MODIFY approach (preferred -- MySQL 8.0 supports non-generated -> stored generated)
ALTER TABLE diverse_experience
  MODIFY COLUMN diff_count INT
  GENERATED ALWAYS AS (is_diff_job_series + is_diff_org + is_diff_location + is_diff_work_nature) STORED;
```

### Supportive Job Series Seed Data (Extracted from PDF/SQL Comments)

The gap analysis SQL (`docs/gap_analysis_career_path_v2.sql`) COMMENT ON TABLE for `supportive_job_series` provides these confirmed mappings:

| Primary Series | Supportive Series | Type | Ratio |
|---|---|---|---|
| นักประชาสัมพันธ์ | นักวิชาการโสตทัศนศึกษา | SAME_GROUP | 100% |
| นักวิเคราะห์นโยบายและแผน | นักวิชาการยุติธรรม | SAME_GROUP | 100% |
| นักวิเคราะห์นโยบายและแผน | นักทรัพยากรบุคคล | SAME_GROUP | 100% |
| นักวิเคราะห์นโยบายและแผน | นักจัดการงานทั่วไป | SAME_GROUP | 100% |
| นักวิชาการยุติธรรม | นักวิเคราะห์นโยบายและแผน | SAME_GROUP | 100% |
| นักวิชาการยุติธรรม | นักทรัพยากรบุคคล | SAME_GROUP | 100% |
| นักวิชาการยุติธรรม | นักจัดการงานทั่วไป | SAME_GROUP | 100% |
| นักทรัพยากรบุคคล | นักวิเคราะห์นโยบายและแผน | SAME_GROUP | 100% |
| นักทรัพยากรบุคคล | นักวิชาการยุติธรรม | SAME_GROUP | 100% |
| นักทรัพยากรบุคคล | นักจัดการงานทั่วไป | SAME_GROUP | 100% |
| นักจัดการงานทั่วไป | นักวิเคราะห์นโยบายและแผน | SAME_GROUP | 100% |
| นักจัดการงานทั่วไป | นักวิชาการยุติธรรม | SAME_GROUP | 100% |
| นักจัดการงานทั่วไป | นักทรัพยากรบุคคล | SAME_GROUP | 100% |
| นิติกร | (none) | EXCLUSIVE | N/A |

**Confidence:** MEDIUM -- These are extracted from SQL comments referencing the PDF. The PDF itself could not be read due to tooling limitations. The SQL comments in `gap_analysis_career_path_v2.sql` lines 242-247 are the source.

**Minimum viable seed:** The CONTEXT.md specifies these series must be covered: นักทรัพยากรบุคคล, นักวิเคราะห์นโยบาย, นักวิชาการยุติธรรม, เจ้าพนักงานธุรการ. The first three form a mutual supportive group. เจ้าพนักงานธุรการ is ประเภททั่วไป (O-series) and likely has its own supportive mappings not documented in the SQL comments.

**Note on directionality (D-09):** Each mapping is directional. If นักวิเคราะห์ฯ supports นักทรัพยากรฯ, a separate row is needed for the reverse. The seed data above already reflects this -- each pair has both directions.

### Docker Compose Wiring
```yaml
# Add after line 59 in docker-compose.yaml
- ./database/08-career-path-v11.sql:/docker-entrypoint-initdb.d/08-career-path-v11.sql
```

### Verification Queries
```sql
-- Verify diff_count is GENERATED
SHOW COLUMNS FROM diverse_experience WHERE Field = 'diff_count';
-- Extra column should show "STORED GENERATED"

-- Verify ratio_percent column exists
SHOW COLUMNS FROM supportive_job_series WHERE Field = 'ratio_percent';

-- Verify seed data loaded
SELECT COUNT(*) FROM supportive_job_series;
-- Should be >= 13 rows (minimum viable seed)

-- Verify Thai text encoding
SELECT primary_series_name FROM supportive_job_series LIMIT 1;
-- Should display Thai text correctly, not mojibake
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Application-only validation for derived columns | MySQL GENERATED columns (since 5.7) | MySQL 5.7.6+ | Eliminates data inconsistency at DB level |
| Manual column DEFAULT + app override | STORED GENERATED for computed values | Standard practice | Cannot be bypassed by direct SQL or API bugs |

**Deprecated/outdated:**
- Using triggers for computed columns: GENERATED columns are the modern replacement, simpler and more maintainable.

## Open Questions

1. **Complete supportive_job_series mapping from PDF pages 32-82**
   - What we know: SQL comments provide ~14 mappings for 4-5 job series (วิชาการ group + นิติกร)
   - What's unclear: The PDF has 50+ pages of mappings covering all job series. The tool cannot read the PDF.
   - Recommendation: Seed the confirmed mappings from SQL comments. Document that additional mappings should be added by HR via direct SQL or a future admin UI. This is explicitly acceptable per CONTEXT.md ("Number of seed data pairs -- Claude's discretion").

2. **เจ้าพนักงานธุรการ supportive mappings**
   - What we know: This series is listed in CONTEXT.md as requiring coverage
   - What's unclear: Which series support เจ้าพนักงานธุรการ (O-series, different from K-series mappings)
   - Recommendation: Add a placeholder row or omit and document as a gap. O-series supportive mappings may follow different rules.

## Sources

### Primary (HIGH confidence)
- [MySQL 8.0 ALTER TABLE and Generated Columns](https://dev.mysql.com/doc/refman/8.0/en/alter-table-generated-columns.html) -- MODIFY syntax for non-generated to stored generated conversion
- `database/04-career-path.sql` -- Current table schemas (supportive_job_series lacks ratio_percent)
- `database/06-seed-data.sql` -- Established seed data pattern with SET NAMES utf8mb4
- `database/07-add-education-level.sql` -- ALTER TABLE pattern for init scripts
- `docker-compose.yaml` -- Volume mount pattern for SQL init files

### Secondary (MEDIUM confidence)
- `docs/gap_analysis_career_path_v2.sql` lines 230-247 -- Supportive job series mappings from SQL COMMENT ON TABLE (derived from PDF)
- `.planning/research/PITFALLS.md` -- Pitfalls #4 (diff_count), #6 (UTF-8), #7 (seed volume), #11 (Docker stale volume)
- `.planning/research/ARCHITECTURE.md` -- Integration points and build order

### Tertiary (LOW confidence)
- PDF supportive job series data beyond the 14 mappings extracted from SQL comments -- could not read PDF directly

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- MySQL 8.0 GENERATED columns well-documented, existing patterns clear
- Architecture: HIGH -- File structure, Docker wiring, and SQL patterns are established in codebase
- Pitfalls: HIGH -- All identified from existing research + official MySQL docs
- Seed data completeness: MEDIUM -- Confirmed 14 mappings from SQL comments; full PDF data unavailable

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable domain, no fast-moving dependencies)
