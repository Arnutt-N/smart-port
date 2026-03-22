# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Candidate List & Probation Tracking

**Shipped:** 2026-03-22
**Phases:** 3 | **Plans:** 7 | **Sessions:** 2

### What Was Built
- MySQL 8.0 schema with 42 tables and 4 views for career path + probation
- QualificationEngine with education-aware promotion criteria matching
- Probation CRUD API with computed remaining_days via DATEDIFF
- Vue 3 candidate list page with overview dashboard, sub-tabs, debounced search
- Probation tracking page with computed status badges (5 states based on remaining days)
- Thai date formatting (Buddhist Era) and level code mapping utilities

### What Worked
- GSD 3-phase structure (DB → API → Frontend) created clean dependency chain
- Promise.allSettled for overview dashboard aggregation — resilient to partial API failures
- Shared composables (useCandidates, useProbation) kept API integration DRY

### What Was Inefficient
- Docker init debugging: missing SQL files, reserved word `position`, double-encoded UTF-8 — multiple rebuild cycles
- Dockerfile had `pdo_pgsql` instead of `pdo_mysql` — leftover from Render deployment experiment
- Vite proxy + Apache case-sensitive header issue took multiple debug rounds
- Demo login used fake token that backend rejected — caused redirect loop

### Patterns Established
- `SET NAMES utf8mb4;` at top of every SQL init file (prevents Docker entrypoint encoding issues)
- Case-insensitive header lookup in PHP (proxies may lowercase Authorization)
- Thai IME `compositionstart/compositionend` guard for debounced search inputs
- Computed probation status from remaining_days rather than relying solely on backend status

### Key Lessons
1. **Docker volume persistence**: MySQL sets root password only during first init — changing `.env` after volume creation has no effect. Must `docker-compose down -v` to reset.
2. **Docker file mount on Windows**: Mounting a non-existent file creates an empty directory placeholder, not a file — causes silent init failures.
3. **UTF-8 double encoding**: MySQL Docker entrypoint uses default charset (latin1) for init scripts — explicit `SET NAMES utf8mb4` is mandatory for Thai content.
4. **HTTP header case sensitivity**: HTTP spec says headers are case-insensitive, but PHP `apache_request_headers()` returns case-sensitive array — always do case-insensitive lookup.

### Cost Observations
- Model mix: 100% opus (planning + execution + debugging)
- Sessions: 2 (planning session + implementation + UAT session)
- Notable: Most time spent on infrastructure debugging (Docker, encoding, auth) not feature code

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 3 |
| Plans | 7 |
| LOC added | ~4,300 |
| UAT tests | 8 (3 + 5) |
| Bugs found in UAT | 8 |
| Timeline | 1 day |
