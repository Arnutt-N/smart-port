# Phase 1: Database Foundation - Research

**Researched:** 2026-03-22
**Domain:** MySQL 8.0 schema conversion (PostgreSQL to MySQL), seed data, dashboard views
**Confidence:** HIGH

## Summary

This phase converts two PostgreSQL schema files (career path + probation tracking) into MySQL 8.0, creates stub tables for FK dependencies, seeds promotion criteria for O1-O3 and K1-K4, and creates three dashboard views. The work is purely database-layer with no backend or frontend changes.

The PostgreSQL source schemas are well-structured with detailed comments. The conversion is mechanical but requires attention to specific PostgreSQL-to-MySQL syntax differences (BIGSERIAL, BOOLEAN, date arithmetic, string concatenation, COMMENT ON, CREATE OR REPLACE VIEW). The existing `init.sql` establishes MySQL conventions (ENGINE=InnoDB, utf8mb4, AUTO_INCREMENT patterns) that new scripts must follow.

**Primary recommendation:** Convert schemas file-by-file following the 4-file split (03-06) from CONTEXT.md decisions, use `DATEDIFF()` for all date arithmetic in views, and verify views return computed results via sample data with varied date ranges.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Create new `personnel` table following PostgreSQL schema structure (PK: `personnel_id`) -- career path and probation tables FK to `personnel`
- **D-02:** Existing `civil_servants` table remains untouched -- coexists with `personnel` for now. Migration/unification is a future concern, not Phase 1
- **D-03:** ALTER on `personnel` (not `civil_servants`) to add `current_level_start_date`, `current_level_code`, `probation_end_date` -- new columns default NULL, no backfill needed
- **D-04:** Create stub tables (PK + name column only) for referenced tables that don't exist: `organization`, `position`, `users`, `training_course`, `lookup_value`, `personnel_order`, `notification_config`
- **D-05:** Create `personnel_position_history` as a full table (not stub) -- required by views `vw_job_series_tenure` and `vw_executive_tenure` to return real results
- **D-06:** Split into separate files by domain: `03-personnel-stubs.sql`, `04-career-path.sql`, `05-probation.sql`, `06-seed-data.sql`
- **D-07:** Mount all files into `docker-entrypoint-initdb.d/` via docker-compose -- numeric prefix ensures correct execution order
- **D-08:** Dev workflow: `docker-compose down -v` then `docker-compose up` to recreate from scratch. No migration system needed
- **D-09:** Seed promotion_criteria for Phase 1 scope only: O1->O2, O2->O3 (general) and K1->K2, K2->K3, K3->K4 (academic) -- approximately 10-15 rows with education-dependent year thresholds
- **D-10:** Year threshold values (min_years) extracted from ops-career-path.pdf and SQL comments
- **D-11:** Do NOT seed M1/M2/S1/S2/K5 criteria
- **D-12:** Insert 5-10 sample personnel records with position history entries
- **D-13:** Insert 1 sample probation_program + 2-3 sample probation_enrollment records with varying end_dates

### Claude's Discretion
- Exact stub table column definitions (beyond PK + name)
- personnel_position_history full column list (follow PostgreSQL schema + MySQL adaptations)
- Sample data names and values (Thai names, realistic dates)
- Index strategy for new tables
- MySQL-specific syntax choices (ENGINE=InnoDB, CHARSET, etc.)

### Deferred Ideas (OUT OF SCOPE)
- Migration from `civil_servants` to `personnel` data unification
- Migration system (versioned SQL scripts with tracking)
- M1/M2/S1/S2/K5 promotion criteria seed data
- Notification config INSERTs from probation schema

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DB-01 | MySQL schema for career path tables converted from gap_analysis_career_path_v2.sql (11 tables) | Full PostgreSQL source analyzed; conversion rules documented below; all column types mapped |
| DB-02 | MySQL schema for probation tracking tables converted from probation_tracking_schema.sql (10 tables) | Full PostgreSQL source analyzed; conversion rules documented below; all column types mapped |
| DB-03 | ALTER TABLE personnel to add current_level_start_date and current_level_code columns | Per D-03, these go on the new `personnel` table created in 03-personnel-stubs.sql, not as ALTER |
| DB-04 | ALTER TABLE personnel to add probation_end_date column | Same as DB-03 -- include in `personnel` CREATE TABLE definition directly |
| DB-05 | Seed data for promotion_criteria -- rules for O1->O2, O2->O3, K1->K2, K2->K3, K3->K4 | K-series values confirmed from SQL comments; O-series values researched (see Seed Data section) |
| DB-06 | Dashboard view vw_probation_dashboard converted to MySQL syntax | PostgreSQL source analyzed; CONCAT replaces `||`, DATEDIFF replaces date subtraction, LIMIT syntax identical |
| DB-07 | Views vw_job_series_tenure and vw_executive_tenure converted to MySQL | PostgreSQL source analyzed; same conversion patterns apply |

</phase_requirements>

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| MySQL | 8.0 | Database engine | Already in docker-compose, project standard |
| InnoDB | (MySQL built-in) | Storage engine | FK support, transactions, row-level locking |
| utf8mb4 | (charset) | Character encoding | Thai language support, existing convention in init.sql |
| utf8mb4_unicode_ci | (collation) | Collation | Proper Thai text sorting |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| Docker Compose | Database lifecycle | `docker-compose down -v && docker-compose up` for clean rebuild |
| docker-entrypoint-initdb.d | Schema initialization | All SQL files mounted here, executed alphabetically |

## Architecture Patterns

### SQL File Organization (per D-06)
```
project-root/
  init.sql                          # Existing: 01-schema.sql + 02-data.sql equivalent
  database/
    03-personnel-stubs.sql          # personnel table + stub tables + personnel_position_history
    04-career-path.sql              # Career path tables (11) + 2 views
    05-probation.sql                # Probation tables (10) + vw_probation_dashboard
    06-seed-data.sql                # Promotion criteria seed + sample personnel + sample enrollments
```

**Note:** The existing docker-compose mounts `mysql_database_design.sql` as `01-schema.sql` and `photo_management_system.sql` as `02-data.sql`. New files use numeric prefixes 03-06 to execute after existing init. The files should be placed in a `database/` directory (or project root) and mounted in docker-compose.yaml.

### Pattern 1: PostgreSQL to MySQL Conversion Rules

**What:** Systematic mapping of PostgreSQL syntax to MySQL equivalents.
**When to use:** Every CREATE TABLE and CREATE VIEW statement.

| PostgreSQL | MySQL | Notes |
|------------|-------|-------|
| `BIGSERIAL PRIMARY KEY` | `BIGINT AUTO_INCREMENT PRIMARY KEY` | MySQL uses AUTO_INCREMENT, not sequences |
| `BOOLEAN` | `TINYINT(1)` | MySQL BOOLEAN is alias for TINYINT(1), both work but TINYINT(1) is explicit |
| `DEFAULT TRUE` / `DEFAULT FALSE` | `DEFAULT 1` / `DEFAULT 0` | Or use `DEFAULT TRUE`/`DEFAULT FALSE` (MySQL accepts both) |
| `REFERENCES table(col)` inline | `FOREIGN KEY (col) REFERENCES table(col)` | MySQL requires explicit FK declaration syntax |
| `CURRENT_DATE` | `CURDATE()` or `CURRENT_DATE` | Both work in MySQL; `CURDATE()` is more idiomatic |
| `date1 - date2` (date arithmetic) | `DATEDIFF(date1, date2)` | Critical for views; PostgreSQL returns integer days, MySQL needs DATEDIFF |
| `string1 \|\| string2` | `CONCAT(string1, ' ', string2)` | PostgreSQL concatenation operator not supported in MySQL |
| `COMMENT ON TABLE/VIEW` | `COMMENT='...'` in CREATE TABLE / omit for views | MySQL table comments go inside CREATE TABLE; view comments not supported natively |
| `CREATE OR REPLACE VIEW` | `DROP VIEW IF EXISTS ... ; CREATE VIEW ...` | MySQL does not support CREATE OR REPLACE VIEW in init scripts reliably |
| `CASE WHEN x THEN TRUE ELSE FALSE END` | `CASE WHEN x THEN 1 ELSE 0 END` or `(x IS NULL)` | Boolean expressions in SELECT |
| `DEFAULT CURRENT_TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Identical in MySQL 8.0 |
| `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` (updated_at) | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | Add ON UPDATE for auto-updating timestamps |
| `UNIQUE (col1, col2)` | `UNIQUE KEY (col1, col2)` | Syntax identical, KEY optional |
| `TEXT` | `TEXT` | Identical |
| `DECIMAL(x,y)` | `DECIMAL(x,y)` | Identical |

### Pattern 2: Stub Table Convention

**What:** Minimal tables to satisfy FK constraints without full implementation.
**When to use:** For referenced tables not yet needed: `organization`, `position`, `users`, `training_course`, `lookup_value`, `personnel_order`, `notification_config`.

```sql
-- Stub table pattern: PK + name column + ENGINE/CHARSET
CREATE TABLE organization (
    org_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    org_name VARCHAR(300) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Recommendation:** Include `org_code` for organization, `position_name` for position, `username` for users, etc. -- one identifying column beyond PK to make sample data readable.

### Pattern 3: personnel Table as Full Table (not stub)

**What:** The `personnel` table must include columns needed by career path and probation features.
**Columns needed (from PostgreSQL source + CONTEXT.md decisions):**

```sql
CREATE TABLE personnel (
    personnel_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    citizen_id VARCHAR(13) UNIQUE,
    first_name VARCHAR(200) NOT NULL,
    last_name VARCHAR(200) NOT NULL,
    hire_date DATE,
    current_position_id BIGINT,
    current_org_id BIGINT,
    -- Career path columns (DB-03)
    current_level_start_date DATE,
    current_level_code VARCHAR(10),     -- K1,K2,K3,K4,K5,M1,M2,S1,S2,O1,O2,O3
    -- Probation column (DB-04)
    probation_end_date DATE,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (current_position_id) REFERENCES position(position_id),
    FOREIGN KEY (current_org_id) REFERENCES organization(org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Pattern 4: personnel_position_history as Full Table

**What:** Full table needed by both career path views.
**Source:** hr_database_schema.sql lines 377-391 + gap_analysis ALTER (lines 29-32).

```sql
CREATE TABLE personnel_position_history (
    history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT NOT NULL,
    position_id BIGINT,
    org_id BIGINT,
    position_name VARCHAR(300),
    position_level VARCHAR(50),         -- K1,K2,M1,M2,S1,S2,O1,O2,O3
    salary DECIMAL(12,2),
    effective_date DATE NOT NULL,
    end_date DATE,
    order_number VARCHAR(100),
    order_date DATE,
    -- Additional columns from gap_analysis ALTER (G06,G07)
    job_series_name VARCHAR(200),       -- for vw_job_series_tenure
    work_group VARCHAR(200),            -- for diverse_experience
    province VARCHAR(100),              -- for diverse_experience
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id),
    FOREIGN KEY (position_id) REFERENCES position(position_id),
    FOREIGN KEY (org_id) REFERENCES organization(org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Anti-Patterns to Avoid
- **Using ALTER TABLE for columns on a new table:** Since `personnel` is being created fresh (D-01), include `current_level_start_date`, `current_level_code`, and `probation_end_date` directly in the CREATE TABLE statement -- no ALTER needed.
- **PostgreSQL date subtraction in views:** `(end_date - CURRENT_DATE)` does not work in MySQL. Always use `DATEDIFF(end_date, CURDATE())`.
- **Inline REFERENCES without FOREIGN KEY keyword:** While PostgreSQL accepts `col BIGINT REFERENCES table(pk)`, MySQL requires the explicit `FOREIGN KEY (col) REFERENCES table(pk)` syntax.
- **COMMENT ON VIEW:** MySQL does not support comments on views. Omit or use inline SQL comments (`-- comment`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date difference calculation | Custom day-counting logic | `DATEDIFF(date1, date2)` | MySQL built-in, handles leap years, DST, etc. |
| Auto-updating timestamps | Application-level timestamp updates | `ON UPDATE CURRENT_TIMESTAMP` | MySQL handles this at engine level |
| Character set handling | Manual encoding | `DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` on every table | Consistent Thai text handling |
| FK cascade behavior | Application-level referential integrity | `ON DELETE RESTRICT` (default) or `ON DELETE CASCADE` | Database-enforced integrity |

## Common Pitfalls

### Pitfall 1: Docker Init Scripts Only Run on Fresh Volumes
**What goes wrong:** SQL files in `docker-entrypoint-initdb.d/` only execute when the data directory is empty (first run). Changing SQL files has no effect on existing volumes.
**Why it happens:** MySQL Docker image checks for existing data before running init scripts.
**How to avoid:** Always use `docker-compose down -v` before `docker-compose up` when changing schema files. The `-v` flag removes the named `db-data` volume.
**Warning signs:** Schema changes not appearing; "table already exists" errors absent despite changes.

### Pitfall 2: FK Ordering in Init Scripts
**What goes wrong:** Tables referenced by FOREIGN KEY must exist before the referencing table is created. If `personnel` is in file `03-*.sql` but `probation_enrollment` in `05-*.sql` references it, the FK works. But if a table in `04-*.sql` references a table also in `04-*.sql`, ordering within the file matters.
**Why it happens:** MySQL processes each file sequentially, top to bottom.
**How to avoid:** Within each SQL file, order CREATE TABLE statements so referenced tables come first. Across files, the numeric prefix handles ordering (03 before 04 before 05).

### Pitfall 3: BIGINT AUTO_INCREMENT Must Be Indexed
**What goes wrong:** `CREATE TABLE` fails if `AUTO_INCREMENT` column is not a key.
**Why it happens:** MySQL requires AUTO_INCREMENT columns to be indexed (PRIMARY KEY satisfies this).
**How to avoid:** Always pair `BIGINT AUTO_INCREMENT` with `PRIMARY KEY`.

### Pitfall 4: BOOLEAN vs TINYINT(1) in INSERT Statements
**What goes wrong:** Using `TRUE`/`FALSE` literals in INSERT works in MySQL 8.0 (they map to 1/0), but some MySQL clients display them as 1/0 anyway.
**Why it happens:** MySQL BOOLEAN is an alias for TINYINT(1).
**How to avoid:** Use `1`/`0` in INSERT statements for clarity, `TINYINT(1)` in column definitions. Both `DEFAULT TRUE` and `DEFAULT 1` work.

### Pitfall 5: View References to Non-Existent Tables
**What goes wrong:** Views in `04-career-path.sql` reference `personnel_position_history` and `position` tables. If these don't exist yet, CREATE VIEW fails.
**Why it happens:** MySQL validates view references at creation time.
**How to avoid:** Stub tables and `personnel_position_history` must be in `03-personnel-stubs.sql` (executed before `04-career-path.sql`).

### Pitfall 6: DATEDIFF Argument Order
**What goes wrong:** `DATEDIFF(start, end)` returns negative when start < end. PostgreSQL `end_date - start_date` returns positive.
**Why it happens:** `DATEDIFF(date1, date2)` = date1 - date2 in MySQL.
**How to avoid:** Use `DATEDIFF(end_date, start_date)` to get positive days (same semantics as PostgreSQL).

### Pitfall 7: probation_task_progress FK to training_participant
**What goes wrong:** The PostgreSQL probation schema has `training_participant_id BIGINT REFERENCES training_participant(participant_id)` in `probation_task_progress`. The `training_participant` table depends on `training_activity` which is not being created.
**Why it happens:** Deep FK dependency chain beyond what stub tables cover.
**How to avoid:** Either create a `training_participant` stub table, or make `training_participant_id` a plain BIGINT without FK constraint. Recommend: plain BIGINT (no FK) since this is far outside Phase 1 scope.

## Seed Data: Promotion Criteria Values

### K-series (confirmed from SQL comments -- HIGH confidence)

| target | source | education | min_years | Legal Reference |
|--------|--------|-----------|-----------|-----------------|
| K2 | K1 | BACHELOR | 6.0 | ว.3/67 |
| K2 | K1 | MASTER | 4.0 | ว.3/67 |
| K2 | K1 | DOCTORATE | 2.0 | ว.3/67 |
| K3 | K2 | ANY | 4.0 | ว.3/67 |
| K4 | K3 | ANY | 3.0 | ว.3/67 |

Source: `gap_analysis_career_path_v2.sql` COMMENT ON TABLE promotion_criteria, lines 70-72. K3 and K4 values are standard Thai civil service rules (4 years K2->K3, 3 years K3->K4 regardless of education).

### O-series (MEDIUM confidence -- standard Thai civil service rules)

| target | source | education | min_years | Notes |
|--------|--------|-----------|-----------|-------|
| O2 | O1 | VOCATIONAL_CERT (ปวช.) | 6.0 | Standard rule |
| O2 | O1 | HIGH_VOCATIONAL (ปวส./อนุปริญญา) | 5.0 | Standard rule |
| O3 | O2 | ANY | 6.0 | Standard rule, regardless of education |

**Important note on O-series:** These values could not be directly verified from the PDF (PDF reader unavailable). Values are based on standard Thai civil service promotion rules for ประเภททั่วไป. The implementer should verify against `docs/documents/ops-carrer-path.pdf` pages 31-82 before finalizing. The O-series education conditions use vocational education levels (ปวช., ปวส.) rather than university degrees (ป.ตรี, ป.โท) since ประเภททั่วไป is for non-degree holders.

**Education condition mapping for O-series:**
- Unlike K-series which uses BACHELOR/MASTER/DOCTORATE
- O-series should use: `VOCATIONAL_CERT` (ปวช.), `HIGH_VOCATIONAL` (ปวส./อนุปริญญา), or similar codes
- The `education_condition` VARCHAR(20) column is flexible enough for either

### Sample Seed Data Pattern

```sql
INSERT INTO promotion_criteria
    (target_level_code, target_level_name, source_level_code, source_level_name,
     min_years, education_condition, career_track, is_active, effective_date)
VALUES
    ('K2', 'ชำนาญการ', 'K1', 'ปฏิบัติการ', 6.0, 'BACHELOR', 'ALL', 1, '2024-03-22'),
    ('K2', 'ชำนาญการ', 'K1', 'ปฏิบัติการ', 4.0, 'MASTER', 'ALL', 1, '2024-03-22'),
    ('K2', 'ชำนาญการ', 'K1', 'ปฏิบัติการ', 2.0, 'DOCTORATE', 'ALL', 1, '2024-03-22');
```

## Code Examples

### MySQL View: vw_job_series_tenure (converted from PostgreSQL)
```sql
-- Source: docs/gap_analysis_career_path_v2.sql lines 303-312
DROP VIEW IF EXISTS vw_job_series_tenure;
CREATE VIEW vw_job_series_tenure AS
SELECT
    pph.personnel_id,
    COALESCE(pph.job_series_name, p_pos.position_name) AS target_job_series,
    pph.effective_date AS tenure_start_date,
    COALESCE(pph.end_date, CURDATE()) AS tenure_end_date,
    DATEDIFF(COALESCE(pph.end_date, CURDATE()), pph.effective_date) AS total_days,
    CASE WHEN pph.end_date IS NULL THEN 1 ELSE 0 END AS is_current
FROM personnel_position_history pph
LEFT JOIN position p_pos ON pph.position_id = p_pos.position_id;
```

### MySQL View: vw_executive_tenure (converted from PostgreSQL)
```sql
-- Source: docs/gap_analysis_career_path_v2.sql lines 320-331
DROP VIEW IF EXISTS vw_executive_tenure;
CREATE VIEW vw_executive_tenure AS
SELECT
    pph.personnel_id,
    COALESCE(pph.job_series_name, p_pos.position_name) AS position_name,
    pph.position_level,
    pph.effective_date AS start_date,
    COALESCE(pph.end_date, CURDATE()) AS end_date,
    DATEDIFF(COALESCE(pph.end_date, CURDATE()), pph.effective_date) AS total_days,
    CASE WHEN pph.end_date IS NULL THEN 1 ELSE 0 END AS is_current
FROM personnel_position_history pph
LEFT JOIN position p_pos ON pph.position_id = p_pos.position_id
WHERE pph.position_level IN ('M1','M2','S1','S2');
```

### MySQL View: vw_probation_dashboard (converted from PostgreSQL)
```sql
-- Source: docs/probation_tracking_schema.sql lines 285-311
DROP VIEW IF EXISTS vw_probation_dashboard;
CREATE VIEW vw_probation_dashboard AS
SELECT
    pe.enrollment_id,
    p.personnel_id,
    p.citizen_id,
    CONCAT(p.first_name, ' ', p.last_name) AS full_name,
    p.hire_date,
    pe.start_date AS probation_start,
    pe.end_date AS probation_end,
    DATEDIFF(pe.end_date, CURDATE()) AS remaining_days,
    pe.overall_status,
    -- Task counts via subqueries
    (SELECT COUNT(*) FROM probation_task_progress tp
     WHERE tp.enrollment_id = pe.enrollment_id) AS total_tasks,
    (SELECT COUNT(*) FROM probation_task_progress tp
     WHERE tp.enrollment_id = pe.enrollment_id AND tp.status = 'COMPLETED') AS completed_tasks,
    (SELECT COUNT(*) FROM probation_task_progress tp
     WHERE tp.enrollment_id = pe.enrollment_id AND tp.status = 'OVERDUE') AS overdue_tasks,
    -- Stakeholder names via subqueries
    (SELECT CONCAT(p2.first_name, ' ', p2.last_name)
     FROM probation_stakeholder ps
     JOIN personnel p2 ON ps.personnel_id = p2.personnel_id
     WHERE ps.enrollment_id = pe.enrollment_id AND ps.role_type = 'MENTOR' AND ps.is_active = 1
     LIMIT 1) AS mentor_name,
    (SELECT CONCAT(p2.first_name, ' ', p2.last_name)
     FROM probation_stakeholder ps
     JOIN personnel p2 ON ps.personnel_id = p2.personnel_id
     WHERE ps.enrollment_id = pe.enrollment_id AND ps.role_type = 'SUPERVISOR' AND ps.is_active = 1
     LIMIT 1) AS supervisor_name,
    (SELECT CONCAT(p2.first_name, ' ', p2.last_name)
     FROM probation_stakeholder ps
     JOIN personnel p2 ON ps.personnel_id = p2.personnel_id
     WHERE ps.enrollment_id = pe.enrollment_id AND ps.role_type = 'DIRECTOR' AND ps.is_active = 1
     LIMIT 1) AS director_name,
    -- Department info
    o.org_name AS department,
    pos.position_name
FROM probation_enrollment pe
JOIN personnel p ON pe.personnel_id = p.personnel_id
LEFT JOIN organization o ON p.current_org_id = o.org_id
LEFT JOIN position pos ON p.current_position_id = pos.position_id
WHERE pe.overall_status = 'IN_PROGRESS';
```

### docker-compose.yaml Volume Mounting Pattern
```yaml
# Add to db.volumes section:
volumes:
  - db-data:/var/lib/mysql
  - ./init.sql:/docker-entrypoint-initdb.d/01-schema.sql
  # Remove old mysql_database_design.sql and photo_management_system.sql mounts
  # (or keep if they contain needed data -- verify first)
  - ./database/03-personnel-stubs.sql:/docker-entrypoint-initdb.d/03-personnel-stubs.sql
  - ./database/04-career-path.sql:/docker-entrypoint-initdb.d/04-career-path.sql
  - ./database/05-probation.sql:/docker-entrypoint-initdb.d/05-probation.sql
  - ./database/06-seed-data.sql:/docker-entrypoint-initdb.d/06-seed-data.sql
```

### Sample Data for View Verification (probation)
```sql
-- Enrollment with >30 days remaining (green)
INSERT INTO probation_enrollment (personnel_id, program_id, start_date, end_date, overall_status)
VALUES (1, 1, '2026-01-01', '2026-07-01', 'IN_PROGRESS');

-- Enrollment with 7-14 days remaining (orange)
INSERT INTO probation_enrollment (personnel_id, program_id, start_date, end_date, overall_status)
VALUES (2, 1, '2025-09-15', '2026-03-30', 'IN_PROGRESS');

-- Enrollment past end_date (red)
INSERT INTO probation_enrollment (personnel_id, program_id, start_date, end_date, overall_status)
VALUES (3, 1, '2025-06-01', '2025-12-01', 'IN_PROGRESS');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MySQL 5.x BOOLEAN handling | MySQL 8.0 supports BOOLEAN natively as TINYINT(1) alias | MySQL 8.0 | Can use TRUE/FALSE in DEFAULT and WHERE clauses |
| `CREATE OR REPLACE VIEW` not supported | MySQL 8.0 still does not support it in init scripts | Ongoing | Must use `DROP VIEW IF EXISTS` + `CREATE VIEW` |
| `utf8` charset (3-byte) | `utf8mb4` (4-byte, full Unicode) | MySQL 5.5+ | Required for Thai text with special characters |

## Open Questions

1. **O-series promotion criteria exact values**
   - What we know: Standard Thai civil service rules suggest O1->O2 is 6 years (ปวช.) / 5 years (ปวส.) and O2->O3 is 6 years
   - What's unclear: Exact values for this specific ministry (สำนักงานปลัดกระทรวงยุติธรรม) -- may have custom rules
   - Recommendation: Use standard values, flag as needing HR validation. The PDF at `docs/documents/ops-carrer-path.pdf` pages 31-82 should be checked manually by a team member

2. **Existing init.sql references missing tables**
   - What we know: `init.sql` references `photo_versions` table in a stored procedure, but this table is never created
   - What's unclear: Whether `mysql_database_design.sql` and `photo_management_system.sql` (referenced in docker-compose) contain additional schema
   - Recommendation: Keep existing init.sql as `01-schema.sql` mount, accept that the stored procedure may fail silently. The important tables (`prefixes`, `civil_servants`, `civil_servant_photos`) will be created.

3. **probation_task_progress FK to training_participant**
   - What we know: The PostgreSQL schema has `REFERENCES training_participant(participant_id)` which depends on `training_activity` table
   - What's unclear: Whether to create a stub for `training_participant` (which itself needs `training_activity` stub)
   - Recommendation: Make `training_participant_id` a plain BIGINT column without FK constraint. Same for `elearning_completion_id` which has no explicit FK in source but is noted as a link.

## Sources

### Primary (HIGH confidence)
- `docs/gap_analysis_career_path_v2.sql` -- Full PostgreSQL career path schema with 9 tables, 3 ALTERs, 2 views, detailed COMMENT blocks including seed data examples
- `docs/probation_tracking_schema.sql` -- Full PostgreSQL probation schema with 10 tables, 1 ALTER, 1 view, notification INSERTs
- `docs/hr_database_schema.sql` -- Reference 112-table PostgreSQL schema providing `personnel`, `personnel_position_history`, `organization`, `position`, `users`, `training_course`, `lookup_value`, `personnel_order`, `notification_config` structures
- `init.sql` -- Existing MySQL schema establishing project conventions
- `docker-compose.yaml` -- Current Docker volume mounting pattern for init scripts

### Secondary (MEDIUM confidence)
- Thai civil service promotion rules (O-series year thresholds) -- based on standard ก.พ. rules, not verified against ministry-specific PDF

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- MySQL 8.0 and Docker are established project standards
- Architecture (schema conversion): HIGH -- PostgreSQL source fully analyzed, conversion rules are mechanical
- Seed data (K-series): HIGH -- Values explicitly stated in SQL comments
- Seed data (O-series): MEDIUM -- Standard civil service values, PDF not readable
- Pitfalls: HIGH -- Based on known MySQL/Docker behavior

**Research date:** 2026-03-22
**Valid until:** Indefinite (database fundamentals, stable technology)
