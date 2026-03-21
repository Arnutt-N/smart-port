# Stack Research

**Domain:** Career Path Qualification Calculator & Probation Tracking for Thai Government HR (HRIS extension)
**Researched:** 2026-03-22
**Confidence:** MEDIUM-HIGH

## Existing Stack (Fixed -- Not Under Discussion)

These are already in production. This research covers only what to **add**.

| Technology | Version | Purpose |
|------------|---------|---------|
| Vue 3 | ^3.5.0 | Frontend framework |
| Vite | ^6.0.0 | Build tooling |
| Tailwind CSS | ^4.1.0 | Styling |
| Pinia | ^3.0.0 | State management |
| Vue Router | ^4.5.0 | Routing |
| Lucide Vue Next | ^0.470.0 | Icons |
| Chart.js + vue-chartjs | ^4.4.0 / ^5.3.0 | Dashboard charts |
| PHP 8.3 (no framework) | 8.3 | Backend API |
| firebase/php-jwt | ^6.0 | JWT auth |
| MySQL | 8.0 | Database |
| Docker Compose | - | Container orchestration |

## Recommended Additions

### Frontend Libraries

| Library | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|------------|
| @vueuse/core | ^14.2.1 | Composable utilities | Provides `useIntervalFn` for auto-refreshing remaining-days counters, `useDateFormat` for Thai date display, `useLocalStorage` for filter persistence, and `useDebounce` for search inputs. 200+ tree-shakeable functions. Requires Vue 3.5+ which this project already uses. | HIGH |
| date-fns | ^4.1.0 | Date arithmetic | Tree-shakeable (import only what you use), works on native Date objects. Need `differenceInDays`, `addMonths`, `format`, `isAfter`, `isBefore` for qualification date calculations and probation countdowns. Functional API fits Vue 3 composition style better than Day.js's chainable OOP. | HIGH |
| @date-fns/tz | ^1.4.1 | Timezone handling | Bangkok timezone (Asia/Bangkok) for consistent date calculations. Thai government operations are single-timezone but server may run UTC (Docker/Render). Prevents off-by-one day errors in remaining-days calculations. | MEDIUM |

### Backend Libraries (PHP/Composer)

| Library | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|------------|
| Native PHP DateTime | built-in | Date calculations | PHP's built-in `DateTime`, `DateInterval`, and `DateTimeImmutable` are fully sufficient for year/month/day arithmetic needed by promotion criteria (e.g., "6 years in K1 level"). Adding a library like Carbon is overkill when the backend is framework-free and only needs `diff()`, `add()`, `modify()`. Keep dependencies minimal. | HIGH |

### Database Additions (MySQL 8.0)

| Addition | Purpose | Why Recommended | Confidence |
|----------|---------|-----------------|------------|
| MySQL Events (EVENT SCHEDULER) | Auto-update `remaining_days` in `probation_enrollment` and flag `OVERDUE` tasks | MySQL 8.0 has a built-in event scheduler. Use it instead of external cron jobs. Runs `UPDATE probation_enrollment SET remaining_days = DATEDIFF(end_date, CURDATE())` daily. Keeps data fresh for dashboard queries without PHP scheduled tasks. | HIGH |
| Generated Columns | Compute `remaining_days` as virtual column | Alternative to events: `remaining_days INT GENERATED ALWAYS AS (DATEDIFF(end_date, CURDATE())) VIRTUAL`. Zero-maintenance, always accurate. However, generated columns referencing `CURDATE()` are not deterministic in MySQL and thus cannot be indexed or used in virtual columns. Use events instead. | LOW (not feasible) |
| Composite Indexes | Query performance for candidate list filtering | Add indexes on `(target_level_code, status)` in `qualification_calculation` and `(overall_status, end_date)` in `probation_enrollment`. These are the primary filter/sort patterns for the two main pages. | HIGH |

### Development Tools

| Tool | Purpose | Notes | Confidence |
|------|---------|-------|------------|
| Vue DevTools | Debug Pinia stores and component state | Already likely available. Essential for debugging qualification calculation state across 4 tabs. | HIGH |
| MySQL Workbench or DBeaver | Schema management and query testing | For validating the PostgreSQL-to-MySQL schema conversion (9 new tables, 2 views, 3 ALTERs). Test `vw_probation_dashboard` view performance. | MEDIUM |

## Architecture Patterns (Not Libraries)

These are patterns to follow, not additional dependencies.

### Frontend Patterns

**Pinia stores per domain** -- Create `stores/candidateList.js` and `stores/probation.js`. Each store handles its own API calls, caching, and computed filters. The existing `stores/auth.js` and `stores/ui.js` establish this pattern.

**Composables for business logic** -- Extract qualification calculation display logic (remaining days formatting, color-coding, Thai date formatting) into `composables/useQualificationStatus.js` and `composables/useProbationStatus.js`. Keep components thin.

**API service layer** -- The project currently has no `services/` directory despite CLAUDE.md mentioning `apiService.js`. Create `services/api.js` using axios (or fetch) with the existing JWT interceptor pattern from the old vanilla JS codebase. Each domain gets its own service: `services/candidateListApi.js`, `services/probationApi.js`.

### Backend Patterns

**Endpoint file organization** -- The current `api.php` is a single switch-case file. For 2 new feature domains (candidate list + probation), add `include` files: `candidate_list.php` and `probation.php` with their own routing switches. This prevents `api.php` from growing unmanageable.

**Server-side calculation** -- Qualification status (remaining days, eligibility) MUST be calculated server-side in PHP, not client-side in JavaScript. Reasons: (1) single source of truth, (2) the promotion_criteria rules are complex (education-dependent years, combination groups), (3) the qualification_calculation table stores results for audit trail. The frontend should display pre-computed results, not re-derive them.

**MySQL VIEW for dashboard** -- The `vw_probation_dashboard` view (from the schema SQL) aggregates enrollment + personnel + tasks into a single queryable source. Use this view directly from PHP instead of multiple JOIN queries in application code. Convert the PostgreSQL `||` concatenation to MySQL `CONCAT()`.

## Installation

```bash
# Frontend additions
cd frontend
npm install @vueuse/core@^14.2.1 date-fns@^4.1.0 @date-fns/tz@^1.4.1

# Backend -- no new composer dependencies needed
# PHP DateTime is built-in
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| date-fns | Day.js (2KB) | If bundle size is the absolute priority. Day.js is smaller but uses chainable mutable API which is less idiomatic with Vue 3 composition. date-fns is still tree-shakeable to ~10KB for the functions we need. |
| date-fns | Luxon | If you need heavy ICU/Intl formatting. Overkill here -- Thai date formatting is straightforward with `Intl.DateTimeFormat('th-TH')`. |
| @vueuse/core | Hand-written composables | If you only need 2-3 utilities. But VueUse is tree-shakeable so unused functions cost nothing, and it provides battle-tested implementations. |
| Native PHP DateTime | Carbon (nesbot/carbon) | If using Laravel or needing fluent date API. This project has zero framework -- adding Carbon pulls in ~40 files for functionality PHP DateTime already provides. |
| No table library (native HTML) | AG Grid / TanStack Table | If tables need sorting, column resizing, virtual scrolling, or 1000+ rows. Current candidate lists are <200 rows per tab. Native `<table>` with Tailwind styling (already in CandidateListsPage.vue) is sufficient. Revisit if data volume grows. |
| MySQL Event Scheduler | PHP cron job | If the MySQL instance does not support events (some managed DB services disable them). In Docker-managed MySQL 8.0, events are available. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Moment.js | Deprecated since 2020. 300KB+ bundle. Still appears in tutorials. | date-fns or Day.js |
| Vuetify / Element Plus (full UI framework) | Project uses Tailwind CSS 4 with custom components (StatCard, StatusBadge, etc). Adding a component framework creates styling conflicts and doubles bundle size. | Continue with Tailwind + custom Vue components |
| Carbon (PHP) | Adds unnecessary dependency to a no-framework PHP backend. PHP's native DateTime handles all required operations. | PHP DateTime / DateInterval |
| GraphQL | The backend is a simple PHP switch-case router. GraphQL requires schema definition, resolver setup, and a runtime library. REST endpoints are simpler and match the existing pattern. | REST API endpoints in api.php |
| External cron service for remaining_days updates | Adds infrastructure complexity. MySQL Event Scheduler runs inside the database container. | MySQL EVENT SCHEDULER |
| TanStack Table / AG Grid | Over-engineered for tables with <200 rows and simple filtering. Current pages already render native tables with `v-for`. | Native `<table>` + Tailwind CSS |
| axios | Not currently installed in the Vue 3 frontend (the old vanilla JS version used it, but the Vue 3 migration did not carry it over). Use native `fetch` with a thin wrapper, or add axios if consistency with the old pattern is preferred. | `fetch` API with composable wrapper, or add axios ^1.7 |

## Stack Patterns by Feature

**For Candidate List (qualification calculation display):**
- Pinia store `candidateList.js` fetches from `/api/candidate-list?type=general&level=O1-O2`
- date-fns `differenceInDays()` and `format()` for remaining days display
- Composable `useQualificationStatus(remainingDays)` returns `{ color, label, urgency }` for the StatusBadge
- No pagination needed (max ~50-100 candidates per tab per promotion path)

**For Probation Tracking (countdown + task progress):**
- Pinia store `probation.js` fetches from `/api/probation?status=IN_PROGRESS`
- date-fns `differenceInDays()` for countdown, `addMonths()` for end-date calculation
- Composable `useProbationStatus(remainingDays)` returns color tier: green (>30), yellow (15-30), orange (7-14), red (<7)
- VueUse `useIntervalFn()` to refresh remaining days every 60 seconds on the dashboard (optional, since days change daily not per-second)

**For PostgreSQL-to-MySQL schema conversion:**
- `BIGSERIAL` -> `BIGINT AUTO_INCREMENT`
- `BOOLEAN` -> `TINYINT(1)` (MySQL treats BOOLEAN as alias but be explicit)
- `CURRENT_DATE` -> `CURDATE()` in views
- `||` string concat -> `CONCAT()`
- `COMMENT ON TABLE` -> `COMMENT` clause in `CREATE TABLE`
- `CREATE OR REPLACE VIEW` -> supported in MySQL 8.0, no change needed
- Date subtraction `(end_date - start_date)` -> `DATEDIFF(end_date, start_date)`

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @vueuse/core@^14.2 | Vue ^3.5.0 | Requires Vue 3.5+. Project uses ^3.5.0 -- compatible. |
| date-fns@^4.1 | Any JS runtime | Framework-agnostic. No Vue dependency. |
| @date-fns/tz@^1.4 | date-fns@^4.0 | Must use with date-fns v4. Not compatible with v3. |
| Pinia@^3.0 | Vue ^3.5.0, Vue Router ^4.5 | Already in project. Stores for new features follow same patterns. |

## Sources

- [VueUse official site](https://vueuse.org/) -- version 14.2.1, Vue 3.5+ requirement verified
- [@vueuse/core npm](https://www.npmjs.com/package/@vueuse/core) -- latest version and download stats
- [date-fns npm](https://www.npmjs.com/package/date-fns) -- version 4.1.0, 34M weekly downloads
- [date-fns official docs](https://date-fns.org/) -- v4.0 timezone support confirmation
- [Vue 3 table recommendations](https://www.vuescript.com/best-data-table-grid/) -- confirmed native tables sufficient for <200 rows
- [PHP business-day libraries](https://packagist.org/packages/cmixin/business-day) -- evaluated and rejected (Thai government uses calendar days not business days for tenure calculation)
- [date-fns vs Day.js comparison](https://www.oreateai.com/blog/datefns-vs-dayjs-choosing-the-right-date-library-for-your-project/61fc3596640eb5bb331b36415230f309) -- functional vs chainable API tradeoff

---
*Stack research for: Career Path Qualification Calculator & Probation Tracking (Smart Port HRIS)*
*Researched: 2026-03-22*
