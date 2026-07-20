# Repository Guidelines

## Project Structure & Module Organization
`frontend/` contains the Vue 3 + Vite client. Main code is in `frontend/src/`: UI in `components/`, route views in `pages/`, shared logic in `composables/`, Pinia state in `stores/`, and tests in `src/__tests__/`. `backend/` contains the PHP API gateway (`api.php`), config/auth helpers, and feature routes under `backend/routes/`. `database/` stores ordered schema and seed SQL scripts. `docs/` holds reference material. Treat `smartport/db-data/`, `uploads/`, build outputs, and other generated runtime files as local data.

## Build, Test, and Development Commands
- `docker compose up -d db backend`: start MySQL and the PHP API from the repository root.
- `cd frontend && npm install`: install frontend dependencies.
- `cd frontend && npm run dev`: serve on `http://localhost:5174`; `/api` proxies to `http://localhost:8000`.
- `cd frontend && npm test`: run the Vitest suite in `jsdom`.
- `cd frontend && npm run build`: create the production bundle in `frontend/dist`.
- `docker build -t smartport-frontend ./frontend` and `docker build -t smartport-backend ./backend`: match CI image checks.
- **Local CI (no GitHub Actions):** `.\scripts\ci-local.ps1` (Windows) or `bash scripts/ci-local.sh` — frontend test+build, backend PHPUnit via `backend/tests/run.sh`, Docker image builds. Use `-SkipInstall` / `--skip-install` when `node_modules` is already current; `-SkipDocker` / `--skip-docker` for a faster gate.
- **act (run `ci.yml` locally):** install `nektos/act` (`winget install nektos.act`), Docker running, then `.\scripts\ci-act.ps1` or `-Job frontend-build` (prefer single job first). Config: `.actrc`.
- **Pre-push hook:** `.\scripts\install-git-hooks.ps1` sets local `core.hooksPath=.githooks` (frontend vitest on push). Skip: `SKIP_PRE_PUSH=1 git push` or `git push --no-verify`.
- **Deploy without Actions:** enable **Auto-Deploy** on Render for `main`, or `.\scripts\deploy-render.ps1` with `RENDER_DEPLOY_HOOK_URL` in env/`.env` (URL never printed).

## Coding Style & Naming Conventions
Preserve nearby style and avoid whole-file reformatting. Vue and JavaScript use ES modules, 2-space indentation, camelCase variables, `PascalCase.vue` components, `SomethingPage.vue` route screens, and `useX.js` composables. PHP uses 4-space indentation, guard clauses, and domain route files such as `backend/routes/probation.php`. SQL migrations stay numerically ordered, for example `database/05-probation.sql`, with descriptive snake_case identifiers.

## Testing Guidelines
Add frontend tests under `frontend/src/__tests__/` and name them `*.test.js`. Update tests when changing components, composables, routing, status mapping, or user-visible behavior. There is no enforced coverage threshold; cover touched paths and smoke-test affected backend endpoints locally. Before a PR, run `npm test`, `npm run build`, and relevant Docker builds when practical.

## Commit & Pull Request Guidelines
Follow the existing Conventional Commit style: `feat:`, `fix:`, `fix(test):`, and similar short imperative subjects. Keep commits scoped to one logical change. PRs should include a concise summary, linked issue or task, API or schema notes, verification steps, and screenshots for UI changes. Avoid mixing unrelated frontend, backend, and SQL work in one PR.

## Security & Configuration Tips
Keep secrets in local `.env` files only. Review authentication and CORS changes carefully in `backend/api.php`. Do not commit database data, upload artifacts, credentials, or generated bundles.

## Agent-Specific Instructions
Before editing, check the current worktree and do not revert unrelated user changes. Prefer focused patches, preserve repository conventions, and verify changed behavior with the narrowest relevant command.

## Skill Collections Reference
See `.claude/skill-collections-comparison.md` for a detailed comparison of five agent skill collections (superpowers · ecc · mattpocock · addyosmani · karpathy), including a capability matrix, a five-layer model (karpathy → superpowers → mattpocock/addyosmani → ecc), and a recommended stack. Use it to pick the right skill for a task. For this repo (PHP/Vue/MySQL) prefer `ecc:*` skills for security, code review, and DB work; use `superpowers`/`grilling` for process. Avoid enabling overlapping collections at once (addyosmani ≈ ecc) to prevent routing noise.
