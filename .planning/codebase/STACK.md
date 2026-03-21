# Technology Stack

**Analysis Date:** 2026-03-22

## Languages

**Primary:**
- JavaScript (ES2020+) - Frontend application, Vite configuration
- PHP (8.3) - Backend REST API
- SQL - Database queries via PDO

**Markup & Styling:**
- HTML5 - SPA templates and entry points
- CSS 4 - Base styles in `frontend/style.css`
- Tailwind CSS 4 - Utility-first styling framework

## Runtime

**Frontend:**
- Node.js 20 (slim variant) - Build and development
- Web Browser (ES2020 compatible) - Runtime
- Nginx (alpine-slim) - Production serving

**Backend:**
- PHP 8.3-Apache - API server with mod_rewrite enabled
- Apache 2.4+ - Web server with .htaccess routing support

**Database:**
- MySQL 8.0 - Data persistence

## Package Manager

**Frontend:**
- npm - Dependency manager
- Lockfile: `package-lock.json` (present)

**Backend:**
- Composer 2.7 - Dependency manager
- Lockfile: `composer.lock` (may exist)

## Frameworks & Build Tools

**Frontend Build:**
- Vite 6.0.0 - Module bundler and dev server
  - Port: 5174 (development)
  - Multi-page app support configured for `index.html` (main) and `admin.html`
  - API proxy: Routes `/api` to backend at `http://localhost:8000`

**Frontend Framework:**
- Vue 3.5.0 - Progressive JavaScript framework
  - Router: vue-router 4.5.0
  - State Management: Pinia 3.0.0
  - Icons: lucide-vue-next 0.470.0
  - Charts: vue-chartjs 5.3.0 + chart.js 4.4.0

**Styling:**
- Tailwind CSS 4.1.0 - Utility CSS framework
- @tailwindcss/vite 4.1.0 - Vite integration plugin

**Backend:**
- Pure PHP REST API - No framework (custom routing via switch statement in `api.php`)
- Firebase PHP-JWT 6.0 - JWT token generation and validation

## Key Dependencies

**Critical:**
- firebase/php-jwt 6.0 - JWT implementation (HMAC-SHA256) for authentication
  - Location: `backend/composer.json`
  - Usage: Token generation in `backend/auth.php`, validation in `api.php`

**Frontend:**
- chart.js 4.4.0 - Chart rendering library
- vue-chartjs 5.3.0 - Vue integration for charts
- lucide-vue-next 0.470.0 - SVG icon library
- pinia 3.0.0 - State management store
- vue-router 4.5.0 - Client-side routing

**Build-specific:**
- @vitejs/plugin-vue 5.2.0 - Vue SFC support in Vite
- @tailwindcss/vite 4.1.0 - Tailwind CSS Vite integration
- esbuild - Bundler (via Rollup, includes Windows variant for cross-platform builds)

## Configuration Files

**Frontend Build:**
- `frontend/vite.config.js` - Vite configuration with Vue plugin, Tailwind, and API proxy
- `frontend/tsconfig.json` - TypeScript compiler options (target ES2020, strict mode enabled)
- `frontend/tailwind.config.js` - Tailwind CSS configuration (minimal, extends default theme)

**Backend:**
- `backend/config.php` - PDO database connection setup with env var reading
  - Env vars: `MYSQL_HOST`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
  - Default JWT_SECRET loaded from env (fallback: hardcoded placeholder in config)

**Container:**
- `docker-compose.yaml` - Orchestration of backend, frontend, and MySQL services
- `frontend/Dockerfile` - Multi-stage build (Node → Nginx)
- `backend/Dockerfile` - Multi-stage build (Composer → PHP-Apache)
- `frontend/nginx.conf` - Nginx configuration for SPA routing and API proxying
- `frontend/.dockerignore` - Exclude node_modules, dist, etc. from build context

## Environment Configuration

**Environment Variables (via docker-compose):**
- `MYSQL_HOST` - Database hostname (default: `db` in Docker network)
- `MYSQL_DATABASE` - Database name for initialization
- `MYSQL_USER` - Database user
- `MYSQL_PASSWORD` - Database password
- `MYSQL_ROOT_PASSWORD` - MySQL root password
- `JWT_SECRET` - Secret key for JWT signing (HMAC-SHA256)
- `VITE_API_URL` - Frontend API base URL (build-time arg, default: `http://localhost:8000`)

**Frontend Runtime Configuration:**
- `localStorage` - Token storage
  - `auth_token` - JWT token
  - `refresh_token` - Refresh token (if applicable)
  - `user` - User object (JSON serialized)
- `VITE_API_URL` - API endpoint (falls back to `/api` relative path)

**Backend Constants:**
- `JWT_SECRET` - Used in `auth.php` for token signing and validation
- `UPLOAD_DIR` - Path to uploads folder (`/var/www/html/uploads/`)

## Database

**MySQL 8.0:**
- Port: 3306 (exposed in Docker)
- Charset: utf8mb4
- Database: `civil_service_mgmt` (via env var `MYSQL_DATABASE`)
- Connection method: PDO with prepared statements
- Error mode: Exception throwing
- Init scripts:
  - `mysql_database_design.sql` → mounted as `/docker-entrypoint-initdb.d/01-schema.sql`
  - `photo_management_system.sql` → mounted as `/docker-entrypoint-initdb.d/02-data.sql`
- Persistence: `db-data` named volume

## Service Ports

| Service | Port | Protocol |
|---------|------|----------|
| Frontend (Vite dev) | 5174 | HTTP |
| Frontend (Docker/Nginx) | 8081 | HTTP |
| Backend (Docker/Apache) | 8000 | HTTP |
| MySQL | 3306 | TCP |

## Platform Requirements

**Development:**
- Node.js 20+ with npm
- PHP 8.3+ (for local backend development without Docker)
- Docker & Docker Compose (for containerized development)
- MySQL 8.0 (or via Docker)

**Production:**
- Docker runtime (backend, frontend, and database containerized)
- Render.com hosting (production deployment target)
- Nginx (frontend serving)
- Apache 2.4+ with PHP 8.3 (backend)

## Notable Architectural Decisions

- **No framework for backend:** Custom REST API routing via switch statement and .htaccess rewrites
- **Vue 3 with SPA:** Single-page application with client-side routing and state management
- **Multi-page Vite config:** Support for both main app (`index.html`) and admin panel (`admin.html`)
- **API proxy in dev:** Vite dev server proxies `/api` requests to avoid CORS issues locally
- **JWT with custom implementation:** Backend uses both firebase/php-jwt and custom JWT functions
- **Tailwind 4:** Modern CSS framework with `@tailwindcss/vite` plugin for optimal build performance
- **Docker multi-stage builds:** Optimized container images for frontend (Node → Nginx) and backend (Composer → PHP)

---

*Stack analysis: 2026-03-22*
