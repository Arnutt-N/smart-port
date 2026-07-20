# Render + TiDB Production Setup

This project currently deploys cleanly on Render when:

- frontend is a Render Static Site
- backend is a Docker-based Render Web Service
- backend reads TiDB Cloud credentials from Render environment variables

The source of truth for new deployments is [render.yaml](D:/hrProject/smart-port/render.yaml).

## 1. Recommended Render layout

- `smart-port`
  - Type: Static Site
  - Root Directory: `frontend`
  - Build Command: `npm install && npm run build`
  - Publish Directory: `dist`
- `smartport-backend`
  - Type: Web Service
  - Runtime: Docker
  - Root Directory: `backend`
  - Dockerfile Path: `./backend/Dockerfile` (relative to **repository root**, not Root Directory)
  - Docker Context: `.` (meaning the `backend/` folder — **never** `..`)
  - Health Check Path: `/`

  If Docker Context is `..`, Render sends an empty build context (`transferring context: 2B`) and the build fails with `"/backend/composer.json": not found`. The `backend/Dockerfile` uses paths relative to the `backend/` folder (`COPY composer.json`, `COPY . .`).

  Local `docker compose` uses the repo-root [`Dockerfile`](../../Dockerfile) so both `backend/` and `database/` migrations are included.

## 1b. Deploy without GitHub Actions

GitHub `deploy.yml` is `workflow_dispatch`-only while Actions quota is conserved. Use one of:

1. **Auto-Deploy (recommended):** Render Dashboard → each service → **Settings** → **Build & Deploy** → **Auto-Deploy = Yes**, branch `main`. Merges to `main` deploy without GH Actions.
2. **Deploy hook:** set `RENDER_DEPLOY_HOOK_URL` in env or repo-root `.env`, then `.\scripts\deploy-render.ps1` (URL is never printed).
3. **Manual Deploy** in the Render dashboard.

## 2. Required backend environment variables

Set these on the `smartport-backend` Render service:

| Key | Value |
| --- | --- |
| `MYSQL_HOST` | TiDB host from the TiDB Cloud connection dialog |
| `MYSQL_PORT` | `4000` |
| `MYSQL_DATABASE` | `civil_service_mgmt` |
| `MYSQL_USER` | TiDB username |
| `MYSQL_PASSWORD` | TiDB password |
| `MYSQL_SSL` | `true` |
| `JWT_SECRET` | long random secret |

Notes:

- The backend falls back to `MYSQL_HOST=db` when `MYSQL_HOST` is missing in [backend/config.php](D:/hrProject/smart-port/backend/config.php#L12), which is why Render currently returns a database connection error.
- The backend connects to the database before routing requests in [backend/api.php](D:/hrProject/smart-port/backend/api.php#L20), so even `/api/auth/login` fails if TiDB env values are missing.

## 3. Frontend environment variables

Set this on the `smart-port` static site:

| Key | Value |
| --- | --- |
| `VITE_API_URL` | `/api` |

This works together with the rewrite rules in [render.yaml](D:/hrProject/smart-port/render.yaml), so the browser calls the frontend origin and Render forwards `/api/*` to `https://smartport-backend.onrender.com/*`.

## 4. TiDB bootstrap

Before testing production data pages, import the schema into TiDB Cloud:

1. Create the `civil_service_mgmt` database in TiDB Cloud if it does not exist yet.
2. Run [database/tidb-init.sql](D:/hrProject/smart-port/database/tidb-init.sql) against that database.
3. If you have production seed data, import it after the schema load.

Important for Thai text and other UTF-8 data:

- Always specify `utf8mb4` explicitly on both export and import when moving data between MySQL/TiDB instances.
- If you skip the charset flag during import, UTF-8 bytes can be double-encoded and Thai text may appear as mojibake on production.

Recommended commands:

```bash
# Export
mysqldump --default-character-set=utf8mb4 --set-charset ...

# Import
mysql --default-character-set=utf8mb4 ...
```

Operational note:

- Files like `database/reimport-data.sql` are generated repair/import artifacts for a specific environment and should not be committed as normal source files.

## 4.1 Automated migrations on deploy

The backend Docker image copies `database/` and runs pending SQL migrations on container start via `backend/scripts/run-migrations.php` (tracked in `schema_migrations`).

- Local check: `docker compose exec backend php scripts/run-migrations.php`
- Disable at runtime: set `RUN_MIGRATIONS=0` on the backend service
- Override migration directory: set `MIGRATIONS_DIR=/var/www/database`

**Existing TiDB / already-initialized DBs:** if `schema_migrations` is empty but `personnel` or `users` already exists, the runner **baselines** migrations through `14-multiplier-area-admin.sql` (marks them applied, does not re-run non-idempotent `ALTER`s). Only newer files such as `15-api-rate-limit-hits.sql` are executed.

**TEST_SEED migrations:** files whose name contains `test-seed` (e.g. `16-multiplier-test-seed-expand.sql`) are **skipped by default** so provisional data does not land on production. To apply them on a dedicated UAT/dev database, set `APPLY_TEST_SEED_MIGRATIONS=1` on the backend service. Local Docker can set the same env when you intentionally want TEST_SEED rows.

**Fresh empty database:** no baseline — every numbered `NN-*.sql` under `database/` is applied in order (except skipped `test-seed` files unless the env above is set).

New incremental SQL files must use the `NN-description.sql` naming pattern under `database/` and should prefer idempotent DDL (`CREATE TABLE IF NOT EXISTS`, etc.) when possible.

## 5. Manual Render dashboard checklist

If you are updating the existing services instead of recreating them from the Blueprint:

1. Open Render Dashboard.
2. Edit `smartport-backend` **Build & Deploy** settings:
   - Root Directory: `backend`
   - Dockerfile Path: `./backend/Dockerfile`
   - Docker Context: `.` (**must not** be `..`)
   - If the log shows `transferring context: 2B` or `"/backend/composer.json": not found`, Docker Context is wrong.
3. Edit `smartport-backend` environment variables.
4. Add or correct all TiDB values listed above.
5. Redeploy `smartport-backend`.
6. Edit `smart-port` environment variables.
7. Set `VITE_API_URL=/api`.
8. Add static site rewrite rules:
   - Rewrite `/api/*` -> `https://smartport-backend.onrender.com/*`
   - Rewrite `/*` -> `/index.html`
9. Redeploy `smart-port`.

Important:

- `sync: false` values in `render.yaml` only prompt during initial Blueprint creation. If your services already exist, add those secrets manually in Render.
- `JWT_SECRET` in the Blueprint is generated only when the environment variable does not already exist.

## 6. Verification

After redeploying:

1. Check backend health:

```bash
curl -i https://smartport-backend.onrender.com/
```

Expected result: `200 OK` with JSON similar to `{"status":"success","message":"Smart Port API is running."}`

2. Check login:

```bash
curl -i \
  -H "Content-Type: application/json" \
  -d '{"email":"admin","password":"admin123"}' \
  https://smartport-backend.onrender.com/api/auth/login
```

Expected result: JSON token payload, not a database connection error.

3. Confirm change-password route is deployed (no token needed):

```bash
curl -i -X POST https://smartport-backend.onrender.com/auth/change-password \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected result: **`401`** with `{"error":"Unauthorized"}`.  
If you get **`404`**, the live backend image is behind `main` — redeploy `smartport-backend` (Deploy Latest) before testing `/change-password` in the UI.

4. Open the frontend:

```text
https://smart-port.onrender.com/
```

Expected result:

- no white blank screen during first route load
- login page renders
- login succeeds if TiDB env is correct
- after forced password change, `POST /auth/change-password` succeeds (not 404)

## 7. Current production failure mode

If Render still returns an error like:

```text
php_network_getaddresses: getaddrinfo for db failed
```

then `MYSQL_HOST` was not loaded from Render and the backend is still using the local Docker fallback instead of TiDB Cloud.

## 8. Production verification log

### 2026-07-10 — Audit log rollout (PR #32)

Verified after PR #32 (user management RBAC + audit logging) was squash-merged to `main` and deployed:

- Render frontend and backend health checks passing.
- Applied `backend/migrations/03-audit-log.sql` to production TiDB (`smartport`): created `audit_log`, `vw_audit_log`, required indexes, and the `user_id -> users(user_id)` FK with `ON DELETE SET NULL`.
- Authenticated smoke test: production login returned `200`, `/audit` page accessible, `/api/audit?limit=50&offset=0` and `/api/audit?limit=20&offset=0` returned `200` with no failed network requests or console errors.
- Login redirect re-checked: submit redirects to `/dashboard`, and `/login` redirects to `/dashboard` when already authenticated. The earlier apparent stuck-on-`/login` state was a timing/diagnostic artifact, not a production bug.
- Inserted one non-sensitive synthetic `audit_log` row (audit ID `1`, run ID `prod-audit-smoke-2026-07-09T22-26-35-628Z`) and confirmed it renders in the Audit page and its detail modal.

Screenshot evidence: [`docs/evidence/prod-audit-verification-2026-07-10/`](evidence/prod-audit-verification-2026-07-10/)
