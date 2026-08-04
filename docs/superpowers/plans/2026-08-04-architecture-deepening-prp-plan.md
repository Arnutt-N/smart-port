# PRP-Plan — Architecture Deepening

> **For agentic workers:** Execute one phase per session when possible. Each phase must leave `main`-mergeable green tests. Prefer TDD. Use domain terms from `CONTEXT.md`.

**PRD:** `docs/superpowers/specs/2026-08-04-architecture-deepening-prd.md`  
**Goal:** One home each for ใกล้เกณฑ์ display, authz enforcement, twin CRUD shells, gateway handlers, and multiplier math — without touching already-deep Import/Qualification/Sync cores.  
**Architecture:** Deep modules behind small interfaces; thin HTTP/UI adapters (ADR-0001).  
**Tech stack:** PHP 8.3 (no framework, PDO), Vue 3 + Vitest, PHPUnit via `bash backend/tests/run.sh`, Playwright e2e as needed.

---

## PRP context (read before coding)

### Must preserve

- `QualificationEngine` promotion calculation and overview SQL shape (change only threshold constant if product flips 90→N).
- `ImportService` + `routes/import.php` split.
- Sync `TransformHelpers` + transformers.
- `useApi` refresh/CSRF behavior.
- Thai UI copy; Thai API error messages for 403/validation.

### Known friction (from review)

| ID | Friction | Target phase |
|---|---|---|
| F1 | FE near window 30 vs BE 90; overview vs row badge skew | 1 |
| F2 | `requirePermission` opt-in; candidates/probation/ocr/api.php gaps; matrix incomplete | 2 |
| F3 | `useAwards`/`useDecorations` + PHP route twins | 3 |
| F4 | supportive/diverse/equivalence clone shells; inline `/personnel` in pages | 4 |
| F5 | Fat handlers in `api.php`; dashboard levelMap ≠ engine overview | 5 |
| F6 | Multiplier pure functions trapped in `routes/multiplier.php` | 6 |
| F7 | StatusBadge god-map; mappers tested while call sites drift | 1 + 7 |

### Validation gates (run at phase end)

```bash
# Frontend unit
cd frontend && npm test -- --run

# Backend unit (host may lack PHP — use project harness)
bash backend/tests/run.sh --testsuite Unit

# Backend integration (db up)
docker compose up -d db
bash backend/tests/run.sh --testsuite Integration

# Optional e2e after Phase 1
cd frontend && npx playwright test e2e/features/candidates.spec.js
```

### Global constraints

- Conventional commits; no `Co-Authored-By`.
- Prepared statements only.
- PUT not PATCH for updates (CORS / `useApi`).
- Do not edit ADR-0001/0002 decisions; reinforce them.
- Prefer extract/move over rewrite; each commit green.

---

## Phase 0 — Confirm product number (human gate)

**Done when:** CONTEXT.md states the canonical near-threshold days for บัญชีรายชื่อ; PRD decision confirmed.

- [ ] **Step 0.1** Confirm with product: candidates near = **90** (default) or other.
- [ ] **Step 0.2** Confirm probation near window: keep **30** as intentional OR align with candidates.
- [ ] **Step 0.3** Update `CONTEXT.md` with the term **วันใกล้เกณฑ์** and the number(s).
- [ ] **Step 0.4** If not 90, note engine constant change in Phase 1 task list before coding.

**Commit:** `docs: CONTEXT — นิยามวันใกล้เกณฑ์สำหรับบัญชีรายชื่อ`

---

## Phase 1 — Display eligibility (F1, partial F7) — Strong

**Goal:** One interface for candidate display status; overview and badges agree.

**Files (expected):**
- Modify: `frontend/src/composables/useCandidates.js`
- Modify: `frontend/src/composables/useRemainingDays.js` (candidates mode)
- Modify or create: shared FE module for display eligibility (name flexible; small interface)
- Modify: `frontend/src/components/StatusBadge.vue` only if status keys change
- Modify: `backend/QualificationEngine.php` only if Phase 0 chose ≠90
- Tests: `useCandidates.test.js`, `useRemainingDays.test.js`, add cross-constant parity test
- Optional e2e: `frontend/e2e/features/candidates.spec.js`

**Interfaces:**
- `statusFor(backendStatus, remainingDays) → displayStatus`
- Single exported `NEAR_THRESHOLD_DAYS` (or imported from one shared constant module) = canonical number
- Backend continues to expose `remaining_days` + coarse `status`; FE must not invent a second window

### Tasks

- [ ] **1.1** Failing unit tests: remaining_days `45` → `NEAR_MET` when canonical=90; overview mapping cases at 0 / 1 / 90 / 91.
- [ ] **1.2** Implement shared display-eligibility module; wire `useCandidates` through it.
- [ ] **1.3** Align `useRemainingDays` candidates styling with the same constant (probation branch per Phase 0).
- [ ] **1.4** Single source for the FE number: `frontend/src/constants/eligibility.js` exporting `CANDIDATE_NEAR_THRESHOLD_DAYS`. Vitest imports it. PHPUnit keeps asserting `QualificationEngine`’s near window equals that same integer (literal in the PHP test updated only with Phase 0). No shared JSON fixture required.
- [ ] **1.5** StatusBadge cleanup (absorb former Phase 7): inventory status strings; only display-eligibility (+ documented probation map) produce them; remove dead keys; test unknown → safe fallback.
- [ ] **1.6** Extend `frontend/e2e/features/candidates.spec.js` so one case asserts overview top5 badge and level-table row agree for a mid-window (near) person — file already exists; add assertion if missing.
- [ ] **1.7** Run FE unit + QualificationEngine integration + candidates e2e; fix fallout.
- [ ] **1.8** Commit: `fix: บัญชีรายชื่อ — ใกล้เกณฑ์ใช้เกณฑ์เดียวกับ QualificationEngine`

**Phase 1 exit criteria:**
- No code path uses 30 for **candidates** near window.
- `useCandidates.test.js` green with 90-day cases.
- E2E (or explicit new assertion in `candidates.spec.js`): top5 badge and table row agree for a mid-window person.
- StatusBadge is a label adapter over display-eligibility (no duplicate status invention in candidates pages).

---

## Phase 2 — Authz seam (F2) — Strong

**Goal:** Permission matrix complete; every mutating/sensitive route enforces it; FE meta reflects roles.

**Files (expected):**
- Extract/move from `backend/audit.php`: `checkPermission`, `requirePermission`, `getAuthenticatedUser` → authz module (audit logging stays)
- Update all `routes/*.php` + `api.php` inline handlers to call `requirePermission`
- Expand matrix resources: awards, royal_decorations, import, retirement, analytics, work_results, ocr, photos, dashboard, …
- FE: router guards / button visibility beyond binary `requiresAdmin` where needed
- Tests: extend `AuditPermissionTest` (or `AuthzPermissionTest`); add integration samples for viewer denied / operator denied delete / admin allowed

**Interfaces:**
- `checkPermission(role, action, resource): bool` — pure
- `requirePermission(action, resource): void` — HTTP adapter at seam
- Unknown resource ⇒ deny (document explicitly)

### Tasks

- [ ] **2.1** Inventory every route/case; table of resource × methods (commit as `docs/` note or test data provider). Include a **today vs matrix** column: which endpoints are JWT-open today vs what the matrix will allow after this phase — especially `viewer` reads on awards/decorations/retirement/analytics (Open Q3). Resolve Q3 before flipping denies.
- [ ] **2.2** Failing tests for gaps: candidates write, probation write, ocr, photos, awards resource listed for operator.
- [ ] **2.3** Extract authz module; keep thin wrappers in `audit.php` temporarily if needed for BC, then delete wrappers.
- [ ] **2.4** Add `requirePermission` to every inventoried call site; fix matrix allow-lists.
- [ ] **2.5** Align FE hide/disable with matrix (operator no delete; viewer read-only; equivalence approval admin-only).
- [ ] **2.6** Integration: hit 2–3 formerly open endpoints as viewer → 403.
- [ ] **2.7** Commit: `feat: authz — enforce permission seam on all routes`

**Phase 2 exit criteria:**
- No authenticated feature route relies on JWT-only for mutations (except explicitly documented public auth routes).
- `AuditPermissionTest` / successor covers all resources used by routes.
- CONTEXT.md role rules still hold.

---

## Phase 3 — Awards / decorations CRUD collapse (F3) — Strong

**Goal:** One FE resource-CRUD helper + shared PHP list/search/pagination patterns; feature config for field maps.

**Files (expected):**
- Create FE parameterized CRUD helper
- Slim `useAwards.js` / `useDecorations.js` to config + helper
- Extract shared PHP helpers used by `awards.php` / `decorations.php` (personnel exists, paginate, audit hooks)
- Keep domain validation differences (decoration พ.ศ. year range, award enums)
- Update unit tests to target the shared helper

### Tasks

- [ ] **3.1** Characterize twin diffs (fields, validation, table names) in a short checklist in the PR body.
- [ ] **3.2** TDD FE helper: fetchList/create/update/remove with mock `useApi`.
- [ ] **3.3** Migrate awards + decorations composables.
- [ ] **3.4** Extract PHP shared helpers; migrate both routes without HTTP contract changes.
- [ ] **3.5** Run `AwardsRouteTest` / `DecorationsRouteTest` + FE composable tests.
- [ ] **3.6** Commit: `refactor: deepen shared CRUD adapter for awards and decorations`

**Phase 3 exit criteria:**
- No duplicated snake↔camel CRUD boilerplate beyond config objects.
- HTTP contracts unchanged (same paths, status codes, error messages).

---

## Phase 4 — Time-counting shells + personnel typeahead (F4) — Worth exploring

**Goal:** Shared list/search/CRUD shell for supportive/diverse/equivalence; one personnel search module used by pages.

**Files (expected):**
- PHP shared pagination/search helper (from Phase 3 if generalized)
- `supportive.php` / `diverse.php` / `equivalence.php` keep domain-unique SQL/rules
- FE composables slimmed similarly
- Shared personnel typeahead composable; replace inline `api.get('/personnel?...')` in pages

### Tasks

- [ ] **4.1** Mark unique domain lines vs shell lines in each route (comment or PR checklist).
- [ ] **4.2** Extract shell; migrate one route fully; prove tests green; then the other two.
- [ ] **4.3** FE personnel typeahead module; wire four pages (incl. multiplier if applicable).
- [ ] **4.4** Keep equivalence approval permission path untouched in meaning (admin-only).
- [ ] **4.5** Commit: `refactor: shared time-counting route shell and personnel typeahead`

**Phase 4 exit criteria:**
- Domain rules (ratio, diversity dimensions, approval) remain in feature modules.
- No page-local copy of personnel search fetch logic.

---

## Phase 5 — Gateway cleanup (F5) — Worth exploring

**Goal:** `api.php` only authenticates, middleware, and dispatches; personnel/dashboard/photos live under `routes/`.

**Files (expected):**
- New route modules for profile/photos/civil-servants/dashboard/personnel (split sensibly)
- Dashboard candidate metrics call QualificationEngine overview (or shared summary) — delete ad-hoc `levelMap` totals
- Authz from Phase 2 wraps them

### Tasks

- [ ] **5.1** Move one handler group at a time (personnel → photos → dashboard → profile); commit per move if large.
- [ ] **5.2** Replace dashboard candidate aggregation with engine overview — **one server-side call** inside the dashboard route (reuse/cache the overview result in that request). Do not leave FE double-fetching `/dashboard` + `/candidates/overview` for the same numbers.
- [ ] **5.3** Integration/smoke for moved endpoints; assert dashboard totals === overview fixture.
- [ ] **5.4** Commit: `refactor: thin api.php gateway — personnel/dashboard/photos routes`

**Phase 5 exit criteria:**
- `api.php` switch cases are includes (plus auth), not SQL bodies.
- Dashboard totals match `/candidates/overview` for the same DB fixture without a second overview round-trip from the client for those metrics.

---

## Phase 6 — MultiplierEngine extract (F6) — Worth exploring

**Goal:** Pure multiplier math/decorate/clamp in a non-HTTP module; route becomes adapter.

**Files (expected):**
- Create `MultiplierEngine` (or equivalent) with `computeMultiplierFields`, decorate/clamp helpers
- Slim `routes/multiplier.php`
- Retarget `MultiplierAreaDecorateTest` et al. to the engine module

### Tasks

- [ ] **6.1** Move pure functions + failing/relocated unit tests first.
- [ ] **6.2** Route calls engine; no behavior change.
- [ ] **6.3** Confirm QualificationEngine still joins `multiplier_experience` correctly (integration).
- [ ] **6.4** Commit: `refactor: extract MultiplierEngine from HTTP route package`

**Phase 6 exit criteria:**
- Unit tests do not `require` the route file for pure math.
- Multiplier HTTP + qualification integration green.

---

## Phase 7 — (merged into Phase 1)

StatusBadge / status-pipeline cleanup is **absorbed into Phase 1 tasks 1.5–1.8** per review nit — do not run a separate Phase 7 pass.

---

## Dependency graph

```text
Phase 0 (human)
    ↓
Phase 1 (display + StatusBadge)
    ↓
Phase 2 (authz)  ← needs Open Q3 + today-vs-matrix inventory
    ↓
Phase 3 (awards twins)
    ↓
Phase 4 (time-counting shell)
    ↓
Phase 5 (gateway)  ← needs Phase 2; one server-side overview call
    ↓
Phase 6 (multiplier engine)  — can parallelize after Phase 2 if staffing allows
```

**Parallelism:** Phase 6 can start after Phase 2 if nobody is rewriting `multiplier.php` for other reasons.

**Issue split:** After Phase 0, file one GitHub issue per phase (`/to-issues`) — do not AFK the whole epic under a single `ready-for-agent` session.

---

## Stop conditions / rollback

- Any phase that turns Import or QualificationEngine tests red → fix or revert phase; do not continue.
- Authz phase must not ship with admin locked out of login/refresh — run auth integration smoke first.
- If twin CRUD dedupe threatens behavior parity, ship PHP helper only or FE helper only in separate PRs.

---

## Open questions (resolve in Phase 0 or early Phase 2)

1. Candidates near window final number (default 90)?
2. Probation near window intentional 30?
3. Should `viewer` gain read on awards/decorations/retirement/analytics, or remain denied until product says otherwise?
4. OCR: admin-only or operator create?

Defaults if unanswered: (1) 90 (2) keep 30 documented (3) deny until listed (4) admin-only for OCR proxy.
