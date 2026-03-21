# Pitfalls Research

**Domain:** Thai Government HR Career Path & Probation Tracking System
**Researched:** 2026-03-22
**Confidence:** HIGH (based on schema analysis, Thai civil service domain knowledge, and existing codebase review)

## Critical Pitfalls

### Pitfall 1: PostgreSQL-to-MySQL Date Arithmetic Silently Produces Wrong Results

**What goes wrong:**
The existing SQL schemas use PostgreSQL date arithmetic (`end_date - CURRENT_DATE` returns an integer in PostgreSQL). MySQL does NOT support this syntax the same way -- `DATE1 - DATE2` in MySQL returns a numeric subtraction of the internal date representations, not a day count. For example, `'2026-06-01' - '2026-03-22'` returns `278` in PostgreSQL (correct) but `275` in MySQL (wrong -- it does `20260601 - 20260322 = 279` as a numeric operation). This affects every `remaining_days` calculation in both the career path and probation systems.

**Why it happens:**
Developers copy-paste the PostgreSQL views (`vw_probation_dashboard`, `vw_job_series_tenure`, `vw_executive_tenure`) and assume the date subtraction works the same way. The results look plausible (numbers in roughly the right range) so the bug goes undetected until someone notices a specific calculation is off by days or weeks.

**How to avoid:**
Replace ALL `date1 - date2` expressions with `DATEDIFF(date1, date2)` during the MySQL conversion. Create a conversion checklist covering:
- `vw_probation_dashboard`: `(pe.end_date - CURRENT_DATE)` -> `DATEDIFF(pe.end_date, CURDATE())`
- `vw_job_series_tenure`: `(COALESCE(pph.end_date, CURRENT_DATE) - pph.effective_date)` -> `DATEDIFF(COALESCE(pph.end_date, CURDATE()), pph.effective_date)`
- `vw_executive_tenure`: same pattern
- `qualification_calculation.remaining_days` computation
- `probation_enrollment.remaining_days` computation

**Warning signs:**
- Any `date1 - date2` in SQL without `DATEDIFF()`
- `remaining_days` values that are close but not exact
- Probation color codes showing wrong urgency level (green when should be yellow)
- Candidates showing "qualified" a few days early or late

**Phase to address:**
Phase 1 (Schema Conversion) -- must be correct from the start. Create a unit test that compares known date pairs against expected day counts.

---

### Pitfall 2: Qualification Calculation Logic Embedded in Application Code Instead of Being Data-Driven

**What goes wrong:**
The promotion criteria have complex, multi-dimensional rules: K1->K2 requires 6 years with Bachelor's, 4 with Master's, 2 with Doctorate. M2 has OR-combination rules (M1>=1yr OR M1+K3>=4yr OR K3>=4yr). Developers hardcode these rules as if/else chains in PHP, making them impossible to maintain when OCSC regulations change (which happens via ว. circulars -- ว.3, ว.5, ว.17).

**Why it happens:**
The `promotion_criteria` table is designed well but developers treat it as reference data and still hardcode the logic for "how to evaluate criteria" in PHP. The combination_group logic (OR conditions across multiple source levels) is particularly tempting to hardcode because it is genuinely complex.

**How to avoid:**
Build a generic criteria evaluation engine in PHP that reads `promotion_criteria` rows and evaluates them dynamically:
1. For a given `target_level_code`, fetch ALL applicable criteria rows
2. Group by `combination_group` (NULL = standalone requirement, non-NULL = OR-group)
3. For each standalone row: check `min_years` against actual tenure + `education_condition` against education record
4. For combination groups: check if ANY combination in the group is satisfied
5. The only hardcoded logic should be the evaluation algorithm, not the criteria values

**Warning signs:**
- PHP code containing level codes like `'K2'`, `'M1'` in switch statements or if/else chains
- New OCSC circulars requiring code changes instead of database updates
- Different promotion paths requiring different PHP functions

**Phase to address:**
Phase 2 (Backend API) -- the criteria engine design is the most architecturally important decision in this project.

---

### Pitfall 3: Thai Buddhist Era (พ.ศ.) and Gregorian Date Confusion

**What goes wrong:**
Thai government documents, legal references, and user expectations all use Buddhist Era dates (พ.ศ. = CE + 543). The database stores dates in Gregorian (CE). If the conversion is inconsistent -- some dates stored as พ.ศ. in VARCHAR fields, some as CE in DATE fields -- calculations break catastrophically. A person's `current_level_start_date` stored as `2567-03-15` (meaning พ.ศ. 2567 = CE 2024) in a DATE column would be interpreted as the year 2567 CE, making their tenure appear to be -541 years.

**Why it happens:**
Data entry by Thai government staff naturally uses พ.ศ. dates. If the frontend sends `2567-03-15` and the backend stores it directly in a MySQL DATE field without conversion, the data is corrupt. This is especially dangerous during initial data import from Excel spreadsheets (the career 2569.03.21 master-prep.xlsx likely uses พ.ศ. dates).

**How to avoid:**
1. ALL database DATE/DATETIME columns store Gregorian (CE) dates -- no exceptions
2. Frontend converts พ.ศ. display to CE before sending to API, and CE to พ.ศ. for display
3. Create utility functions: `toBuddhistEra(ceDate)` and `toGregorianDate(beDate)` in both frontend and backend
4. Data import scripts must detect and convert พ.ศ. years (any year > 2400 in a date field is likely พ.ศ.)
5. Add validation: reject DATE values with year > 2100 (clearly พ.ศ. not converted)

**Warning signs:**
- Any VARCHAR column storing dates
- User-entered dates appearing ~543 years in the future
- Tenure calculations returning negative values or impossibly large numbers
- Excel import producing dates in the 2500s

**Phase to address:**
Phase 1 (Schema) for storage rules, Phase 2 (Backend) for conversion utilities, Phase 3 (Frontend) for display formatting. Must be consistent across ALL phases.

---

### Pitfall 4: "3 Different" (3 ต่าง) Diverse Experience Validation is Deceptively Complex

**What goes wrong:**
The "3 ต่าง" requirement for M1 promotion (ต่างสายงาน, ต่างหน่วยงาน, ต่างพื้นที่, ต่างลักษณะงาน -- need 3 of 4) looks simple but has edge cases that cause wrong qualification determinations:
- Does a transfer within the same จังหวัด but different อำเภอ count as ต่างพื้นที่?
- If someone holds concurrent positions (รักษาราชการแทน), does that count?
- What is the minimum duration in each different role to count?
- If someone transfers twice to the same type of different role, does it count once or twice?

**Why it happens:**
The `diverse_experience` table has boolean flags (`is_diff_job_series`, `is_diff_org`, `is_diff_location`, `is_diff_work_nature`) but the rules for setting these flags are ambiguous. Different HR staff may interpret the อ.ก.พ. กระทรวงยุติธรรม announcement (4 ม.ค. 62) differently.

**How to avoid:**
1. Document the exact interpretation rules with HR stakeholders BEFORE writing code
2. Make the boolean flags manually settable by HR (not auto-calculated) with an optional auto-suggest
3. Store the raw data (from/to positions, dates) separately from the interpretation (the boolean flags)
4. Add an `approved_by` field and approval workflow -- HR should confirm diverse experience claims
5. Include `qualified_date` calculation that accounts for the LATEST of all three qualifying experiences

**Warning signs:**
- Auto-calculation of diverse experience without HR review
- Missing validation on minimum duration per experience
- `qualified_date` calculated from earliest experience instead of latest qualifying one
- No approval workflow for diverse experience entries

**Phase to address:**
Phase 2 (Backend) for the data model and validation rules. This should be implemented as a manual data entry feature first, with auto-suggest as a Phase 2+ enhancement.

---

### Pitfall 5: Multi-Evaluator Probation Assessment Workflow Has State Management Traps

**What goes wrong:**
The probation evaluation flow (Mentor -> Supervisor -> Director -> Committee) is a sequential multi-step workflow. Common failures:
- Evaluator submits, then the previous evaluator wants to change their score -- no mechanism for "reopen"
- Committee meeting hasn't happened but probation deadline passes -- system shows OVERDUE but there is no "extend" path
- Mentor is transferred mid-probation -- stakeholder replacement not handled
- An evaluation is PENDING but the evaluator has retired/resigned

**Why it happens:**
Developers build the happy path (all evaluators submit on time, in order) but ignore the exception flows that are common in Thai government operations (transfers, delays, committee scheduling conflicts).

**How to avoid:**
1. Design the workflow as a state machine with explicit states: `NOT_STARTED -> IN_PROGRESS -> SUBMITTED -> APPROVED -> REOPENED`
2. Allow probation extension (`extension_end_date` in `probation_enrollment`) with proper reason tracking
3. Allow stakeholder replacement: `probation_stakeholder.end_date` + new stakeholder record
4. Do NOT enforce strict sequential ordering at the database level -- allow committee evaluation even if director has not submitted yet (with a warning)
5. Add `is_active` checks on evaluators -- validate that the evaluator is still an active employee

**Warning signs:**
- No "extend probation" functionality
- Strict sequential enforcement that blocks the entire flow when one evaluator is delayed
- No mechanism to reassign stakeholders
- Evaluator personnel_id pointing to inactive/terminated personnel

**Phase to address:**
Phase 2 (Backend) for the state machine and validation. Phase 3 (Frontend) for the workflow UI. The state machine design should be reviewed before building the frontend.

---

### Pitfall 6: Supportive Experience (เกื้อกูล) Ratio Calculation Precision Errors

**What goes wrong:**
Supportive experience uses a ratio (`ratio_percent` = 50-100%) to calculate effective days: `effective_days = total_days * ratio_percent / 100`. This feeds into `qualification_calculation.supportive_days` which adds to `job_series_days` to determine if someone qualifies. Floating-point arithmetic or incorrect rounding can cause a person to appear qualified when they are 1 day short, or vice versa.

**Why it happens:**
The `effective_days` column is `DECIMAL(10,2)` but the qualification check may compare against an integer threshold. Also, developers may disagree on rounding: does 365 days at 50% equal 182 or 183 days? This matters when a person qualifies on exactly the threshold date.

**How to avoid:**
1. Define rounding rules explicitly: Thai government practice typically rounds DOWN (ปัดลง) for partial days
2. Use `FLOOR()` in MySQL for effective_days calculation: `FLOOR(total_days * ratio_percent / 100)`
3. Store `effective_days` as INT after rounding, not as DECIMAL
4. Write specific test cases for boundary conditions: person qualifying on exactly the threshold day
5. Document the rounding policy in the `promotion_criteria` description field

**Warning signs:**
- `effective_days` stored as fractional values (182.5)
- Qualification status flickering between "qualified" and "not qualified" on boundary dates
- Different results when recalculating the same person on different dates

**Phase to address:**
Phase 2 (Backend) when implementing the calculation engine. Must have test cases for boundary conditions.

---

### Pitfall 7: The `remaining_days` Columns Become Stale Without a Reliable Update Mechanism

**What goes wrong:**
Both `probation_enrollment.remaining_days` and `qualification_calculation.remaining_days` are stored values that change daily (they depend on CURRENT_DATE). If these are not updated, the dashboard shows stale data. The color-coded probation display (green/yellow/orange/red) shows wrong urgency levels.

**Why it happens:**
The PostgreSQL schema comments mention "auto-update ด้วย scheduled job" but there is no scheduled job mechanism in the current PHP backend. PHP has no built-in scheduler, and the Docker setup does not include a cron service.

**How to avoid:**
Two viable approaches:
1. **Compute on read (recommended for Phase 1):** Do NOT store `remaining_days` at all. Calculate it in the VIEW or in the API query: `DATEDIFF(end_date, CURDATE()) AS remaining_days`. This is always accurate and requires no maintenance.
2. **Scheduled update (Phase 2+ if performance is a concern):** Add a MySQL EVENT or a cron job in Docker to update the stored column nightly. But keep the VIEW as the source of truth.

The `vw_probation_dashboard` VIEW already computes `remaining_days` dynamically -- use this pattern consistently.

**Warning signs:**
- Stored `remaining_days` values that are negative but `overall_status` is still `IN_PROGRESS`
- Dashboard showing "45 days remaining" for someone whose probation ended last month
- Any INSERT/UPDATE that sets `remaining_days` to a static value

**Phase to address:**
Phase 1 (Schema) -- decide to compute on read. Phase 2 (Backend) -- ensure all API endpoints compute remaining_days dynamically.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding promotion criteria in PHP | Faster to implement first 2-3 level transitions | Every new level or regulation change requires code deployment | Never -- use data-driven from day one |
| Storing remaining_days as a column | Simpler queries, no DATEDIFF in every SELECT | Data goes stale, wrong color codes, user distrust | Only if accompanied by reliable nightly update job |
| Skipping the supportive_job_series mapping table | Fewer tables, simpler schema | Cannot validate whether a claimed supportive experience is actually in a related job series | MVP only -- must add for production accuracy |
| Using VARCHAR for Thai date display columns | No conversion needed in frontend | Impossible to sort, filter, or compute date ranges | Never -- always use DATE columns with display conversion |
| Single-query qualification calculation | Simple API endpoint | Times out when calculating for 500+ personnel simultaneously | MVP only -- add background calculation job for bulk operations |
| Copying PostgreSQL VIEW syntax without testing | Faster migration | Silent wrong results from date arithmetic, string concatenation (`||` vs `CONCAT()`), boolean handling | Never -- test every VIEW individually after conversion |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Existing `personnel` table ALTERs | Running ALTER TABLE on production without checking existing data -- `current_level_start_date` will be NULL for all existing records | Provide an UPDATE script that backfills from `personnel_position_history` MAX(effective_date) before the feature goes live |
| Existing `personnel_position_history` ALTERs | Adding `job_series_name`, `work_group`, `province` columns but leaving them NULL forever | Create a one-time migration script to populate from existing position/organization joins, plus ensure all new inserts populate these fields |
| MySQL string concatenation in VIEWs | Using PostgreSQL `||` operator for string concatenation (e.g., `first_name || ' ' || last_name`) | Use `CONCAT(first_name, ' ', last_name)` -- MySQL does NOT support `||` for concatenation by default |
| MySQL BOOLEAN handling | PostgreSQL `BOOLEAN` maps directly; MySQL uses `TINYINT(1)` | Use `TINYINT(1)` in CREATE TABLE and compare with `= 1` / `= 0` instead of `= TRUE` / `= FALSE` in queries |
| `BIGSERIAL` to MySQL AUTO_INCREMENT | Simply replacing `BIGSERIAL` with `BIGINT AUTO_INCREMENT` | Must also add `NOT NULL` and ensure the column is a PRIMARY KEY or has a UNIQUE index -- MySQL requires AUTO_INCREMENT columns to be indexed |
| `CURRENT_DATE` vs `CURDATE()` | Using `CURRENT_DATE` in MySQL stored columns' DEFAULT | MySQL supports `CURRENT_DATE` in expressions but `DEFAULT CURRENT_DATE` may not work in all contexts. Use `CURDATE()` in queries and triggers |
| Foreign key references to tables not yet created | PostgreSQL does not enforce FK order in a single transaction the same way | Order CREATE TABLE statements by dependency, or add FKs with separate ALTER TABLE statements after all tables exist |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 query in qualification calculation | API takes 10+ seconds for the candidate list page | Pre-join personnel + position_history + supportive_experience in a single query or materialized view | >100 personnel in a single candidate list tab |
| Subquery-per-row in `vw_probation_dashboard` | Dashboard load time increases linearly with enrollments | Replace correlated subqueries (for mentor_name, supervisor_name, etc.) with LEFT JOINs | >50 active probation enrollments |
| Recalculating all qualifications on every page load | Page takes 5+ seconds, server CPU spikes | Calculate and cache in `qualification_calculation` table; recalculate only when source data changes or on-demand | >200 personnel across all promotion paths |
| Unindexed lookups on `target_level_code` + `personnel_id` | Slow candidate list filtering by tab (level type) | Add composite indexes: `(target_level_code, status)`, `(personnel_id, target_level_code)` | >1000 rows in qualification_calculation |
| Loading all probation tasks and evaluations in a single API call | Large JSON payloads, slow mobile performance | Paginate probation list; lazy-load task details and evaluations on row expansion | >100 probation enrollments with full task/evaluation data |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing qualification calculations without role-based access | Regular employees can see other employees' promotion eligibility status and remaining days | Add role checks: only HR and supervisors can view candidate lists. Personnel can only see their own qualification status |
| No audit trail on qualification_calculation changes | HR could manipulate qualification dates or status without accountability | Add `updated_by` column and log all changes to an audit table. qualification_calculation is a sensitive record |
| Probation evaluation scores visible to the probationer | Evaluator candor is compromised if the probationer can see individual scores during the process | Restrict evaluation detail API to evaluator roles only. Probationer should only see final result (PASS/FAIL) after committee decision |
| SQL injection in search/filter endpoints | Career path and probation pages have search inputs that filter by name/position | Use parameterized queries (PDO prepared statements) for ALL filter inputs. The existing backend uses PDO -- maintain this pattern |
| Mass assignment on probation_enrollment status | Anyone with API access could change `overall_status` to COMPLETED or `final_result` to PASS | Whitelist updatable fields per role. Status transitions should follow the state machine, not accept arbitrary values |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Displaying Gregorian dates without Thai Buddhist Era conversion | HR staff cannot read dates naturally -- they think in พ.ศ. not ค.ศ. | Always display dates in Thai format: `15 มี.ค. 2567` (พ.ศ.) with day-month-year order. Store as CE internally |
| No explanation of WHY someone is not yet qualified | HR sees "ยังไม่ถึงเกณฑ์" but does not know what is missing -- more years? Different education? Missing diverse experience? | Show a qualification breakdown: which criteria are met (green checkmark) and which are not (red X with specific gap) |
| Color-coded remaining days without legend | New users do not understand what green/yellow/orange/red mean | Add a legend or tooltip explaining the thresholds (>30, 15-30, 7-14, <7 days) on the probation page |
| Tabs for position types without count badges | HR clicks through 4 tabs to find which one has actionable items | Show count badges on each tab: "ประเภททั่วไป (24)" to indicate how many candidates are in each category |
| Candidate list showing only current snapshot without history | HR cannot track progress -- was this person closer to qualifying last month? | Add a qualification date timeline or "days until qualified" trend for each candidate |
| Search only by name, missing filter by status/level | HR managing 200+ candidates cannot quickly find "all K1->K2 candidates who are already qualified" | Add dropdown filters for: target level, current status (qualified/not yet/check data), and remaining days range |

## "Looks Done But Isn't" Checklist

- [ ] **Schema conversion:** All `BIGSERIAL` replaced with `BIGINT AUTO_INCREMENT` -- verify each PRIMARY KEY column
- [ ] **Schema conversion:** All `||` string concatenation replaced with `CONCAT()` -- verify in every VIEW
- [ ] **Schema conversion:** All `CURRENT_DATE - date` replaced with `DATEDIFF()` -- verify in every VIEW and computed column
- [ ] **Schema conversion:** All `BOOLEAN` columns work correctly -- MySQL uses `TINYINT(1)`, verify INSERT/UPDATE/SELECT logic
- [ ] **Schema conversion:** All `COMMENT ON TABLE/VIEW` replaced with MySQL `COMMENT` syntax in CREATE TABLE
- [ ] **Schema conversion:** Foreign key order resolved -- no FK references to tables defined later in the script
- [ ] **Candidate list:** Qualification calculation handles ALL education levels (Bachelor, Master, Doctorate) with different year thresholds -- verify K1->K2 produces different results for different education levels
- [ ] **Candidate list:** Combination groups (M2 promotion paths) evaluate as OR conditions, not AND -- verify M1+K3 path works independently of standalone M1 path
- [ ] **Candidate list:** Supportive experience ratio calculation uses consistent rounding -- verify boundary case
- [ ] **Probation tracking:** `remaining_days` is computed dynamically, not stored and stale -- verify dashboard shows correct urgency colors
- [ ] **Probation tracking:** Multi-evaluator flow handles missing evaluators gracefully -- verify that committee can submit even if director evaluation is delayed
- [ ] **Probation tracking:** Extension workflow exists -- verify that a probation period can be extended with reason and new end_date
- [ ] **Date handling:** All dates display in Thai Buddhist Era (พ.ศ.) format -- verify that 2024 CE displays as 2567 พ.ศ.
- [ ] **Date handling:** Date inputs accept พ.ศ. and convert to CE before API submission -- verify round-trip conversion
- [ ] **Seed data:** `promotion_criteria` has entries for ALL Phase 1 paths (O1->O2, O2->O3, K1->K2, K2->K3, K3->K4) with ALL education conditions -- verify row count matches expected combinations

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong date arithmetic (DATEDIFF missing) | LOW | Fix SQL views/queries. Recalculate all `remaining_days` and `qualification_date` values. Verify with known test cases |
| Hardcoded promotion criteria in PHP | HIGH | Refactor to data-driven engine. Must identify all hardcoded rules, extract to `promotion_criteria` rows, rewrite evaluation logic, and retest every promotion path |
| Buddhist Era dates stored in DATE columns | HIGH | Identify affected records (year > 2400). Write migration to subtract 543 from year. Verify no legitimate future dates are affected. Risk of data loss if some records are CE and some are BE |
| Stale remaining_days columns | LOW | Switch to computed VIEWs. Drop stored column or add nightly UPDATE job. One-time fix, no data loss |
| Wrong supportive experience rounding | MEDIUM | Audit all `effective_days` values. Recompute with correct rounding. Rerun qualification calculations. Some personnel may change qualification status |
| Missing diverse experience validation | MEDIUM | Add approval workflow retroactively. Flag existing entries as "grandfathered" or require HR review. May delay M1 qualification determinations |
| Multi-evaluator state corruption | MEDIUM | Add state machine validation. Audit existing evaluations for impossible states (e.g., APPROVED without SUBMITTED). Fix data, then add constraints |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| PostgreSQL date arithmetic -> MySQL DATEDIFF | Phase 1 (Schema) | Run test queries comparing known date pairs against expected day counts |
| Hardcoded promotion criteria | Phase 2 (Backend) | Add a new promotion path (e.g., O1->O2 with different years) by inserting DB rows only -- no code changes needed |
| Thai Buddhist Era date confusion | Phase 1 (Schema) + Phase 2 (Backend) + Phase 3 (Frontend) | Round-trip test: enter date in พ.ศ. on UI, verify CE in database, verify พ.ศ. on display |
| 3 ต่าง diverse experience complexity | Phase 2 (Backend) | HR staff can manually enter and approve diverse experience records; auto-suggest is an enhancement |
| Multi-evaluator workflow state | Phase 2 (Backend) | Simulate: mentor submits -> mentor wants to change -> supervisor submits -> director is on leave -> committee submits anyway |
| Supportive experience rounding | Phase 2 (Backend) | Test case: 365 days at 50% ratio = exactly 182 days (FLOOR), not 182.5 or 183 |
| Stale remaining_days | Phase 1 (Schema) + Phase 2 (Backend) | Verify no API endpoint reads stored remaining_days -- all compute dynamically |
| PostgreSQL string concat and boolean | Phase 1 (Schema) | Every VIEW compiles and runs without error in MySQL 8.0 |
| N+1 queries in candidate list | Phase 2 (Backend) | Load candidate list with 100+ records in under 2 seconds |
| Missing role-based access | Phase 2 (Backend) | Non-HR user receives 403 when accessing candidate list API |
| Backfilling ALTERed columns | Phase 1 (Schema) | After migration, `SELECT COUNT(*) WHERE current_level_start_date IS NULL` returns 0 for active personnel |

## Sources

- Schema analysis: `docs/gap_analysis_career_path_v2.sql` (PostgreSQL syntax with MySQL conversion requirements)
- Schema analysis: `docs/probation_tracking_schema.sql` (PostgreSQL syntax with multi-evaluator workflow)
- Project context: `.planning/PROJECT.md` (constraints, requirements, legal references)
- Existing UI: `frontend/src/pages/CandidateListsPage.vue` and `ProbationEndPage.vue` (mock data structure)
- Legal references: กฎ ก.พ. ว่าด้วยการทดลองปฏิบัติหน้าที่ราชการ พ.ศ. 2553, นร 1006/ว5, นร 1006/ว3, นร 1006/ว17
- MySQL 8.0 documentation: DATE arithmetic differences from PostgreSQL (DATEDIFF function, CONCAT vs ||, BOOLEAN as TINYINT)
- Domain knowledge: Thai civil service promotion rules (4 position types: ทั่วไป, วิชาการ, อำนวยการ, บริหาร)

---
*Pitfalls research for: Thai Government HR Career Path & Probation Tracking*
*Researched: 2026-03-22*
