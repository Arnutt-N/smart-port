# Coding Conventions

**Analysis Date:** 2026-03-22

## Naming Patterns

**Files:**
- Vue components: PascalCase with `.vue` extension (e.g., `AppSidebar.vue`, `LoginPage.vue`, `StatusBadge.vue`)
- Pages: PascalCase ending with `Page` suffix (e.g., `DashboardPage.vue`, `LoginPage.vue`, `CandidateListsPage.vue`)
- Composables: camelCase with `use` prefix (e.g., `useApi.js`)
- Stores: camelCase with `use` prefix for export (e.g., `useAuthStore`, `useUiStore`)
- Utilities: camelCase (e.g., `router.js`)
- PHP files: camelCase or lowercase (e.g., `api.php`, `auth.php`, `config.php`)

**Functions:**
- Vue composable functions: camelCase with `use` prefix (e.g., `useApi()`, `useAuthStore()`)
- Store functions: camelCase (e.g., `showToast()`, `removeToast()`, `setAuth()`, `login()`, `logout()`)
- PHP functions: snake_case (e.g., `base64url_encode()`, `generateJWT()`, `validateJWT()`, `getAuthHeader()`)

**Variables:**
- Reactive refs in Vue: camelCase (e.g., `token`, `user`, `isAuthenticated`, `toasts`, `loading`)
- Computed properties: camelCase (e.g., `badgeClass`, `statusLabel`)
- Constants in Vue: camelCase object keys in maps (e.g., `statusMap`, `toastClasses`, `toastIcons`)
- PHP variables: camelCase (e.g., `$method`, `$path`, `$token`, `$data`, `$email`, `$password`)

**Types & Interfaces:**
- Not explicitly used in this codebase (Vanilla JS/PHP)
- Props object keys: camelCase (e.g., `status`, `label`, `requiresAuth`)
- Response payload keys: snake_case from backend, accessed via destructuring (e.g., `servant_id`, `file_name`, `is_active`)

## Code Style

**Formatting:**
- No explicit linter/formatter configured
- Indentation: 2 spaces observed in Vue/JS files
- Indentation: 4 spaces observed in PHP files
- Line length: No strict limit observed
- String quotes: Single quotes (`'`) in JS/Vue, single quotes in PHP

**Linting:**
- No ESLint or Prettier configuration detected
- No automated code style enforcement
- Manual consistency required across team

## Import Organization

**Order (Frontend Vue/JS):**
1. Framework imports (`vue`, `pinia`)
2. Third-party component libraries (`lucide-vue-next`)
3. Internal stores/composables (`@/stores/`, `@/composables/`)
4. Internal components (`@/components/`)
5. CSS imports (last)

**Example from `main.js`:**
```javascript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
```

**Example from `LoginPage.vue`:**
```javascript
import { ref, computed } from 'vue'
import { Shield, AlertCircle, AtSign, Lock, Eye, EyeOff, Loader2 } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
```

**Path Aliases:**
- `@/` resolves to `src/` (configured in `vite.config.js` and `tsconfig.json`)
- Used consistently throughout the codebase

**Backend PHP:**
- Direct includes at top: `include 'config.php'`, `include 'auth.php'`
- Global constants defined in `config.php`

## Error Handling

**Frontend Patterns:**
- Try-catch in async functions (e.g., `LoginPage.vue` login handler)
- Error messages stored in reactive refs (e.g., `errorMsg.value`)
- Display errors to user via toast notifications or error message blocks
- HTTP 401 responses trigger logout and redirect to login (`useApi.js`)
- General fetch errors caught and converted to user-friendly messages

**Example from `useApi.js`:**
```javascript
if (response.status === 401) {
  auth.logout()
  const router = (await import('@/router')).default
  router.push('/login')
  throw new Error('Unauthorized')
}

if (!response.ok) {
  const error = await response.json().catch(() => ({ error: response.statusText }))
  throw new Error(error.error || response.statusText)
}
```

**Backend Patterns:**
- Set HTTP response codes explicitly (`http_response_code()`)
- Return JSON error objects: `{ "error": "message" }`
- Invalid data returns 401 Unauthorized
- Database errors return generic error message with connection details in dev
- Prepared statements used for SQL to prevent injection

## Logging

**Framework:** No centralized logging framework (console/echo only)

**Frontend Patterns:**
- No `console.log` calls detected in production code
- Error state stored in reactive variables, displayed to user
- No debug logs observed
- Recommendation: Use `console` for development, remove before production

**Backend Patterns:**
- No logging output detected
- Errors echoed as JSON responses only
- No persistent logs observed
- Recommendation: Implement file/syslog logging for errors and audit trail

## Comments

**When to Comment:**
- Thai language comments observed throughout codebase for business context
- Comments explain **why**, not what (e.g., "// เปลี่ยนเป็นรหัสลับจริง" = "Change to real secret")
- Business logic comments in Thai to match domain language
- Minimal comments; code structure is self-documenting where possible

**Examples:**
- `// Simple validation (ควรเช็คกับ database จริง)` - explains design decision
- `// หมดอายุ 1 ชม.` - explains token expiry
- `// เปลี่ยนเป็นรหัสลับจริง` - marks placeholder requiring change
- `// ลบ "jsx": "react-jsx" เพราะไม่จำเป็นใน Vanilla JS` - explains config change

**JSDoc/TSDoc:**
- Not used in this codebase
- TypeScript enabled but files are `.js` and `.vue`
- No formal documentation generators configured

## Function Design

**Size Guidelines:**
- Composable functions: 2-5 lines typical (e.g., `useApi()` returns object of 5 methods)
- Store actions: 5-15 lines (e.g., `setAuth()`, `showToast()`)
- Component scripts: 30-50 lines average in `<script setup>` blocks
- Page components: 100+ lines including template

**Parameters:**
- Composables: Minimal parameters, use dependency injection via async imports
- Store functions: Take data as objects/primitives
- Vue components: Use `defineProps()` for props, destructured in setup

**Return Values:**
- Composables return object with methods: `{ get, post, put, del, upload }`
- Store functions return promises or void
- Computed properties return reactive values

**Example store function pattern:**
```javascript
function showToast(message, type = 'info', duration = 5000) {
  const id = ++toastId
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, duration)
}
```

## Module Design

**Exports:**
- Vue components: Default export (Implicit via `<template>` + `<script setup>`)
- Stores: Named export with `defineStore()` result (e.g., `export const useAuthStore = defineStore(...)`)
- Composables: Named export of function (e.g., `export function useApi() { ... }`)
- Utils: Named exports or default export

**Barrel Files:**
- Not used in current structure
- Each store/composable imported directly from file path

**File Organization Examples:**

`stores/auth.js` structure:
```javascript
import { defineStore } from 'pinia'
// Multiple internal functions (isTokenValid, setAuth, login, etc.)
export const useAuthStore = defineStore('auth', () => {
  // state
  const token = ref(...)
  // methods
  function setAuth(data) { ... }
  // return
  return { token, user, isAuthenticated, setAuth, login, logout }
})
```

`composables/useApi.js` structure:
```javascript
const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function request(url, options = {}) { ... }

export function useApi() {
  return { get, post, put, del, upload }
}
```

## Vue 3 Specific Conventions

**Script Setup:**
- All components use `<script setup>` syntax
- Reactive state with `ref()` and `computed()`
- Props defined with `defineProps()`
- Imports hoisted to script block

**Component Props:**
```javascript
const props = defineProps({
  status: { type: String, required: true },
  label: { type: String },
})
```

**Computed Properties:**
```javascript
const badgeClass = computed(() => statusMap[props.status]?.class || 'bg-gray-100')
const statusLabel = computed(() => statusMap[props.status]?.label || props.status)
```

**Event Handling:**
- Inline event handlers: `@click="handleClick"`
- Form submission: `@submit.prevent="handleSubmit"`
- Custom events via `emits` (observed in `AppLayout.vue`)

## API Integration Pattern

**Request/Response Flow:**
1. Components call `useApi()` composable to get API methods
2. Methods automatically attach JWT token from auth store
3. 401 responses trigger logout and redirect
4. Errors thrown as Error objects with user-friendly messages
5. Responses parsed as JSON

**Request Building:**
```javascript
post: (url, data) => request(url, { method: 'POST', body: JSON.stringify(data) })
upload: (url, formData) => request(url, { method: 'POST', body: formData })
```

**Response Format Expected:**
- Success: JSON object with data
- Error: JSON with `{ error: "message" }` or HTTP status text
- 401: Triggers auth reset

## State Management (Pinia)

**Store Pattern:**
- Composition API style: `defineStore('storeName', () => { ... })`
- Reactive state: `const state = ref(initialValue)`
- Methods: Regular functions that modify state
- Return object with public state and methods

**Example from `auth.js`:**
```javascript
export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('auth_token') || '')
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  function setAuth(data) {
    token.value = data.token
    localStorage.setItem('auth_token', data.token)
  }

  return { token, user, setAuth, logout }
})
```

**Persistence:**
- Manual localStorage usage in stores (no auto-persist plugin)
- `auth.js` reads from/writes to localStorage for token and user
- `ui.js` maintains runtime-only state (toasts)

## PHP Backend Conventions

**Routing:**
- Switch statement on route segments (path[0], path[1])
- HTTP method checking with `$_SERVER['REQUEST_METHOD']`
- Case-based dispatch to handler logic

**Database Access:**
- PDO with prepared statements exclusively
- `execute()` with array of parameters prevents SQL injection
- `fetch(PDO::FETCH_ASSOC)` for single row, `fetchAll()` for multiple

**Response Format:**
```php
echo json_encode([
  'success' => true,
  'data' => $data,
  'pagination' => [ 'total' => $total, 'has_more' => $has_more ]
]);
```

**Error Responses:**
```php
http_response_code(401);
echo json_encode(['error' => 'Invalid credentials']);
```

---

*Convention analysis: 2026-03-22*
