# Phase 7: QualificationEngine Integration - Research

**Researched:** 2026-03-23
**Domain:** MySQL SQL query extension (LEFT JOIN subqueries, aggregation), PHP engine modification, Vue 3 table UI update
**Confidence:** HIGH

## Summary

This phase extends the existing `QualificationEngine.php` to incorporate three additional data sources (supportive_experience, diverse_experience, position_equivalence) into the qualification_date computation. The current engine already uses a well-structured SQL query with LEFT JOINs to promotion_criteria -- the task is to add three more LEFT JOIN subqueries that aggregate per personnel_id, then adjust the DATE_SUB formula and add new columns to the SELECT clause.

The critical technical risk is the duplicate-row problem flagged in STATE.md: if LEFT JOINs to raw tables (not aggregated subqueries) are used, a person with multiple supportive_experience records will appear multiple times. The solution is straightforward -- use derived-table subqueries with `GROUP BY personnel_id` that produce exactly one row per person, then LEFT JOIN to those.

**Primary recommendation:** Use LEFT JOIN to three pre-aggregated subqueries (one per data source), each producing exactly one row per personnel_id. This preserves the existing query structure and guarantees no row duplication.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `qualification_date = current_level_start_date + min_years - supportive_effective_days - equivalence_approved_days`
- **D-02:** Compute in SQL with `DATE_SUB(DATE_ADD(...), INTERVAL total_extra_days DAY)` using subquery SUM
- **D-03:** COALESCE to 0 when no supportive/equivalence data exists (regression safety)
- **D-04:** Aggregate per personnel_id with `SUM(effective_days)` group by personnel_id
- **D-05:** M1 diverse requirement: diff_count >= 3
- **D-06:** Badge "DIFF_PASS" (green) when diverse >= 3
- **D-07:** Badge "DIFF_NOT_YET" (orange) when diverse < 3 or missing -- warning only, not blocking
- **D-08:** 3-diff check applies only to target_level_code = 'M1'
- **D-09:** Only APPROVED equivalence records count
- **D-10:** Equivalence used for cross-type promotions, checked via promotion_criteria.requires_equiv_years
- **D-11:** SUM(approved_total_days) from all APPROVED records = equivalence_days
- **D-12:** Add 3 new columns: supportive_days, diverse badge (M1 only), equivalence_days
- **D-13:** supportive_days shows number or "-" if none
- **D-14:** equivalence_days shows number or "-" if none
- **D-15:** Displayed qualification_date includes supportive + equivalence adjustments
- **D-16:** No data change for personnel without supportive/diverse/equivalence records
- **D-17:** Regression test: K2/K3 results must match pre-change output

### Claude's Discretion
- JOIN strategy (LEFT JOIN vs correlated subquery vs CTE)
- Column ordering in UI table
- Query caching/optimization if slow
- Detail view (computeDetail) -- whether to show breakdown of supportive/diverse/equivalence

### Deferred Ideas (OUT OF SCOPE)
- Detailed breakdown per candidate (drill-down view) -- v2 DV-01
- M1/M2 combination groups full implementation -- v2 AC-01
- S1/S2 complex equivalence full implementation -- v2 AC-02
- Performance optimization (materialized view / cache) -- defer unless query is slow
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QE-01 | Extend QualificationEngine to include supportive effective_days in qualification_date | LEFT JOIN aggregated subquery on supportive_experience; SUM(effective_days) per personnel_id; DATE_SUB adjustment |
| QE-02 | Extend QualificationEngine to check diverse_experience >= 3 for M1 | LEFT JOIN subquery on diverse_experience with MAX(diff_count); conditional badge based on target_level_code |
| QE-03 | Extend QualificationEngine to include position_equivalence approved_days for cross-type promotions | LEFT JOIN aggregated subquery on position_equivalence WHERE approval_status='APPROVED'; SUM(approved_total_days) |
| QE-04 | Candidate List displays computed results with additional data | Add 3 columns to CandidateListsPage.vue table; extend mapCandidateRow in useCandidates.js |
</phase_requirements>

## Architecture Patterns

### Current Engine Structure (computeForLevel)
The engine follows a single-query pattern:
1. Fetch source level codes for target level
2. Build main SELECT with LEFT JOINs
3. Apply search filter
4. Run count query (wraps baseSelect as subquery)
5. Run summary query (wraps baseSelect as subquery)
6. Run data query with LIMIT/OFFSET
7. Post-process rows in PHP (formatThaiDate, getLevelName)

**Key insight:** The baseSelect string is reused for count, summary, and data queries. Any modification to baseSelect automatically propagates to all three.

### Recommended: LEFT JOIN Derived Table Pattern

```php
// Source: Verified from existing QualificationEngine.php pattern
$baseSelect = "
    SELECT
        p.personnel_id,
        -- ... existing columns ...

        -- NEW: supportive days (aggregated per personnel)
        COALESCE(sup.total_supportive_days, 0) AS supportive_days,

        -- NEW: equivalence days (aggregated per personnel, APPROVED only)
        COALESCE(eq.total_equivalence_days, 0) AS equivalence_days,

        -- NEW: diverse experience check (M1 only)
        COALESCE(div.max_diff_count, 0) AS diverse_diff_count,

        -- MODIFIED: qualification_date now subtracts extra days
        CASE
            WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN NULL
            ELSE DATE_SUB(
                DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
                INTERVAL (COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0)) DAY
            )
        END AS qualification_date,

        -- MODIFIED: remaining_days uses new qualification_date
        -- ... (same pattern with DATE_SUB)

    FROM personnel p
    LEFT JOIN position pos ON p.current_position_id = pos.position_id
    LEFT JOIN organization o ON p.current_org_id = o.org_id
    LEFT JOIN promotion_criteria pc
        ON pc.target_level_code = ?
        AND pc.source_level_code = p.current_level_code
        AND (pc.education_condition = COALESCE(p.education_level, 'BACHELOR') OR pc.education_condition = 'ANY')
        AND pc.is_active = 1

    -- NEW: Supportive experience aggregated subquery
    LEFT JOIN (
        SELECT personnel_id, SUM(effective_days) AS total_supportive_days
        FROM supportive_experience
        GROUP BY personnel_id
    ) sup ON sup.personnel_id = p.personnel_id

    -- NEW: Position equivalence aggregated subquery (APPROVED only)
    LEFT JOIN (
        SELECT personnel_id, SUM(approved_total_days) AS total_equivalence_days
        FROM position_equivalence
        WHERE approval_status = 'APPROVED'
        GROUP BY personnel_id
    ) eq ON eq.personnel_id = p.personnel_id

    -- NEW: Diverse experience (max diff_count per person)
    LEFT JOIN (
        SELECT personnel_id, MAX(diff_count) AS max_diff_count
        FROM diverse_experience
        GROUP BY personnel_id
    ) div ON div.personnel_id = p.personnel_id

    WHERE p.current_level_code IN ({$placeholders})
        AND p.is_active = 1
";
```

### Why LEFT JOIN Derived Tables (Not CTEs or Correlated Subqueries)

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| LEFT JOIN derived table | MySQL optimizes well; consistent with existing JOINs; baseSelect reusable | Slightly verbose | **Use this** |
| CTE (WITH clause) | Readable; named | MySQL 8.0 CTEs can prevent index pushdown; baseSelect wrapping becomes complex | Avoid |
| Correlated subquery in SELECT | Compact | Runs per-row (N+1 performance); 3 extra subqueries = 3x penalty | Avoid |

### Diverse Status Logic (PHP Post-Processing)

The diverse_status badge is conditional on target_level_code. Since the engine method receives `$targetLevel` as a parameter, the logic belongs in the PHP post-processing loop:

```php
// In the foreach ($rows as &$row) loop:
// Diverse status -- only meaningful for M1
if ($targetLevel === 'M1') {
    $row['diverse_status'] = ((int)$row['diverse_diff_count'] >= 3) ? 'DIFF_PASS' : 'DIFF_NOT_YET';
} else {
    $row['diverse_status'] = null;  // not applicable
}

// Format supportive/equivalence for display
$row['supportive_days'] = (int)$row['supportive_days'];
$row['equivalence_days'] = (int)$row['equivalence_days'];
```

### Frontend Column Addition Pattern

The CandidateListsPage.vue table currently has 9 columns. Add 3 new columns after "วันที่ครบกำหนด" and before "จำนวนวันที่เหลือ":

```
Existing: ลำดับ | ชื่อ-นามสกุล | ตำแหน่ง | ระดับ | วันเข้าสู่ระดับ | วันครบกำหนด | วันคงเหลือ | สถานะ | การดำเนินการ
New:      ... | วันครบกำหนด | วันเกื้อกูล | สถานะ 3 ต่าง | วันเทียบ ตน. | วันคงเหลือ | ...
```

Update `mapCandidateRow` in `useCandidates.js`:
```javascript
function mapCandidateRow(row) {
    return {
        // ... existing fields ...
        supportiveDays: row.supportive_days,
        equivalenceDays: row.equivalence_days,
        diverseStatus: row.diverse_status,  // 'DIFF_PASS', 'DIFF_NOT_YET', or null
    }
}
```

### Anti-Patterns to Avoid
- **Joining raw tables without aggregation:** Will produce N rows per person if they have N supportive records. Always aggregate first, then JOIN.
- **Using ROUND() on effective_days:** The column is DECIMAL(10,2) -- SUM may produce fractional days. Cast to INT with FLOOR() for display, but keep precision in the DATE_SUB calculation.
- **Checking diverse in SQL WHERE clause:** Diverse is a warning, not a filter. It must NOT exclude rows from the result set.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date arithmetic with leap years | PHP date math | MySQL DATE_ADD/DATE_SUB | MySQL handles leap years correctly in INTERVAL DAY |
| Badge rendering | Custom CSS spans | Existing StatusBadge.vue with DIFF_PASS/DIFF_NOT_YET keys | Already implemented in Phase 6 |
| Row mapping snake_case to camelCase | Manual object construction | Existing mapCandidateRow pattern | Just add new fields to existing mapper |

## Common Pitfalls

### Pitfall 1: Duplicate Rows from Non-Aggregated JOINs
**What goes wrong:** LEFT JOIN directly to supportive_experience produces one result row per supportive record per person. A person with 3 supportive records appears 3 times.
**Why it happens:** Standard JOIN behavior -- each matching row in the joined table produces a separate output row.
**How to avoid:** Always use `(SELECT personnel_id, SUM(...) FROM ... GROUP BY personnel_id)` as a derived table, producing exactly one row per person.
**Warning signs:** Row count in results differs from personnel count; total in pagination doesn't match expected.

### Pitfall 2: effective_days is DECIMAL, not INT
**What goes wrong:** SUM(effective_days) returns DECIMAL. If cast to INT improperly, fractional days are lost, causing qualification_date to be off by 1 day.
**Why it happens:** `effective_days = total_days * ratio_percent / 100` can produce fractions (e.g., 365 * 50/100 = 182.50).
**How to avoid:** Use FLOOR(COALESCE(sup.total_supportive_days, 0)) in the DATE_SUB INTERVAL. Document that fractional days round down (conservative -- person qualifies slightly later, not earlier).
**Warning signs:** qualification_date differs from Excel by 1 day for personnel with non-100% ratio.

### Pitfall 3: Parameter Binding Order
**What goes wrong:** Adding LEFT JOINs to the SQL doesn't require additional `?` parameters (no WHERE clause params in the subqueries). But if you accidentally add WHERE conditions with `?` to the subqueries, the parameter binding order shifts and queries return wrong data or errors.
**Why it happens:** The existing code builds params array as [targetLevel, ...sourceLevels, ...searchTerms]. Adding params in the middle breaks the order.
**How to avoid:** Keep subqueries parameter-free (they aggregate ALL records, filtering is done by the outer JOIN condition on personnel_id). No new `?` placeholders needed in the subqueries.

### Pitfall 4: Regression on Existing Levels
**What goes wrong:** After modification, K2/K3 results show different qualification_dates or row counts.
**Why it happens:** Bug in COALESCE logic, or subquery accidentally filters out personnel.
**How to avoid:** COALESCE(..., 0) ensures zero extra days when no supportive/equivalence records exist. Test K2/K3 before and after -- results must be identical.

### Pitfall 5: colspan Mismatch in Empty State
**What goes wrong:** The empty state row has `colspan="9"`. After adding 3 columns, it needs `colspan="12"`.
**Why it happens:** Easy to forget the empty state row when adding columns to the header.
**Warning signs:** Empty state message doesn't span the full table width.

## Code Examples

### Complete qualification_date Formula in SQL

```sql
-- Source: Derived from D-01 and D-02 decisions + existing QualificationEngine.php
CASE
    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN NULL
    ELSE DATE_SUB(
        DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
        INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0)) AS UNSIGNED) DAY
    )
END AS qualification_date
```

### Remaining Days (must use same formula)

```sql
CASE
    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN NULL
    ELSE DATEDIFF(
        DATE_SUB(
            DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
            INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0)) AS UNSIGNED) DAY
        ),
        CURDATE()
    )
END AS remaining_days
```

### Status CASE (must use same formula)

```sql
CASE
    WHEN p.current_level_code IS NULL OR p.current_level_start_date IS NULL THEN 'check_data'
    WHEN pc.min_years IS NULL THEN 'check_data'
    WHEN DATEDIFF(
        DATE_SUB(
            DATE_ADD(p.current_level_start_date, INTERVAL CAST(pc.min_years AS UNSIGNED) YEAR),
            INTERVAL CAST(FLOOR(COALESCE(sup.total_supportive_days, 0) + COALESCE(eq.total_equivalence_days, 0)) AS UNSIGNED) DAY
        ),
        CURDATE()
    ) <= 0 THEN 'qualified'
    ELSE 'not_yet'
END AS status
```

### Vue Column Template for Diverse Badge (M1 conditional)

```vue
<!-- Source: Follows existing StatusBadge pattern in CandidateListsPage.vue -->
<td class="px-6 py-3">
  <StatusBadge v-if="row.diverseStatus" :status="row.diverseStatus" />
  <span v-else class="text-gray-400">-</span>
</td>
```

### Vue Column Template for Numeric Days

```vue
<td class="px-6 py-3 text-gray-500">
  {{ row.supportiveDays > 0 ? `${row.supportiveDays} วัน` : '-' }}
</td>
```

## Files to Modify

| File | Change Type | Scope |
|------|-------------|-------|
| `backend/QualificationEngine.php` | Modify | Add 3 LEFT JOIN subqueries to `computeForLevel()` and `computeDetail()`; modify qualification_date/remaining_days/status formulas; add PHP post-processing for diverse_status |
| `frontend/src/composables/useCandidates.js` | Modify | Add supportiveDays, equivalenceDays, diverseStatus to mapCandidateRow |
| `frontend/src/pages/CandidateListsPage.vue` | Modify | Add 3 `<th>` headers and 3 `<td>` cells; update colspan |
| `backend/routes/candidates.php` | Possibly modify | May need to add M1 to validTargets array if not already present (currently: K2,K3,K4,O2,O3 -- M1 is missing) |

### Critical: validTargets Gap

The candidates.php route handler only allows `['K2', 'K3', 'K4', 'O2', 'O3']`. The diverse experience check (D-05 through D-08) is specific to M1 (target_level_code = 'M1'), but M1 is not in the valid targets list. This means the diverse badge feature cannot be tested or used until M1 is added to validTargets. However, since M1 full implementation is deferred to v2 (AC-01), the engine code should still include the diverse logic -- it will activate when M1 is added later. For now, the diverse_status column will show "-" for all current target levels (K2-K4, O2-O3).

## Open Questions

1. **FLOOR vs ROUND for fractional effective_days**
   - What we know: effective_days is DECIMAL(10,2), ratio_percent can be non-100
   - What's unclear: Whether HR expects FLOOR (conservative) or ROUND (nearest day)
   - Recommendation: Use FLOOR (conservative -- person never qualifies earlier than they should). Document this choice.

2. **computeDetail() scope**
   - What we know: CONTEXT.md lists it under Claude's Discretion
   - What's unclear: Whether to add supportive/equivalence breakdown lists (individual records) to the detail view
   - Recommendation: Add the aggregated fields (same as computeForLevel) to computeDetail. Skip individual record breakdown (deferred to DV-01).

## Sources

### Primary (HIGH confidence)
- `backend/QualificationEngine.php` -- current engine implementation, verified line by line
- `database/04-career-path.sql` -- table schemas for supportive_experience, diverse_experience, position_equivalence
- `database/08-career-path-v11.sql` -- GENERATED diff_count column, ratio_percent addition
- `frontend/src/pages/CandidateListsPage.vue` -- current table structure
- `frontend/src/composables/useCandidates.js` -- mapCandidateRow pattern
- `frontend/src/components/StatusBadge.vue` -- DIFF_PASS/DIFF_NOT_YET keys confirmed present
- `backend/routes/candidates.php` -- validTargets array confirmed (M1 not included)

### Secondary (MEDIUM confidence)
- MySQL 8.0 DATE_SUB/DATE_ADD behavior with INTERVAL DAY -- well-documented MySQL feature, handles edge cases correctly

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, extending existing PHP+SQL+Vue code
- Architecture: HIGH -- LEFT JOIN derived table pattern is standard MySQL, verified against existing codebase patterns
- Pitfalls: HIGH -- duplicate row issue explicitly flagged in STATE.md, DECIMAL type verified from schema

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable -- no external dependencies)
