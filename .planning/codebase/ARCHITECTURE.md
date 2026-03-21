# Architecture

**Analysis Date:** 2026-03-22

## Pattern Overview

**Overall:** Client-Server with a multi-tiered separation. The system uses a traditional SPA (Single Page Application) frontend communicating with a stateless REST API backend.

**Key Characteristics:**
- Frontend: Vue 3 SPA with Vite bundler, using Pinia for state management
- Backend: Stateless PHP REST API with single entry point (`api.php`)
- Database: MySQL 8.0 with prepared statements via PDO
- Authentication: JWT (HMAC-SHA256) with 1-hour expiry
- Container orchestration: Docker Compose for local development and production

## Layers

**Presentation Layer:**
- Purpose: Render UI, handle user interactions, manage client-side state
- Location: `frontend/src/`
- Contains: Vue 3 components, pages, layouts, router configuration
- Depends on: API services, router, Pinia stores
- Used by: End users via browser

**Routing & Navigation Layer:**
- Purpose: Handle client-side routing and page transitions
- Location: `frontend/src/router/index.js`
- Contains: Vue Router configuration with route definitions, auth guards
- Depends on: Auth store for authentication checks
- Used by: App.vue (root component), page components via RouterView

**State Management Layer:**
- Purpose: Centralize application state (auth, UI notifications)
- Location: `frontend/src/stores/`
- Contains: Pinia stores (`auth.js`, `ui.js`)
- Depends on: API composables, localStorage
- Used by: All components that need shared state

**API Communication Layer:**
- Purpose: Handle HTTP requests and responses, token injection, error handling
- Location: `frontend/src/composables/useApi.js`
- Contains: `useApi()` composable wrapping Fetch API with interceptor pattern
- Depends on: Auth store for token retrieval
- Used by: Components and stores calling backend endpoints

**Layout & Component Layer:**
- Purpose: Reusable UI components and layout structure
- Location: `frontend/src/components/` and `frontend/src/layouts/`
- Contains: AppLayout (sidebar+topbar), AppSidebar, AppTopbar, StatCard, StatusBadge, etc.
- Depends on: Router for navigation, icons (lucide-vue-next)
- Used by: Page components

**Page Layer:**
- Purpose: Full-page views combining multiple components
- Location: `frontend/src/pages/`
- Contains: LoginPage, DashboardPage, CandidateListsPage, ProbationEndPage, PlaceholderPage
- Depends on: Components, API services, router
- Used by: Router configuration

**Backend API Gateway Layer:**
- Purpose: Single entry point for all HTTP requests, authentication validation, routing to handlers
- Location: `backend/api.php`
- Contains: Method detection, route switching via switch statement, CORS headers, JWT validation
- Depends on: `config.php` (DB connection), `auth.php` (JWT functions)
- Used by: All client requests

**Authentication Layer:**
- Purpose: JWT generation, validation, token header extraction
- Location: `backend/auth.php`
- Contains: `generateJWT()`, `validateJWT()`, `getAuthHeader()` functions
- Depends on: PHP native functions for base64url encoding
- Used by: `api.php` for route protection

**Database Access Layer:**
- Purpose: Database connection setup and PDO configuration
- Location: `backend/config.php`
- Contains: PDO connection initialization, error handling
- Depends on: Environment variables (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, JWT_SECRET)
- Used by: `api.php` for all database operations

## Data Flow

**Authentication Flow:**

1. User submits email/password on LoginPage
2. `useAuthStore.login()` calls `useApi().post('/auth/login', credentials)`
3. Request reaches `backend/api.php` → checks if path[0] === 'auth' or 'login'
4. `api.php` calls `generateJWT(user_id)` from `auth.php` if credentials match
5. JWT returned to frontend and stored in `localStorage` (keys: `auth_token`, `user`)
6. `useAuthStore` updates reactive state
7. Router guard in `frontend/src/router/index.js` allows access to protected routes

**Data Retrieval Flow (e.g., fetching civil servants):**

1. Page component mounts and calls `useApi().get('/civil-servants?search=...&limit=20&offset=0')`
2. `useApi()` composable retrieves token from `useAuthStore` and injects into Authorization header
3. Request reaches `backend/api.php` → extracts token from header via `getAuthHeader()`
4. `validateJWT(token)` checks signature and expiry (from `auth.php`)
5. If valid, routes to `case 'civil-servants'` → executes SQL query with PDO
6. Results returned as JSON array
7. Frontend stores in component data, computed properties filter/transform as needed
8. Component re-renders with updated data

**State Management:**

- **Auth State:** Stored in Pinia `useAuthStore` + localStorage persistence
  - Token expiry is client-validated via JWT payload decoding
  - Logout clears both Pinia store and localStorage
- **UI State:** Stored in Pinia `useUiStore` for global notifications (toasts)
  - Toast messages are added/removed via `showToast(message, type, duration)`
  - Auto-dismissal uses setTimeout, manual removal via `removeToast(id)`
- **Component State:** Reactive refs/computed in individual components via Vue 3 Composition API
  - Search filters, pagination, form inputs are component-local

## Key Abstractions

**Router (Frontend):**
- Purpose: Maps URL paths to Vue components with metadata (auth requirements)
- Examples: `frontend/src/router/index.js`
- Pattern: Vue Router 4 with lazy-loaded pages via dynamic imports
- Guards: `router.beforeEach()` checks auth status and redirects unauthorized access to `/login`

**API Service (Frontend):**
- Purpose: Abstracts HTTP communication and token injection
- Examples: `frontend/src/composables/useApi.js`
- Pattern: Composable returning object with methods (`get`, `post`, `put`, `del`, `upload`)
- Token injection: Automatically adds `Authorization: Bearer {token}` header if token exists
- Error handling: 401 responses trigger automatic logout and redirect to `/login`

**Pinia Store:**
- Purpose: Centralized state management with reactive getters/setters
- Examples: `frontend/src/stores/auth.js`, `frontend/src/stores/ui.js`
- Pattern: `defineStore()` with setup function returning state and actions
- Auth store validates JWT expiry client-side and provides `isAuthenticated` computed property

**JWT (Backend):**
- Purpose: Stateless authentication without server-side session storage
- Location: `backend/auth.php`
- Pattern: Header.Payload.Signature in base64url encoding
- Payload contains: `iat` (issued at), `exp` (expiry = iat + 3600), `data` (user_id)
- Validation checks signature and expiry time

**API Gateway (Backend):**
- Purpose: Single request entry point with cross-cutting concerns
- Location: `backend/api.php`
- Pattern: Switch statement routing based on first path segment
- Implements: CORS headers, OPTIONS preflight, auth validation (except /login)
- Endpoints: `/auth/login`, `/login`, `/profile/{id}`, `/photos`, `/forecast`, `/civil-servants`, `/dashboard`, `/candidates`

**Database Schema:**
- Purpose: Persistent storage of civil servant data
- Key tables (inferred from queries): `civil_servants`, `civil_servant_photos`, `advance_notifications`
- Views: `v_civil_servants_current` (denormalized view for current data)
- Procedures: `sp_generate_photo_versions()`, `sp_calculate_promotion_eligibility()`

## Entry Points

**Frontend Entry Point:**
- Location: `frontend/index.html`
- Triggers: Browser requests to `/`
- Responsibilities:
  - Loads main Vue app via `<script type="module" src="/src/main.js"></script>`
  - Provides DOM target element `<div id="app"></div>`
  - Sets page language (`lang="th"`) and theme metadata

**Frontend Main Script:**
- Location: `frontend/src/main.js`
- Triggers: Loaded by index.html
- Responsibilities:
  - Creates Vue app instance with `createApp(App)`
  - Installs Pinia store system
  - Installs Vue Router
  - Mounts app to `#app` div

**Backend Entry Point:**
- Location: `backend/api.php`
- Triggers: All HTTP requests (via `.htaccess` rewrite rules)
- Responsibilities:
  - Sets JSON content-type and CORS headers
  - Handles OPTIONS preflight requests
  - Parses request method and URL path
  - Validates JWT for non-login routes
  - Routes to handler based on first path segment
  - Executes database queries and returns JSON responses

**Backend Root Index:**
- Location: `backend/index.php`
- Triggers: Direct requests to `/`
- Responsibilities: Returns simple JSON health check response

## Error Handling

**Strategy:** Error responses include HTTP status codes and JSON error messages. Frontend handles 401 (Unauthorized) specially to trigger logout and redirect.

**Patterns:**

**Frontend:**
- API errors throw `new Error()` in `useApi()` composable
- Components catch errors in try-catch blocks (e.g., in async mounted hooks)
- 401 responses trigger automatic logout: `auth.logout()` → `router.push('/login')`
- Validation errors shown in form UI via error messages or toast notifications
- Async operations can show loading state via component data or `useUiStore.isLoading`

**Backend:**
- Invalid credentials: `http_response_code(401)` + `json_encode(['error' => 'Invalid credentials'])`
- Invalid token: `http_response_code(401)` + `json_encode(['error' => 'Unauthorized'])`
- Database errors: Caught in try-catch around `new PDO()`, returns `['error' => 'Connection failed: ...']`
- Missing parameters: Routes check existence (e.g., `$id = $path[1] ?? null`) and return 404 or empty results
- File upload failures: Return `['error' => 'Upload failed']`

## Cross-Cutting Concerns

**Logging:** Not explicitly implemented. Could leverage browser DevTools console or backend error_log, but no centralized logging infrastructure observed.

**Validation:**
- Frontend: HTML5 form validation (email type, required attributes) and custom checks (e.g., password strength)
- Backend: PDO prepared statements prevent SQL injection; explicit parameter binding in all queries

**Authentication:**
- JWT-based, implemented in `backend/auth.php` and `frontend/src/stores/auth.js`
- Token stored in localStorage; automatically included in API requests via `useApi()` interceptor
- Client-side expiry check via JWT payload decode; backend validates signature and expiry

**Authorization:**
- No granular role-based access control observed
- Binary: authenticated (has valid JWT) or not
- All authenticated users can access all endpoints (no per-route permission checks)

**CORS:**
- Hardcoded to `https://smart-port.onrender.com` in `backend/api.php` line 4
- Allows methods: GET, POST, PUT, DELETE, OPTIONS
- Allows headers: Content-Type, Authorization, X-Requested-With

---

*Architecture analysis: 2026-03-22*
