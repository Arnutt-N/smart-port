# External Integrations

**Analysis Date:** 2026-03-22

## APIs & External Services

**None Detected**
- No external API integrations identified in codebase
- No Stripe, Supabase, AWS SDK, or third-party HTTP clients configured
- All API communication is internal (frontend to backend)

## Data Storage

**Primary Database:**
- **MySQL 8.0** - Persistent data storage for HR records
  - Connection: PDO via `backend/config.php`
  - Client Library: PDO (built-in PHP extension)
  - Environment variables for credentials:
    - `MYSQL_HOST` - Database hostname
    - `MYSQL_DATABASE` - Database name
    - `MYSQL_USER` - Database user
    - `MYSQL_PASSWORD` - Database password
  - Charset: utf8mb4 (supports Thai characters)
  - Port: 3306 (exposed in Docker)
  - Schema initialization: SQL files mounted at `/docker-entrypoint-initdb.d/`
    - `mysql_database_design.sql` → creates initial schema
    - `photo_management_system.sql` → populates data

**File Storage:**
- **Local filesystem only**
  - Location: `/var/www/html/uploads/` (backend container) or `backend/uploads/`
  - Purpose: User photos and documents
  - Permissions: Managed by Apache user (`www-data`)
  - Persistence: Docker named volume `backend-uploads` (maps to `/var/www/html/uploads/`)

**Caching:**
- **OPcache (PHP)** - Enabled in production
  - Config: `/usr/local/etc/php/conf.d/opcache.ini`
  - Memory: 128 MB
  - Max files: 10,000
  - No external cache service (Redis, Memcached)

**Session Storage:**
- **Browser localStorage** - Client-side token and user data storage
  - `auth_token` - JWT token
  - `refresh_token` - Refresh token (populated if returned by API)
  - `user` - User object (JSON string)

## Authentication & Identity

**Auth Provider:**
- **Custom JWT Implementation** - No external OAuth/OIDC provider
  - Implementation: `backend/auth.php`
  - Algorithm: HMAC-SHA256
  - Token format: Standard JWT (header.payload.signature)
  - Expiry: 1 hour (3600 seconds) from token generation
  - Validation: Signature verification + expiration check

**Login Endpoints:**
- `POST /auth/login` - Primary auth endpoint
- `POST /login` - Alternative auth endpoint (both implement same logic)
- Credentials: Email/username + password
- Current credentials (hardcoded for demo):
  - Username: `admin` or `admin@smartport.gov.th`
  - Password: `admin123`
  - User ID: 1

**Token Storage & Transmission:**
- Storage: `localStorage` in browser
- Transmission: `Authorization: Bearer {token}` header in all authenticated requests
- Auto-attach: Implemented in `frontend/src/composables/useApi.js` via request interceptor
- Demo mode: Alternative login generates demo token (format: `demo-token-{timestamp}`)

**Token Validation Flow:**
- Location: `backend/auth.php` functions
- Applies to: All routes except `/auth/*` and `/login` (line 28 in `api.php`)
- Invalid token response: HTTP 401 Unauthorized
- Expired token response: HTTP 401, triggers logout in frontend (`src/stores/auth.js`)

## Monitoring & Observability

**Error Tracking:**
- **None detected** - No external error tracking service (Sentry, Rollbar, etc.)
- Exception handling: PDOException caught in `backend/config.php`
- API errors: Returned as JSON with `error` key

**Logging:**
- **No structured logging** - System relies on:
  - Web server logs (Apache/Nginx)
  - Console logging (frontend: `console.error`, `console.warn`)
  - Database error messages (via PDOException)
- Logs location (Docker):
  - Backend: Apache logs in container (accessible via `docker logs`)
  - Frontend: Nginx access/error logs in container

**Application Instrumentation:**
- None detected
- No telemetry, performance monitoring, or analytics integration

## CI/CD & Deployment

**Hosting:**
- **Render.com** - Production deployment target
  - Production URL: `https://smart-port.onrender.com`
  - CORS origin hardcoded to this URL in `backend/api.php` (line 4)

**CI Pipeline:**
- None detected - No GitHub Actions, GitLab CI, or similar workflow

**Build & Deployment Process:**
- Docker Compose orchestration (local and production)
- Multi-stage Docker builds:
  - Frontend: `frontend/Dockerfile` (Node → Nginx)
  - Backend: `backend/Dockerfile` (Composer → PHP-Apache)
- Database: Initialized from SQL scripts on container startup

**Environment-specific Configuration:**
- Development: `.env` file (local, not committed)
- Production: Environment variables set on Render.com dashboard
- Docker Compose: Environment variables from `.env` file (mounted)

## Environment Configuration

**Required Environment Variables:**

| Variable | Service | Purpose | Example |
|----------|---------|---------|---------|
| `MYSQL_HOST` | Backend, docker-compose | Database hostname | `db` (Docker) or `localhost` |
| `MYSQL_DATABASE` | MySQL, Backend | Database name | `civil_service_mgmt` |
| `MYSQL_USER` | MySQL, Backend | Database user | `smartport_user` |
| `MYSQL_PASSWORD` | MySQL, Backend | Database password | (secure password) |
| `MYSQL_ROOT_PASSWORD` | MySQL | MySQL root password | (secure password) |
| `JWT_SECRET` | Backend | Secret for JWT signing | (32+ char alphanumeric) |
| `VITE_API_URL` | Frontend build | API base URL (build-time) | `http://localhost:8000` or `https://api.smartport.gov.th` |

**Secrets Location:**
- **Development:** `.env` file in project root (NOT committed)
- **Production:** Render.com environment variables dashboard
- **Docker:** Environment variables passed via `docker-compose.yaml`

## Webhooks & Callbacks

**Incoming Webhooks:**
- None detected

**Outgoing Webhooks:**
- None detected

**API Callbacks:**
- None detected

## API Endpoints (Internal)

**Authentication:**
- `POST /auth/login` - Login endpoint
- `POST /login` - Alternate login endpoint

**Profile Management:**
- `GET /profile/{id}` - Fetch civil servant profile from `v_civil_servants_current` view

**Photo Management:**
- `POST /photos` - Upload user photos (FormData payload)
- `GET /photos/{id}` - Retrieve photo

**Additional Endpoints:**
- `GET /` - Health check (returns API status)

## CORS Configuration

**Current CORS Settings:**
- Location: `backend/api.php` (lines 4-6)
- Allowed origin: `https://smart-port.onrender.com` (hardcoded)
- Allowed methods: GET, POST, PUT, DELETE, OPTIONS
- Allowed headers: Content-Type, Authorization, X-Requested-With
- Preflight handling: OPTIONS requests return 200 OK

**Note:** CORS is hardcoded to production URL. For local development, ensure Vite proxy (`frontend/vite.config.js`) handles API routing to avoid CORS blocking.

## Data Persistence & Backups

**Database Persistence:**
- Docker named volume: `db-data`
- Location: Docker volumes directory (host machine)
- Initialization: SQL scripts mounted at `/docker-entrypoint-initdb.d/`
- No automated backup mechanism detected

**File Storage Persistence:**
- Docker named volume: `backend-uploads`
- Location: `/var/www/html/uploads/` in container

**No External Backup Service:**
- Backup strategy not implemented
- Manual backup required via database exports or volume snapshots

---

*Integration audit: 2026-03-22*
