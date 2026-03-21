# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Port is an HR management system for Thai government agencies (ระบบบริหารงานบุคคล). It features civil servant profiles, position tracking, career management, and administrative dashboards. The UI and comments are primarily in Thai.

## Development Commands

### Local Development (Docker)
```bash
docker-compose up                    # Start all services (backend, frontend, db)
docker-compose up -d db backend      # Start only backend + database
docker-compose down                  # Stop all services
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev                          # Vite dev server on http://localhost:5174
npm run build                        # Production build
npm run preview                      # Preview production build
```

### Backend
No build step. PHP files are served directly by Apache. In Docker, the backend is available at `http://localhost:8000`.

### Database
MySQL 8.0 runs in Docker on port 3306. Schema is initialized from:
- `mysql_database_design.sql` → mounted as `01-schema.sql`
- `photo_management_system.sql` → mounted as `02-data.sql`

Database name: `civil_service_mgmt`. Connection config is in `backend/config.php` (reads from env vars).

## Architecture

### Frontend (`frontend/`)
Vanilla JavaScript SPA built with Vite + Tailwind CSS. No framework (no React/Vue).

- **Routing**: Custom `Router` class in `src/utils/router.js` using History API with regex-based path matching
- **Pages**: Each page is a JS module in `src/pages/` that renders HTML into the DOM
- **Services**: `src/services/apiService.js` wraps Axios with interceptors; `src/services/authService.js` manages JWT tokens in `localStorage`
- **Events**: Centralized `EventManager` in `src/utils/eventManager.js` for cross-component communication
- **Entry points**: `index.html` (main app) and `admin.html` (admin panel), configured as multi-page in `vite.config.js`
- **Production**: Multi-stage Docker build (Node → Nginx). Nginx config in `frontend/nginx.conf` handles SPA routing and API proxying

### Backend (`backend/`)
Pure PHP REST API with no framework.

- **Single entry point**: `api.php` is the API gateway — all requests route through it via `.htaccess` rewrite rules
- **Routing**: `switch` statement on URL path segments in `api.php`
- **Auth**: JWT (HMAC-SHA256) implemented in `auth.php` using `firebase/php-jwt`. Token expiry: 1 hour. Login endpoints (`/auth/login` and `/login`) are unauthenticated; all other routes require a valid JWT in the `Authorization` header
- **Database**: PDO with prepared statements. Connection setup in `config.php`
- **Dependencies**: Managed via Composer (`composer.json`), only dependency is `firebase/php-jwt`

### Service Ports
| Service       | Port  |
|---------------|-------|
| Frontend (Vite dev) | 5174 |
| Frontend (Docker/Nginx) | 8081 |
| Backend (Docker/Apache) | 8000 |
| MySQL | 3306 |

## Key Conventions

- **Language**: UI text, code comments, and database content are in Thai. Maintain Thai language when modifying user-facing strings
- **Tailwind theme**: Custom color palette defined in `frontend/tailwind.config.js` — primary colors use sky-blue, with government-slate secondary tones
- **Font**: Noto Sans Thai is the primary typeface
- **Auth flow**: JWT stored in `localStorage` under keys `authToken` / `auth_token`. ApiService auto-attaches the token via request interceptor
- **CORS**: Currently hardcoded to `https://smart-port.onrender.com` in `backend/api.php`
- **Deployment**: Production runs on Render (`smart-port.onrender.com`)
