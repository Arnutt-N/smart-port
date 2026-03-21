# Codebase Structure

**Analysis Date:** 2026-03-22

## Directory Layout

```
smart-port/
├── frontend/                       # Vue 3 SPA application
│   ├── src/
│   │   ├── main.js                # App entry point (Vue app instantiation)
│   │   ├── App.vue                # Root component (RouterView + ToastContainer)
│   │   ├── style.css              # Global styles
│   │   ├── components/            # Reusable UI components
│   │   ├── composables/           # Vue composables (useApi)
│   │   ├── layouts/               # Layout components (AppLayout)
│   │   ├── pages/                 # Page components (routed)
│   │   ├── router/                # Vue Router configuration
│   │   ├── stores/                # Pinia state management
│   │   └── utils/                 # Utility functions (currently empty)
│   ├── index.html                 # Main HTML template
│   ├── vite.config.js             # Vite bundler configuration
│   ├── tailwind.config.js         # Tailwind CSS theme (if exists)
│   ├── package.json               # Frontend dependencies
│   ├── Dockerfile                 # Multi-stage build for production
│   ├── nginx.conf                 # Nginx config for SPA routing
│   └── dist/                      # Production build output
│
├── backend/                        # PHP REST API
│   ├── api.php                    # API gateway (main entry point)
│   ├── config.php                 # Database connection and secrets
│   ├── auth.php                   # JWT utilities (generateJWT, validateJWT)
│   ├── index.php                  # Health check endpoint
│   ├── uploads/                   # File storage for civil servant photos
│   ├── Dockerfile                 # Apache + PHP container
│   ├── composer.json              # PHP dependencies (firebase/php-jwt)
│   ├── composer.lock              # Locked dependency versions
│   └── vendor/                    # Composer packages
│
├── docker-compose.yaml            # Orchestration: backend, frontend, db
├── .env                           # Environment variables (secrets, db creds)
├── mysql_database_design.sql      # Schema initialization script
├── photo_management_system.sql    # Sample data initialization
├── CLAUDE.md                      # Developer instructions
├── .gitignore                     # Git ignore patterns
└── uploads/                       # Photos directory (mounted to backend)
```

## Directory Purposes

**frontend/src/:**
- Purpose: Vue 3 application source code
- Contains: Components, pages, router, stores, utilities
- Key files: `main.js` (entry point), `App.vue` (root component)

**frontend/src/components/:**
- Purpose: Reusable UI components
- Contains: Layout components (AppSidebar, AppTopbar), common widgets (StatCard, StatusBadge, ToastContainer, SkeletonLoader, EmptyState)
- Key components:
  - `AppSidebar.vue`: Left navigation with menu items (148 lines)
  - `AppTopbar.vue`: Top bar with branding, user dropdown, logout (149 lines)
  - `StatCard.vue`: Stat box with icon, label, value, sparkline (54 lines)
  - `ToastContainer.vue`: Toast notification system (56 lines)
  - `StatusBadge.vue`: Status indicators for eligibility/overdue (29 lines)
  - `SkeletonLoader.vue`: Loading placeholder (48 lines)

**frontend/src/pages/:**
- Purpose: Full-page view components (routed via Vue Router)
- Contains: Page implementations
- Key pages:
  - `LoginPage.vue`: Login form with email/password
  - `DashboardPage.vue`: Main dashboard with stats, priority tasks, quick actions
  - `CandidateListsPage.vue`: List of civil servants with filtering
  - `ProbationEndPage.vue`: Probation management interface
  - `PlaceholderPage.vue`: Stub for unimplemented features

**frontend/src/layouts/:**
- Purpose: Layout wrappers for authenticated pages
- Contains: AppLayout which provides sidebar + topbar structure
- Key files:
  - `AppLayout.vue`: Responsive layout with responsive sidebar (56 lines)

**frontend/src/router/:**
- Purpose: Route configuration and navigation guards
- Contains: Vue Router setup with auth validation
- Key files:
  - `index.js`: Route definitions with lazy-loaded components, auth guards (106 lines)

**frontend/src/stores/:**
- Purpose: Pinia state management
- Contains: Global application state
- Key stores:
  - `auth.js`: Authentication state (token, user, isAuthenticated, login/logout methods)
  - `ui.js`: UI state (toast notifications)

**frontend/src/composables/:**
- Purpose: Reusable Vue 3 composition functions
- Contains: API communication abstraction
- Key files:
  - `useApi.js`: HTTP request wrapper with token injection and error handling

**backend/:**
- Purpose: PHP REST API
- Contains: API gateway, authentication, database access
- Key files:
  - `api.php`: Main routing and handler logic (274 lines)
  - `config.php`: Database connection setup (27 lines)
  - `auth.php`: JWT utilities (75 lines)
  - `index.php`: Health check response (13 lines)

## Key File Locations

**Entry Points:**
- `frontend/index.html`: HTML page that loads Vue app
- `frontend/src/main.js`: Vue app instantiation with Pinia and Router
- `backend/api.php`: API gateway processing all HTTP requests
- `backend/index.php`: Root health check endpoint

**Configuration:**
- `frontend/vite.config.js`: Bundler config with dev server proxy to backend
- `frontend/tailwind.config.js`: Tailwind color palette and customization
- `backend/config.php`: PDO database connection, JWT_SECRET, UPLOAD_DIR
- `docker-compose.yaml`: Service definitions (frontend, backend, db)
- `.env`: Environment variables (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, etc.)

**Core Logic:**
- `backend/api.php`: API gateway with switch-case routing to endpoints
- `backend/auth.php`: JWT generation/validation functions
- `frontend/src/router/index.js`: Route definitions and auth guards
- `frontend/src/stores/auth.js`: Authentication state and login/logout logic
- `frontend/src/composables/useApi.js`: HTTP request interceptor with token injection

**Testing:**
- No test files found in codebase (testing framework not installed)

## Naming Conventions

**Files:**
- Vue components: PascalCase `.vue` files (e.g., `LoginPage.vue`, `AppLayout.vue`)
- JavaScript utilities: camelCase `.js` files (e.g., `useApi.js`, `router.js`)
- PHP files: snake_case or camelCase (e.g., `api.php`, `config.php`, `auth.php`)
- SQL files: snake_case with descriptive names (e.g., `mysql_database_design.sql`, `photo_management_system.sql`)

**Directories:**
- Component directories: lowercase plural (e.g., `components/`, `pages/`, `stores/`)
- Feature directories: lowercase (e.g., `composables/`, `layouts/`, `utils/`)

**Functions:**
- Vue composables: `use` prefix (e.g., `useApi`, `useAuthStore`)
- Pinia stores: `use` prefix (e.g., `useAuthStore`, `useUiStore`)
- JavaScript functions: camelCase (e.g., `generateJWT`, `validateJWT`, `getAuthHeader`)
- PHP functions: camelCase (e.g., `generateJWT`, `validateJWT`)

**Variables:**
- Constants: UPPERCASE_SNAKE_CASE (e.g., `JWT_SECRET`, `UPLOAD_DIR`)
- Reactive refs: camelCase (e.g., `token`, `user`, `isAuthenticated`)
- Component props: camelCase (e.g., `label`, `value`, `icon`)

**Types:**
- No TypeScript observed; plain JavaScript
- Vue templates use PascalCase for imported components (e.g., `<Shield />`, `<AppSidebar />`)

## Where to Add New Code

**New Feature:**
- **Primary code:** Create feature folder or page file in `frontend/src/pages/` (e.g., `ReportPage.vue`)
- **API endpoint:** Add new `case` block in `backend/api.php` with corresponding SQL queries
- **Components:** If reusable, place in `frontend/src/components/`; if page-specific, create locally within page
- **API calls:** Use `useApi()` composable from `frontend/src/composables/useApi.js`
- **State management:** If shared across components, add to `frontend/src/stores/` or create new store with `defineStore()`
- **Tests:** Create `.test.js` or `.spec.js` files (pattern not yet established; no test runner installed)

**New Component/Module:**
- **Implementation:** Place reusable components in `frontend/src/components/`
- **Naming:** Use PascalCase (e.g., `UserCard.vue`)
- **Props:** Define via `<script setup>` with destructuring (follow LoginPage/DashboardPage pattern)
- **Styles:** Use Tailwind CSS classes; global styles in `frontend/src/style.css` if needed

**Utilities:**
- **Shared helpers:** Add to `frontend/src/utils/` (currently empty directory)
- **API communication:** Extend `frontend/src/composables/useApi.js` if adding new HTTP patterns
- **Database queries:** Add SQL directly in `backend/api.php` switch case or extract to separate function file if complex

**New API Endpoint:**
- **Pattern:** Add new `case 'endpoint-name':` block in `backend/api.php` after line 35
- **Auth:** Routes are automatically protected unless in `['login', 'auth']` exclusion list (line 28)
- **Method handling:** Check `$method` for GET/POST/PUT/DELETE
- **Parameters:** Extract from `$path[]` array, `$_GET`, `$_POST`, or `json_decode(file_get_contents('php://input'))`
- **Response:** Use `echo json_encode($data)` or `http_response_code(status)` for errors
- **Example structure:**
  ```php
  case 'new-endpoint':
      if ($method == 'GET') {
          $stmt = $pdo->prepare("SELECT * FROM table_name WHERE condition = ?");
          $stmt->execute([$param]);
          echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
      }
      break;
  ```

**New Database Table/View:**
- **Location:** Add schema to `mysql_database_design.sql`
- **Initialization:** Run `docker-compose up db` to apply schema changes
- **Queries:** Access via PDO in `backend/api.php` endpoints

## Special Directories

**frontend/dist/:**
- Purpose: Production build output
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

**frontend/node_modules/:**
- Purpose: NPM dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in .gitignore)

**backend/vendor/:**
- Purpose: Composer dependencies (firebase/php-jwt)
- Generated: Yes (by `composer install`)
- Committed: No (in .gitignore)

**backend/uploads/:**
- Purpose: File storage for civil servant photos
- Generated: Yes (by file uploads via `/photos` endpoint)
- Committed: No (mounted as Docker volume)

**uploads/ (project root):**
- Purpose: Photos directory (mapped to backend/uploads in Docker)
- Generated: Yes (by backend uploads)
- Committed: No (in .gitignore)

**.planning/codebase/:**
- Purpose: Codebase analysis documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: Yes (by mapping tool)
- Committed: Yes (documentation)

---

*Structure analysis: 2026-03-22*
