# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Port is an HR management system for Thai government agencies (ระบบบริหารงานบุคคล). It features civil servant profiles, position tracking, career management, and administrative dashboards. The UI and comments are primarily in Thai.

## Agent Skill Collections (Reference)

ดูรายละเอียดเต็มที่ **`.claude/skill-collections-comparison.md`** — เปรียบเทียบ skill collections 5 ชุด (superpowers · ecc · mattpocock · addyosmani · karpathy) พร้อม capability matrix และคำแนะนำ stack ใช้ประกอบการเลือก skill ให้เหมาะกับงาน

- **หลัก layering (5 ระดับชั้น):** karpathy (behavioral baseline) → superpowers (process discipline) → mattpocock/addyosmani (SDLC playbook) → ecc (domain/language breadth)
- **Stack ในเครื่องนี้:** superpowers + ecc + mattpocock (active); addyosmani (ติดตั้งแต่ disabled)
- **เลือก skill สำหรับ Smart Port (PHP/Vue/MySQL):**
  - Security/PII → `ecc:security-review`, `ecc:security-scan`
  - โค้ดรีวิว → `ecc:php-review`, `ecc:vue-review`
  - DB/Migration → `ecc:mysql-patterns`, `ecc:database-migrations`
  - Browser E2E / smoke test → `ecc:browser-qa` + chrome-devtools MCP
  - Debug → `superpowers:systematic-debugging` หรือ `diagnosing-bugs`
  - วางแผน → `ecc:plan-prd` + `grilling`
- **ข้อควรระวัง:** อย่าเปิด plugin ที่ทับซ้อนกัน (addyosmani ≈ ecc) พร้อมกัน — สร้าง routing noise

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default Matt Pocock triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: use root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

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
Vue 3 SPA built with Vite + Tailwind CSS.

- **Routing**: Vue Router 4 in `src/router/index.js` with `beforeEach` auth guards (redirects unauthenticated users to `/login`)
- **Pages**: Route views in `src/pages/` as `*Page.vue` components (e.g. `DashboardPage.vue`, `CandidateListsPage.vue`)
- **Components & layouts**: Reusable UI in `src/components/`, page shells in `src/layouts/`
- **API layer**: `src/composables/useApi.js` wraps Fetch with automatic JWT injection and 401 auto-logout
- **State**: Pinia stores in `src/stores/` (`auth.js` for token/user, `ui.js` for toasts)
- **Entry**: `index.html` → `src/main.js` bootstraps `App.vue`
- **Production**: Multi-stage Docker build (Node → Nginx). Nginx config in `frontend/nginx.conf` handles SPA routing and API proxying

### Backend (`backend/`)
Pure PHP REST API with no framework.

- **Single entry point**: `api.php` is the API gateway — all requests route through it via `.htaccess` rewrite rules
- **Routing**: `switch` statement on URL path segments in `api.php`, delegating to feature handlers in `backend/routes/` (e.g. `routes/import.php`, `routes/probation.php`)
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
- **Auth flow**: JWT stored in `localStorage` under keys `authToken` / `auth_token`. The `useApi()` composable auto-attaches the token via request interceptor
- **CORS**: Currently hardcoded to `https://smart-port.onrender.com` in `backend/api.php`
- **Deployment**: Production runs on Render (`smart-port.onrender.com`)

## Project

**Smart Port — Candidate List & Probation Tracking**

ระบบบัญชีรายชื่อผู้มีคุณสมบัติเลื่อนระดับ (Candidate List) และระบบติดตามพ้นทดลองปฏิบัติราชการ (Probation Tracking) สำหรับสำนักงานปลัดกระทรวงยุติธรรม เป็นส่วนขยายของระบบ Smart Port (HRIS) ที่มีอยู่ ใช้งานโดย HR และผู้บริหารเพื่อติดตามความก้าวหน้าในสายอาชีพของข้าราชการ

**Core Value:** HR สามารถดูบัญชีผู้มีคุณสมบัติเลื่อนระดับได้แบบ real-time พร้อมคำนวณวันครบเกณฑ์อัตโนมัติ และติดตามสถานะทดลองปฏิบัติราชการของข้าราชการบรรจุใหม่ได้ทันท่วงที

### Constraints

- **Tech stack**: Must use existing stack — Vue 3/Vite/Tailwind frontend, PHP backend, MySQL 8.0
- **Database**: Must convert PostgreSQL schemas to MySQL syntax (BIGSERIAL→BIGINT AUTO_INCREMENT, etc.)
- **Language**: All UI in Thai (ภาษาไทย)
- **Auth**: Existing JWT flow must be maintained
- **Docker**: Must work within existing docker-compose setup

## Technology Stack

## Languages
- JavaScript (ES2020+) - Frontend application, Vite configuration
- PHP (8.3) - Backend REST API
- SQL - Database queries via PDO
- HTML5 - SPA templates and entry points
- CSS 4 - Base styles in `frontend/style.css`
- Tailwind CSS 4 - Utility-first styling framework
## Runtime
- Node.js 20 (slim variant) - Build and development
- Web Browser (ES2020 compatible) - Runtime
- Nginx (alpine-slim) - Production serving
- PHP 8.3-Apache - API server with mod_rewrite enabled
- Apache 2.4+ - Web server with .htaccess routing support
- MySQL 8.0 - Data persistence
## Package Manager
- npm - Dependency manager
- Lockfile: `package-lock.json` (present)
- Composer 2.7 - Dependency manager
- Lockfile: `composer.lock` (may exist)
## Frameworks & Build Tools
- Vite 6.0.0 - Module bundler and dev server
- Vue 3.5.0 - Progressive JavaScript framework
- Tailwind CSS 4.1.0 - Utility CSS framework
- @tailwindcss/vite 4.1.0 - Vite integration plugin
- Pure PHP REST API - No framework (custom routing via switch statement in `api.php`)
- Firebase PHP-JWT 6.0 - JWT token generation and validation
## Key Dependencies
- firebase/php-jwt 6.0 - JWT implementation (HMAC-SHA256) for authentication
- chart.js 4.4.0 - Chart rendering library
- vue-chartjs 5.3.0 - Vue integration for charts
- lucide-vue-next 0.470.0 - SVG icon library
- pinia 3.0.0 - State management store
- vue-router 4.5.0 - Client-side routing
- @vitejs/plugin-vue 5.2.0 - Vue SFC support in Vite
- @tailwindcss/vite 4.1.0 - Tailwind CSS Vite integration
- esbuild - Bundler (via Rollup, includes Windows variant for cross-platform builds)
## Configuration Files
- `frontend/vite.config.js` - Vite configuration with Vue plugin, Tailwind, and API proxy
- `frontend/tsconfig.json` - TypeScript compiler options (target ES2020, strict mode enabled)
- `frontend/tailwind.config.js` - Tailwind CSS configuration (minimal, extends default theme)
- `backend/config.php` - PDO database connection setup with env var reading
- `docker-compose.yaml` - Orchestration of backend, frontend, and MySQL services
- `frontend/Dockerfile` - Multi-stage build (Node → Nginx)
- `backend/Dockerfile` - Multi-stage build (Composer → PHP-Apache)
- `frontend/nginx.conf` - Nginx configuration for SPA routing and API proxying
- `frontend/.dockerignore` - Exclude node_modules, dist, etc. from build context
## Environment Configuration
- `MYSQL_HOST` - Database hostname (default: `db` in Docker network)
- `MYSQL_DATABASE` - Database name for initialization
- `MYSQL_USER` - Database user
- `MYSQL_PASSWORD` - Database password
- `MYSQL_ROOT_PASSWORD` - MySQL root password
- `JWT_SECRET` - Secret key for JWT signing (HMAC-SHA256)
- `VITE_API_URL` - Frontend API base URL (build-time arg, default: `http://localhost:8000`)
- `localStorage` - Token storage
- `VITE_API_URL` - API endpoint (falls back to `/api` relative path)
- `JWT_SECRET` - Used in `auth.php` for token signing and validation
- `UPLOAD_DIR` - Path to uploads folder (`/var/www/html/uploads/`)
## Database
- Port: 3306 (exposed in Docker)
- Charset: utf8mb4
- Database: `civil_service_mgmt` (via env var `MYSQL_DATABASE`)
- Connection method: PDO with prepared statements
- Error mode: Exception throwing
- Init scripts:
- Persistence: `db-data` named volume
## Service Ports
| Service | Port | Protocol |
|---------|------|----------|
| Frontend (Vite dev) | 5174 | HTTP |
| Frontend (Docker/Nginx) | 8081 | HTTP |
| Backend (Docker/Apache) | 8000 | HTTP |
| MySQL | 3306 | TCP |
## Platform Requirements
- Node.js 20+ with npm
- PHP 8.3+ (for local backend development without Docker)
- Docker & Docker Compose (for containerized development)
- MySQL 8.0 (or via Docker)
- Docker runtime (backend, frontend, and database containerized)
- Render.com hosting (production deployment target)
- Nginx (frontend serving)
- Apache 2.4+ with PHP 8.3 (backend)
## Notable Architectural Decisions
- **No framework for backend:** Custom REST API routing via switch statement and .htaccess rewrites
- **Vue 3 with SPA:** Single-page application with client-side routing and state management
- **Single-page Vite build:** `index.html` is the sole entry; admin-only views are Vue Router routes guarded by `meta.requiresAdmin`, not a separate HTML page
- **API proxy in dev:** Vite dev server proxies `/api` requests to avoid CORS issues locally
- **JWT with custom implementation:** Backend uses both firebase/php-jwt and custom JWT functions
- **Tailwind 4:** Modern CSS framework with `@tailwindcss/vite` plugin for optimal build performance
- **Docker multi-stage builds:** Optimized container images for frontend (Node → Nginx) and backend (Composer → PHP)

## Conventions

## Naming Patterns
- Vue components: PascalCase with `.vue` extension (e.g., `AppSidebar.vue`, `LoginPage.vue`, `StatusBadge.vue`)
- Pages: PascalCase ending with `Page` suffix (e.g., `DashboardPage.vue`, `LoginPage.vue`, `CandidateListsPage.vue`)
- Composables: camelCase with `use` prefix (e.g., `useApi.js`)
- Stores: camelCase with `use` prefix for export (e.g., `useAuthStore`, `useUiStore`)
- Utilities: camelCase (e.g., `router.js`)
- PHP files: camelCase or lowercase (e.g., `api.php`, `auth.php`, `config.php`)
- Vue composable functions: camelCase with `use` prefix (e.g., `useApi()`, `useAuthStore()`)
- Store functions: camelCase (e.g., `showToast()`, `removeToast()`, `setAuth()`, `login()`, `logout()`)
- PHP functions: snake_case (e.g., `base64url_encode()`, `generateJWT()`, `validateJWT()`, `getAuthHeader()`)
- Reactive refs in Vue: camelCase (e.g., `token`, `user`, `isAuthenticated`, `toasts`, `loading`)
- Computed properties: camelCase (e.g., `badgeClass`, `statusLabel`)
- Constants in Vue: camelCase object keys in maps (e.g., `statusMap`, `toastClasses`, `toastIcons`)
- PHP variables: camelCase (e.g., `$method`, `$path`, `$token`, `$data`, `$email`, `$password`)
- Not explicitly used in this codebase (Vue 3/PHP)
- Props object keys: camelCase (e.g., `status`, `label`, `requiresAuth`)
- Response payload keys: snake_case from backend, accessed via destructuring (e.g., `servant_id`, `file_name`, `is_active`)
## Code Style
- No explicit linter/formatter configured
- Indentation: 2 spaces observed in Vue/JS files
- Indentation: 4 spaces observed in PHP files
- Line length: No strict limit observed
- String quotes: Single quotes (`'`) in JS/Vue, single quotes in PHP
- No ESLint or Prettier configuration detected
- No automated code style enforcement
- Manual consistency required across team
## Import Organization
- `@/` resolves to `src/` (configured in `vite.config.js` and `tsconfig.json`)
- Used consistently throughout the codebase
- Direct includes at top: `include 'config.php'`, `include 'auth.php'`
- Global constants defined in `config.php`
## Error Handling
- Try-catch in async functions (e.g., `LoginPage.vue` login handler)
- Error messages stored in reactive refs (e.g., `errorMsg.value`)
- Display errors to user via toast notifications or error message blocks
- HTTP 401 responses trigger logout and redirect to login (`useApi.js`)
- General fetch errors caught and converted to user-friendly messages
- Set HTTP response codes explicitly (`http_response_code()`)
- Return JSON error objects: `{ "error": "message" }`
- Invalid data returns 401 Unauthorized
- Database errors return generic error message with connection details in dev
- Prepared statements used for SQL to prevent injection
## Logging
- No `console.log` calls detected in production code
- Error state stored in reactive variables, displayed to user
- No debug logs observed
- Recommendation: Use `console` for development, remove before production
- No logging output detected
- Errors echoed as JSON responses only
- No persistent logs observed
- Recommendation: Implement file/syslog logging for errors and audit trail
## Comments
- Thai language comments observed throughout codebase for business context
- Comments explain **why**, not what (e.g., "// เปลี่ยนเป็นรหัสลับจริง" = "Change to real secret")
- Business logic comments in Thai to match domain language
- Minimal comments; code structure is self-documenting where possible
- `// Simple validation (ควรเช็คกับ database จริง)` - explains design decision
- `// หมดอายุ 1 ชม.` - explains token expiry
- `// เปลี่ยนเป็นรหัสลับจริง` - marks placeholder requiring change
- `// ลบ "jsx": "react-jsx" เพราะไม่จำเป็นใน Vanilla JS` - explains config change
- Not used in this codebase
- TypeScript enabled but files are `.js` and `.vue`
- No formal documentation generators configured
## Function Design
- Composable functions: 2-5 lines typical (e.g., `useApi()` returns object of 5 methods)
- Store actions: 5-15 lines (e.g., `setAuth()`, `showToast()`)
- Component scripts: 30-50 lines average in `<script setup>` blocks
- Page components: 100+ lines including template
- Composables: Minimal parameters, use dependency injection via async imports
- Store functions: Take data as objects/primitives
- Vue components: Use `defineProps()` for props, destructured in setup
- Composables return object with methods: `{ get, post, put, del, upload }`
- Store functions return promises or void
- Computed properties return reactive values
## Module Design
- Vue components: Default export (Implicit via `<template>` + `<script setup>`)
- Stores: Named export with `defineStore()` result (e.g., `export const useAuthStore = defineStore(...)`)
- Composables: Named export of function (e.g., `export function useApi() { ... }`)
- Utils: Named exports or default export
- Not used in current structure
- Each store/composable imported directly from file path
## Vue 3 Specific Conventions
- All components use `<script setup>` syntax
- Reactive state with `ref()` and `computed()`
- Props defined with `defineProps()`
- Imports hoisted to script block
- Inline event handlers: `@click="handleClick"`
- Form submission: `@submit.prevent="handleSubmit"`
- Custom events via `emits` (observed in `AppLayout.vue`)
## API Integration Pattern
- Success: JSON object with data
- Error: JSON with `{ error: "message" }` or HTTP status text
- 401: Triggers auth reset
## State Management (Pinia)
- Composition API style: `defineStore('storeName', () => { ... })`
- Reactive state: `const state = ref(initialValue)`
- Methods: Regular functions that modify state
- Return object with public state and methods
- Manual localStorage usage in stores (no auto-persist plugin)
- `auth.js` reads from/writes to localStorage for token and user
- `ui.js` maintains runtime-only state (toasts)
## PHP Backend Conventions
- Switch statement on route segments (path[0], path[1])
- HTTP method checking with `$_SERVER['REQUEST_METHOD']`
- Case-based dispatch to handler logic
- PDO with prepared statements exclusively
- `execute()` with array of parameters prevents SQL injection
- `fetch(PDO::FETCH_ASSOC)` for single row, `fetchAll()` for multiple

## Architecture

## Pattern Overview
- Frontend: Vue 3 SPA with Vite bundler, using Pinia for state management
- Backend: Stateless PHP REST API with single entry point (`api.php`)
- Database: MySQL 8.0 with prepared statements via PDO
- Authentication: JWT (HMAC-SHA256) with 1-hour expiry
- Container orchestration: Docker Compose for local development and production
## Layers
- Purpose: Render UI, handle user interactions, manage client-side state
- Location: `frontend/src/`
- Contains: Vue 3 components, pages, layouts, router configuration
- Depends on: API services, router, Pinia stores
- Used by: End users via browser
- Purpose: Handle client-side routing and page transitions
- Location: `frontend/src/router/index.js`
- Contains: Vue Router configuration with route definitions, auth guards
- Depends on: Auth store for authentication checks
- Used by: App.vue (root component), page components via RouterView
- Purpose: Centralize application state (auth, UI notifications)
- Location: `frontend/src/stores/`
- Contains: Pinia stores (`auth.js`, `ui.js`)
- Depends on: API composables, localStorage
- Used by: All components that need shared state
- Purpose: Handle HTTP requests and responses, token injection, error handling
- Location: `frontend/src/composables/useApi.js`
- Contains: `useApi()` composable wrapping Fetch API with interceptor pattern
- Depends on: Auth store for token retrieval
- Used by: Components and stores calling backend endpoints
- Purpose: Reusable UI components and layout structure
- Location: `frontend/src/components/` and `frontend/src/layouts/`
- Contains: AppLayout (sidebar+topbar), AppSidebar, AppTopbar, StatCard, StatusBadge, etc.
- Depends on: Router for navigation, icons (lucide-vue-next)
- Used by: Page components
- Purpose: Full-page views combining multiple components
- Location: `frontend/src/pages/`
- Contains: LoginPage, DashboardPage, CandidateListsPage, ProbationEndPage, PlaceholderPage
- Depends on: Components, API services, router
- Used by: Router configuration
- Purpose: Single entry point for all HTTP requests, authentication validation, routing to handlers
- Location: `backend/api.php`
- Contains: Method detection, route switching via switch statement, CORS headers, JWT validation
- Depends on: `config.php` (DB connection), `auth.php` (JWT functions)
- Used by: All client requests
- Purpose: JWT generation, validation, token header extraction
- Location: `backend/auth.php`
- Contains: `generateJWT()`, `validateJWT()`, `getAuthHeader()` functions
- Depends on: PHP native functions for base64url encoding
- Used by: `api.php` for route protection
- Purpose: Database connection setup and PDO configuration
- Location: `backend/config.php`
- Contains: PDO connection initialization, error handling
- Depends on: Environment variables (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, JWT_SECRET)
- Used by: `api.php` for all database operations
## Data Flow
- **Auth State:** Stored in Pinia `useAuthStore` + localStorage persistence
- **UI State:** Stored in Pinia `useUiStore` for global notifications (toasts)
- **Component State:** Reactive refs/computed in individual components via Vue 3 Composition API
## Key Abstractions
- Purpose: Maps URL paths to Vue components with metadata (auth requirements)
- Examples: `frontend/src/router/index.js`
- Pattern: Vue Router 4 with lazy-loaded pages via dynamic imports
- Guards: `router.beforeEach()` checks auth status and redirects unauthorized access to `/login`
- Purpose: Abstracts HTTP communication and token injection
- Examples: `frontend/src/composables/useApi.js`
- Pattern: Composable returning object with methods (`get`, `post`, `put`, `del`, `upload`)
- Token injection: Automatically adds `Authorization: Bearer {token}` header if token exists
- Error handling: 401 responses trigger automatic logout and redirect to `/login`
- Purpose: Centralized state management with reactive getters/setters
- Examples: `frontend/src/stores/auth.js`, `frontend/src/stores/ui.js`
- Pattern: `defineStore()` with setup function returning state and actions
- Auth store validates JWT expiry client-side and provides `isAuthenticated` computed property
- Purpose: Stateless authentication without server-side session storage
- Location: `backend/auth.php`
- Pattern: Header.Payload.Signature in base64url encoding
- Payload contains: `iat` (issued at), `exp` (expiry = iat + 3600), `data` (user_id)
- Validation checks signature and expiry time
- Purpose: Single request entry point with cross-cutting concerns
- Location: `backend/api.php`
- Pattern: Switch statement routing based on first path segment
- Implements: CORS headers, OPTIONS preflight, auth validation (except /login)
- Endpoints: `/auth/login`, `/login`, `/profile/{id}`, `/photos`, `/forecast`, `/civil-servants`, `/dashboard`, `/candidates`
- Purpose: Persistent storage of civil servant data
- Key tables (inferred from queries): `civil_servants`, `civil_servant_photos`, `advance_notifications`
- Views: `v_civil_servants_current` (denormalized view for current data)
- Procedures: `sp_generate_photo_versions()`, `sp_calculate_promotion_eligibility()`
## Entry Points
- Location: `frontend/index.html`
- Triggers: Browser requests to `/`
- Responsibilities:
- Location: `frontend/src/main.js`
- Triggers: Loaded by index.html
- Responsibilities:
- Location: `backend/api.php`
- Triggers: All HTTP requests (via `.htaccess` rewrite rules)
- Responsibilities:
- Location: `backend/index.php`
- Triggers: Direct requests to `/`
- Responsibilities: Returns simple JSON health check response
## Error Handling
- API errors throw `new Error()` in `useApi()` composable
- Components catch errors in try-catch blocks (e.g., in async mounted hooks)
- 401 responses trigger automatic logout: `auth.logout()` → `router.push('/login')`
- Validation errors shown in form UI via error messages or toast notifications
- Async operations can show loading state via component data or `useUiStore.isLoading`
- Invalid credentials: `http_response_code(401)` + `json_encode(['error' => 'Invalid credentials'])`
- Invalid token: `http_response_code(401)` + `json_encode(['error' => 'Unauthorized'])`
- Database errors: Caught in try-catch around `new PDO()`, returns `['error' => 'Connection failed: ...']`
- Missing parameters: Routes check existence (e.g., `$id = $path[1] ?? null`) and return 404 or empty results
- File upload failures: Return `['error' => 'Upload failed']`
## Cross-Cutting Concerns
- Frontend: HTML5 form validation (email type, required attributes) and custom checks (e.g., password strength)
- Backend: PDO prepared statements prevent SQL injection; explicit parameter binding in all queries
- JWT-based, implemented in `backend/auth.php` and `frontend/src/stores/auth.js`
- Token stored in localStorage; automatically included in API requests via `useApi()` interceptor
- Client-side expiry check via JWT payload decode; backend validates signature and expiry
- No granular role-based access control observed
- Binary: authenticated (has valid JWT) or not
- All authenticated users can access all endpoints (no per-route permission checks)
- Hardcoded to `https://smart-port.onrender.com` in `backend/api.php` line 4
- Allows methods: GET, POST, PUT, DELETE, OPTIONS
- Allows headers: Content-Type, Authorization, X-Requested-With
