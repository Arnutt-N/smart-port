# PRD — Architecture Deepening (บัญชีรายชื่อ / สิทธิ์ / CRUD twins)

> Date: 2026-08-04  
> Source: architecture review `architecture-review-20260804-095216.html`  
> Domain vocabulary: `CONTEXT.md` · ADRs: `0001-no-framework-php-api`, `0002-schema-parity-gate`  
> Status: Draft for agent implementation

## Problem Statement

HR and executives using Smart Port see inconsistent “ใกล้ถึงเกณฑ์” signals on the บัญชีรายชื่อผู้มีคุณสมบัติเลื่อนระดับ screen: overview cards and row badges can disagree for the same ข้าราชการ. Operators and viewers also face a permission model that the UI implies but the backend does not always enforce — some career and OCR paths accept any valid JWT. Meanwhile, engineers maintain near-duplicate awards/เครื่องราชฯ and time-counting modules, so routine fixes land in two or three places and bugs hide where tests do not look.

## Solution

Deepen a small set of modules so each domain concept has one home:

1. **Display eligibility** — one definition of “ใกล้เกณฑ์” and display status for บัญชีรายชื่อ (and aligned probation coloring where shared).
2. **Authz** — every authenticated route crosses the same permission seam; FE gates mirror the CONTEXT.md role matrix.
3. **Parameterized CRUD** — collapse awards / royal decorations (then time-counting shells) into shared adapters with feature-specific config.
4. **Gateway cleanup** — move personnel / dashboard / photos handlers out of `api.php` into route modules; dashboard candidate totals reuse QualificationEngine overview.
5. **Multiplier engine** — extract การนับทวีคูณ pure math from the HTTP package (same shape as ImportService).

Leave already-deep modules alone: QualificationEngine core, ImportService, sync transformers / TransformHelpers, useApi transport, thaiDate utils.

## User Stories

1. As an HR operator, I want overview “ใกล้ถึงเกณฑ์” counts and row badges to use the same remaining-days window, so that I trust the บัญชีรายชื่อ list.
2. As an HR operator, I want a ข้าราชการ with 45 days remaining to show one consistent eligibility signal everywhere on the candidates screen, so that I do not double-check elsewhere.
3. As an executive (viewer), I want read-only access to candidates and dashboard without write capability, so that I cannot accidentally change career data.
4. As an operator, I want to create/update เกื้อกูล / แตกต่าง / ทวีคูณ / เทียบตำแหน่ง per the role matrix, so that my daily work matches what the UI offers.
5. As an operator, I want delete actions denied (and buttons hidden), so that I never hit a confusing 403 after clicking.
6. As an admin, I want approve/reject การเทียบตำแหน่ง reserved to admin, so that operators cannot bypass approval.
7. As an admin, I want OCR and photo upload gated by permission, so that non-admin JWTs cannot call those endpoints directly.
8. As a viewer, I want forbidden API responses in Thai with a clear required permission, so that support can explain the denial.
9. As an HR operator, I want awards and เครื่องราชอิสริยาภรณ์ list/create/edit/delete to behave the same way structurally, so that training transfers between the two screens.
10. As an HR operator, I want personnel typeahead on เกื้อกูล / แตกต่าง / เทียบตำแหน่ง / ทวีคูณ to search the same personnel list, so that names and prefixes match.
11. As an HR operator, I want dashboard candidate summary numbers to match `/candidates/overview`, so that home and the candidates page do not disagree.
12. As an HR admin importing Excel, I want ImportService behavior unchanged, so that deepening work does not regress import.
13. As a developer agent, I want unit tests for display eligibility against a single threshold constant, so that FE/BE skew cannot return silently.
14. As a developer agent, I want integration tests that call routes as viewer/operator/admin, so that missing `requirePermission` is caught.
15. As a developer agent, I want multiplier math tests without loading the HTTP route package, so that pure domain changes stay fast and local.
16. As a maintainer, I want `api.php` to stay a thin gateway (ADR-0001), so that new features land in `routes/` not in the switch.
17. As a maintainer, I want authz logic separated from audit logging concerns, so that permission changes do not risk audit side effects.
18. As a maintainer, I want StatusBadge to only render labels for statuses produced by the display-eligibility module, so that gray fallbacks mean a real unknown status.
19. As QA, I want an e2e check that a seeded candidate in the “near” window shows the same badge class on overview top5 and the level table, so that regressions are visible in CI.
20. As an admin, I want awards/decorations validation and personnel-FK errors unchanged in meaning, so that refactor of adapters does not change business rules.
21. As an operator working พ้นทดลองปฏิบัติราชการ, I want probation display colors to follow an explicit documented window (even if different from candidates), so that “near” is not accidentally coupled without intent.
22. As a security reviewer, I want candidates and probation write paths to declare resources in the matrix, so that JWT-only access is insufficient for mutations.
23. As a product owner, I want the canonical near-threshold days recorded in CONTEXT.md, so that humans and agents share one number.
24. As a developer, I want each deepening phase shippable alone with green tests, so that we can stop after any phase without a half-migrated tree.

## Implementation Decisions

### Product / domain

- **Proposed default:** canonical near-threshold for บัญชีรายชื่อ = **90 days** (match `QualificationEngine::NEAR_THRESHOLD_DAYS`). **Phase 0 human gate must confirm** before Phase 1 code. If product chooses another N, engine overview SQL and FE must move to N in the same change set — never leave two numbers.
- Probation “near” window may remain 30 days if product confirms probation UX differs; document the split in CONTEXT.md so it is intentional, not accidental.
- Add glossary note for **วันใกล้เกณฑ์ / near threshold** in CONTEXT.md when the number is finalized.
- **Epic acceptance (all phases):** no dual near-window for candidates; no JWT-only mutating feature route; awards/decorations share one CRUD adapter; `api.php` has no inline SQL bodies for personnel/dashboard/photos; multiplier pure tests do not load the HTTP route package; Import + QualificationEngine regression suites green.

### Architecture seams (prefer existing; few new modules)

| Seam | Module (deep) | Adapters |
|---|---|---|
| Display eligibility | One display-eligibility module (FE; BE keeps emitting `remaining_days` + coarse status) | Candidates composable, StatusBadge, remaining-days helper |
| Authz | Authz module extracted from audit helpers | Every route + inline handlers via `requirePermission`; FE route meta from same matrix concepts |
| Personnel-linked CRUD | Parameterized resource-CRUD (FE) + shared list/search/pagination helper (PHP) | Awards, decorations; later supportive/diverse/equivalence shells |
| Gateway | `api.php` dispatch only | `routes/personnel`, `routes/dashboard`, `routes/photos` (names flexible) |
| Multiplier math | MultiplierEngine (pure) | Thin `routes/multiplier.php` HTTP adapter |

- Do **not** introduce a PHP framework (ADR-0001).
- Do **not** invent a second overview calculator on the dashboard — call QualificationEngine overview (or shared pure summary builder it already uses).
- `civil_servants` list endpoint: prefer routing callers to `personnel` where safe; full table merge remains the longer ADR-0002 track and is out of scope except avoiding new dual logic.
- Authz matrix must list resources that routes already use (`awards`, `royal_decorations`, `import`, `retirement`, `analytics`, `work_results`, `ocr`, …) with explicit admin/operator/viewer rows — unknown resource = deny.
- Snake_case JSON on the wire; camelCase only inside FE mappers.
- No schema migrations required for Phases 1–4; Phase 5–6 likewise expect no schema change unless discovery proves otherwise.

### Sequencing

1. Display eligibility (correctness + locality)  
2. Authz enforcement (security)  
3. Awards/decorations CRUD collapse (clone leverage)  
4. Time-counting route shell + shared personnel typeahead  
5. Gateway fat-handler move + dashboard overview reuse (one server-side overview call; no FE double-fetch for those metrics)  
6. MultiplierEngine extract  

StatusBadge / mapper cleanup folds into Phase 1 (not a separate phase).

## Testing Decisions

- Test **external behavior** at the highest practical seam: HTTP integration for authz and overview parity; pure unit for display-status function and multiplier math; composable/unit for FE mapping; one e2e for candidates badge/overview agreement.
- Good tests assert observable status labels, HTTP status codes, and summary counts — not private helper names.
- Prior art:
  - `backend/tests/Unit/AuditPermissionTest.php` — extend or replace with matrix completeness + route-enforcement integration.
  - `backend/tests/Integration/QualificationEngineTest.php` — near_qualified aggregation.
  - `frontend/src/__tests__/composables/useCandidates.test.js` — update expectations to canonical threshold.
  - `backend/tests/Unit/MultiplierAreaDecorateTest.php` — migrate off `require` of whole route file once engine extracted.
  - Import / Sync suites must stay green; treat as regression gates after each phase.

## Out of Scope

- Rewriting QualificationEngine promotion math, ImportService, or sync transformers.
- Full `civil_servants` → `personnel` data merge / deprecation completion.
- New HR domains (leave, discipline, payroll, KPI).
- Introducing Laravel/Slim or an ORM.
- Redesigning visual design system beyond status color semantics.
- OCR engine changes inside `document-ocr/` (only PHP authz/proxy gating).
- Broad FE page visual redesign of Awards/Decorations beyond structural dedupe.

## Further Notes

- Architecture review HTML (local temp): `architecture-review-20260804-095216.html` — not committed; this PRD is the durable artifact.
- Top recommendation from review: Phase 1 first.
- Agent issue tracker: GitHub (`docs/agents/issue-tracker.md`); epic tracked as [#85](https://github.com/Arnutt-N/smart-port/issues/85). After Phase 0, **split into per-phase issues** via `/to-issues` — only the active phase should carry `ready-for-agent`.
- Implementation plan: `docs/superpowers/plans/2026-08-04-architecture-deepening-prp-plan.md`.
- Review follow-ups applied 2026-08-04: Phase 0 gate on 90-day default; FE `eligibility.js` constant; epic acceptance; Phase 7→1 merge; Phase 2 today-vs-matrix; Phase 5 single overview call; e2e assertion on existing `candidates.spec.js`.
