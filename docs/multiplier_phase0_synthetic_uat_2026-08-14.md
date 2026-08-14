# Multiplier Phase 0 — Synthetic UAT Report

**Run date:** 2026-08-14 (+07)

**Issue:** #23

**Status:** `SIMULATION_ONLY` — ไม่ใช่ HR sign-off และยังไม่ใช่ director-ready

## Scope and fixture

This run uses the repository's `TEST_SEED` fixtures:

- `docs/multiplier_phase0_master_data_template.csv` — 14 master rows
- `docs/multiplier_phase0_uat_cases_template.csv` — 10 synthetic UAT cases
- multiplier ratio: 200%

The run used a fresh isolated MySQL volume and an isolated API at
`http://127.0.0.1:8001`. UAT records were created and deleted in that database;
`multiplier_experience` had 0 rows after cleanup.

## Gate results

| Gate | Result |
|---|---|
| Offline Phase 0 validator | **12/12 technical PASS (`SYNTHETIC_ONLY`)** |
| Live API UAT (`TC-001`–`TC-010`) | **10/10 PASS, 0 FAIL** |
| Areas loaded by API | **14** |
| Active personnel pool | **7** |
| Whole-province Satun rows | **0** |
| Blank legal-reference fields (format check only) | **0** |
| Blank source-reference fields (format check only) | **0** |
| HR-approved legal/source references | **0/14** |
| Duplicate exact periods | **0** |
| Ambiguous active overlaps | **0** |
| Master rows containing `TEST_SEED` references | **14/14** |

The blank-reference checks and `Verification fields populated (format only)`
only test whether those CSV fields are non-empty. They are not evidence of valid
references or HR approval in this run: all 14 master rows contain `TEST_SEED`
placeholder text rather than reviewed legal/source references or HR signatures.
The validator therefore classifies this package as `SYNTHETIC_ONLY` and blocks
the migration-seed/director-ready verdict.

## Live API case results

Each comparison cell is `expected / actual`. The 360-day breakdown is
`years-months-days`.

| Case | Eligible days | Effective days | Bonus days | 360-day breakdown | Result |
|---|---:|---:|---:|---:|---|
| TC-001 | 16 / 16 | 32 / 32 | 16 / 16 | 0-1-2 / 0-1-2 | PASS |
| TC-002 | 61 / 61 | 122 / 122 | 61 / 61 | 0-4-2 / 0-4-2 | PASS |
| TC-003 | 29 / 29 | 58 / 58 | 29 / 29 | 0-1-28 / 0-1-28 | PASS |
| TC-004 | 31 / 31 | 62 / 62 | 31 / 31 | 0-2-2 / 0-2-2 | PASS |
| TC-005 | 10 / 10 | 20 / 20 | 10 / 10 | 0-0-20 / 0-0-20 | PASS |
| TC-006 | 6 / 6 | 12 / 12 | 6 / 6 | 0-0-12 / 0-0-12 | PASS |
| TC-007 | 16 / 16 | 32 / 32 | 16 / 16 | 0-1-2 / 0-1-2 | PASS |
| TC-008 | 31 / 31 | 62 / 62 | 31 / 31 | 0-2-2 / 0-2-2 | PASS |
| TC-009 | 30 / 30 | 60 / 60 | 30 / 30 | 0-2-0 / 0-2-0 | PASS |
| TC-010 | 15 / 15 | 30 / 30 | 15 / 15 | 0-1-0 / 0-1-0 | PASS |

## Test harness note

The current `/personnel` typeahead contract requires at least two search
characters, while the UAT script previously sent one Thai character (`า`). The
script now requests the active personnel master list with `offset=0`, so the
same harness works with both repository fixtures and real HR data without
depending on fixture-specific names or employee IDs.

After the review fix, the live suite was rerun against a fresh backend image
built from the current branch. The master-list request returned seven active
personnel, all ten cases passed, and cleanup left no rows in
`multiplier_experience`.

## Verdict

**Synthetic technical gate: PASS.** The calculation engine, API create/delete
flow, boundary cases, bonus-day values, and 360-day breakdown matched the
synthetic expected values.

**HR/director readiness: NO.** Before production or director review, HR must
replace `TEST_SEED` with real master data and Excel cases, provide legal/source
references, confirm Satun and emergency-decree coverage, and sign the validation
pack. Then rerun the same offline validator, live API UAT, and data-quality
queries against the HR-approved package.
