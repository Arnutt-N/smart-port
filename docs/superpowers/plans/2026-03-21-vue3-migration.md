# Vue 3 + Vite 6 + Tailwind CSS 4 Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Smart Port frontend from vanilla JavaScript SPA to Vue 3 with Vite 6 and Tailwind CSS 4, preserving all existing functionality and Thai-language UI.

**Architecture:** Vue 3 SPA with Composition API (`<script setup>`), Vue Router 4 for routing, Pinia for state management. The PHP backend (`api.php`) remains unchanged — Vue communicates via the same JSON API. The sidebar+content layout from `AdminDashboard.js` becomes the main `AppLayout.vue` with `<RouterView>` for page content.

**Tech Stack:** Vue 3.5+, Vite 6, Vue Router 4, Pinia, Tailwind CSS 4, Chart.js 4 (via vue-chartjs), Lucide Vue Next, TypeScript (optional, can add later)

---

## File Structure

```
frontend/
├── index.html                          # Vue mount point (simplified)
├── package.json                        # New dependencies
├── vite.config.js                      # Vite 6 + Vue + Tailwind v4 plugin
├── src/
│   ├── main.js                         # Vue app bootstrap
│   ├── App.vue                         # Root component
│   ├── style.css                       # Global styles (migrated)
│   ├── router/
│   │   └── index.js                    # Vue Router config
│   ├── stores/
│   │   ├── auth.js                     # Pinia auth store
│   │   └── ui.js                       # Pinia UI store (toast, loading)
│   ├── composables/
│   │   └── useApi.js                   # API fetch wrapper (from apiService.js)
│   ├── layouts/
│   │   └── AppLayout.vue               # Sidebar + topbar + <RouterView>
│   ├── components/
│   │   ├── AppSidebar.vue              # Sidebar navigation
│   │   ├── AppTopbar.vue               # Top bar with user menu
│   │   ├── ToastContainer.vue          # Toast notifications
│   │   ├── StatCard.vue                # Reusable stat card
│   │   └── StatusBadge.vue             # Status badge (eligible/pending/overdue)
│   └── pages/
│       ├── LoginPage.vue               # Login form
│       ├── DashboardPage.vue           # Admin dashboard
│       ├── CandidateListsPage.vue      # Candidate lists with tabs
│       ├── ProbationEndPage.vue        # Probation tracking
│       └── PlaceholderPage.vue         # For unfinished pages (profile, analytics, admin)
```

**Key design decisions:**
- `AppLayout.vue` wraps all authenticated pages (sidebar + topbar + `<RouterView>`)
- Login page has NO layout wrapper (full-screen)
- Router navigation guard handles auth redirect (replaces per-page auth checks)
- `useApi` composable replaces `ApiService` class — simpler, reactive
- `authStore` (Pinia) replaces `AuthService` class — reactive, no event system needed
- `uiStore` replaces `EventManager` for toast/loading — components watch store directly

---

## Task 1: Scaffold Vue 3 + Vite 6 Project

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`
- Modify: `frontend/index.html`
- Create: `frontend/src/main.js` (overwrite)
- Create: `frontend/src/App.vue`

### Steps

- [ ] **Step 1: Update package.json with Vue 3 dependencies**

Replace the entire `frontend/package.json`:

```json
{
  "name": "smart-port-frontend",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5174",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.5.0",
    "vue-router": "^4.5.0",
    "pinia": "^3.0.0",
    "chart.js": "^4.4.0",
    "vue-chartjs": "^5.3.0",
    "lucide-vue-next": "^0.470.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.0",
    "@tailwindcss/vite": "^4.1.0",
    "tailwindcss": "^4.1.0",
    "vite": "^6.0.0"
  }
}
```

Note: Tailwind v4 uses `@tailwindcss/vite` plugin instead of PostCSS. No `postcss`, `autoprefixer`, or `postcss.config.cjs` needed. The `tailwind.config.js` file is also no longer used — theme is configured in CSS via `@theme` blocks.

- [ ] **Step 2: Install dependencies**

Run: `cd frontend && rm -rf node_modules package-lock.json && npm install`

- [ ] **Step 3: Update vite.config.js for Vue**

Replace `frontend/vite.config.js`:

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 4: Simplify index.html**

Replace `frontend/index.html`:

```html
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="ระบบสมุดพก - Smart Port Management System สำหรับการจัดการข้อมูลข้าราชการ">
  <meta name="theme-color" content="#0ea5e9">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <title>ระบบสมุดพก | Smart Port Management System</title>
</head>
<body class="font-thai bg-gray-50 antialiased">
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

Note: Lucide icons and Material Icons CDN links are removed — we use `lucide-vue-next` package instead.

- [ ] **Step 5: Create Vue entry point (src/main.js)**

```js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
```

- [ ] **Step 6: Create root App.vue**

```vue
<template>
  <RouterView />
  <ToastContainer />
</template>

<script setup>
import ToastContainer from '@/components/ToastContainer.vue'
</script>
```

- [ ] **Step 7: Verify Vite starts without errors**

Run: `cd frontend && npm run dev`
Expected: Vite dev server starts on port 5174, blank page (no routes yet), no build errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/vite.config.js frontend/index.html frontend/src/main.js frontend/src/App.vue
git commit -m "feat: scaffold Vue 3 + Vite 6 project"
```

---

## Task 2: API Composable + Auth Store (Pinia)

**Files:**
- Create: `frontend/src/composables/useApi.js`
- Create: `frontend/src/stores/auth.js`
- Create: `frontend/src/stores/ui.js`

### Steps

- [ ] **Step 1: Create API composable (src/composables/useApi.js)**

This replaces `apiService.js`. Uses native `fetch()` (same as the old code).

```js
const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function request(url, options = {}) {
  const { useAuthStore } = await import('@/stores/auth.js')
  const auth = useAuthStore()

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (auth.token) {
    headers.Authorization = `Bearer ${auth.token}`
  }

  // Remove Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type']
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  })

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

  return response.json()
}

export function useApi() {
  return {
    get: (url) => request(url),
    post: (url, data) => request(url, { method: 'POST', body: JSON.stringify(data) }),
    put: (url, data) => request(url, { method: 'PUT', body: JSON.stringify(data) }),
    del: (url) => request(url, { method: 'DELETE' }),
    upload: (url, formData) => request(url, { method: 'POST', body: formData }),
  }
}
```

- [ ] **Step 2: Create auth store (src/stores/auth.js)**

This replaces `authService.js` + `EventManager` auth events.

```js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('auth_token') || '')
  const refreshToken = ref(localStorage.getItem('refresh_token') || '')
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isAuthenticated = computed(() => !!token.value && isTokenValid())

  function isTokenValid() {
    if (!token.value) return false
    // Demo tokens are always valid
    if (token.value.startsWith('demo-token-')) return true
    try {
      const payload = JSON.parse(atob(token.value.split('.')[1]))
      return payload.exp * 1000 > Date.now()
    } catch {
      return false
    }
  }

  function setAuth(data) {
    token.value = data.token
    user.value = data.user
    if (data.refreshToken) refreshToken.value = data.refreshToken
    localStorage.setItem('auth_token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    if (data.refreshToken) localStorage.setItem('refresh_token', data.refreshToken)
  }

  async function login(credentials) {
    const { useApi } = await import('@/composables/useApi.js')
    const api = useApi()
    const data = await api.post('/auth/login', credentials)
    setAuth(data)
    return data
  }

  async function demoLogin() {
    const demoToken = `demo-token-${Date.now()}`
    setAuth({
      token: demoToken,
      user: { id: 1, email: 'admin@smartport.gov.th', name: 'Administrator' },
    })
  }

  function logout() {
    token.value = ''
    refreshToken.value = ''
    user.value = null
    localStorage.removeItem('auth_token')
    localStorage.removeItem('authToken')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
  }

  return { token, user, isAuthenticated, isTokenValid, setAuth, login, demoLogin, logout }
})
```

- [ ] **Step 3: Create UI store (src/stores/ui.js)**

Replaces `uiComponents.js` toast + `EventManager` ui events.

```js
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const toasts = ref([])
  const isLoading = ref(false)
  let toastId = 0

  function showToast(message, type = 'info', duration = 5000) {
    const id = ++toastId
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, duration)
  }

  function removeToast(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, isLoading, showToast, removeToast }
})
```

- [ ] **Step 4: Verify stores import without errors**

Temporarily add to `App.vue`:
```vue
<script setup>
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
const auth = useAuthStore()
const ui = useUiStore()
console.log('Auth store:', auth.isAuthenticated)
console.log('UI store:', ui.toasts)
</script>
```

Run: `cd frontend && npm run dev`
Expected: Console shows "Auth store: false", "UI store: []", no errors.

- [ ] **Step 5: Revert App.vue test code, commit**

Remove the test `<script setup>` content (restore to Task 1 Step 6 version).

```bash
git add frontend/src/composables/useApi.js frontend/src/stores/auth.js frontend/src/stores/ui.js frontend/src/App.vue
git commit -m "feat: add API composable and Pinia stores (auth, ui)"
```

---

## Task 3: Vue Router + Auth Navigation Guard

**Files:**
- Create: `frontend/src/router/index.js`

### Steps

- [ ] **Step 1: Create router (src/router/index.js)**

Replaces `router.js` + per-page auth checks in `main.js`.

```js
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/pages/DashboardPage.vue'),
      },
      {
        path: 'candidates/:section?',
        name: 'candidates',
        component: () => import('@/pages/CandidateListsPage.vue'),
        props: true,
      },
      {
        path: 'probation-end',
        name: 'probation-end',
        component: () => import('@/pages/ProbationEndPage.vue'),
      },
      {
        path: 'profile/:id',
        name: 'profile',
        component: () => import('@/pages/PlaceholderPage.vue'),
        props: (route) => ({ title: 'โปรไฟล์', description: `กำลังโหลดโปรไฟล์ ID: ${route.params.id}` }),
      },
      {
        path: 'analytics',
        name: 'analytics',
        component: () => import('@/pages/PlaceholderPage.vue'),
        props: { title: 'การวิเคราะห์ข้อมูล', description: 'การวิเคราะห์ข้อมูล - กำลังพัฒนา' },
      },
      {
        path: 'admin',
        name: 'admin',
        component: () => import('@/pages/PlaceholderPage.vue'),
        props: { title: 'การจัดการระบบ', description: 'การจัดการระบบ - กำลังพัฒนา' },
      },
      {
        path: 'time-counting',
        name: 'time-counting',
        component: () => import('@/pages/PlaceholderPage.vue'),
        props: { title: 'นับเวลาราชการ', description: 'กำลังพัฒนา' },
      },
      {
        path: 'royal-decorations',
        name: 'royal-decorations',
        component: () => import('@/pages/PlaceholderPage.vue'),
        props: { title: 'เครื่องราชอิสริยาภรณ์', description: 'กำลังพัฒนา' },
      },
      {
        path: 'retirement-report',
        name: 'retirement-report',
        component: () => import('@/pages/PlaceholderPage.vue'),
        props: { title: 'รายงานเกษียณ', description: 'กำลังพัฒนา' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const { useAuthStore } = await import('@/stores/auth.js')
  const auth = useAuthStore()

  if (to.meta.requiresAuth !== false && !auth.isAuthenticated) {
    return '/login'
  }

  if (to.path === '/login' && auth.isAuthenticated) {
    return '/dashboard'
  }
})

export default router
```

- [ ] **Step 2: Create PlaceholderPage.vue for unfinished routes**

Create `frontend/src/pages/PlaceholderPage.vue`:

```vue
<template>
  <div class="p-6">
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 class="text-lg font-medium text-gray-900 mb-4">{{ title }}</h2>
      <p class="text-gray-600">{{ description }}</p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: 'หน้านี้' },
  description: { type: String, default: 'กำลังพัฒนา' },
})
</script>
```

- [ ] **Step 3: Verify router loads without errors**

Run: `cd frontend && npm run dev`
Expected: Browser redirects to `/login` (no LoginPage.vue yet, but no crash). Check console for no import errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/router/index.js frontend/src/pages/PlaceholderPage.vue
git commit -m "feat: add Vue Router with auth guard and route definitions"
```

---

## Task 4: Toast Component

**Files:**
- Create: `frontend/src/components/ToastContainer.vue`

### Steps

- [ ] **Step 1: Create ToastContainer.vue**

Replaces `uiComponents.js` toast system.

```vue
<template>
  <div class="fixed top-4 right-4 z-50 space-y-2">
    <TransitionGroup name="toast">
      <div
        v-for="toast in ui.toasts"
        :key="toast.id"
        class="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm min-w-[300px]"
        :class="toastClasses[toast.type]"
      >
        <component :is="toastIcons[toast.type]" class="w-5 h-5 shrink-0" />
        <span class="flex-1">{{ toast.message }}</span>
        <button @click="ui.removeToast(toast.id)" class="shrink-0 opacity-70 hover:opacity-100">
          <X class="w-4 h-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { useUiStore } from '@/stores/ui.js'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-vue-next'

const ui = useUiStore()

const toastClasses = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-yellow-500 text-white',
  info: 'bg-blue-600 text-white',
}

const toastIcons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}
</script>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease-out;
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
```

- [ ] **Step 2: Verify App.vue imports ToastContainer (already done in Task 1 Step 6)**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ToastContainer.vue
git commit -m "feat: add toast notification component"
```

---

## Task 5: Login Page

**Files:**
- Create: `frontend/src/pages/LoginPage.vue`

### Steps

- [ ] **Step 1: Create LoginPage.vue**

Migrates the glass-morphism login from `loginPage.js`.

```vue
<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-100 via-blue-50 to-indigo-100 p-4">
    <div class="w-full max-w-md">
      <!-- Login Card -->
      <div class="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/40 p-8">
        <!-- Header -->
        <div class="text-center mb-8">
          <div class="w-16 h-16 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield class="w-8 h-8 text-white" />
          </div>
          <h1 class="text-2xl font-bold text-gray-900">ระบบสมุดพก</h1>
          <p class="text-gray-500 mt-1">Smart Port Management System</p>
        </div>

        <!-- Error Message -->
        <div v-if="errorMsg" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {{ errorMsg }}
        </div>

        <!-- Login Form -->
        <form @submit.prevent="handleLogin" class="space-y-5">
          <div>
            <label class="label">อีเมล</label>
            <input
              v-model="form.email"
              type="text"
              class="input"
              placeholder="admin@smartport.gov.th"
              autocomplete="username"
            />
          </div>

          <div>
            <label class="label">รหัสผ่าน</label>
            <div class="relative">
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                class="input pr-10"
                placeholder="กรอกรหัสผ่าน"
                autocomplete="current-password"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <component :is="showPassword ? EyeOff : Eye" class="w-5 h-5" />
              </button>
            </div>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="btn-primary w-full py-2.5"
          >
            <Loader2 v-if="loading" class="w-5 h-5 animate-spin mr-2" />
            {{ loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ' }}
          </button>
        </form>

        <!-- Demo Section -->
        <div class="mt-6 pt-6 border-t border-gray-200">
          <p class="text-xs text-gray-500 text-center mb-3">สำหรับทดลองใช้งาน</p>
          <div class="flex gap-2">
            <button @click="fillDemo" class="btn-outline flex-1 py-2 text-sm">
              กรอกข้อมูลตัวอย่าง
            </button>
            <button @click="skipLogin" class="btn-ghost flex-1 py-2 text-sm">
              ข้ามการเข้าสู่ระบบ
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()

const form = reactive({ email: '', password: '' })
const showPassword = ref(false)
const loading = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  errorMsg.value = ''
  loading.value = true
  try {
    await auth.login({ email: form.email, password: form.password })
    router.push('/dashboard')
  } catch (e) {
    errorMsg.value = e.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
  } finally {
    loading.value = false
  }
}

function fillDemo() {
  form.email = 'admin@smartport.gov.th'
  form.password = 'admin123'
}

async function skipLogin() {
  await auth.demoLogin()
  router.push('/dashboard')
}
</script>
```

- [ ] **Step 2: Verify login page renders**

Run: `cd frontend && npm run dev`
Navigate to: `http://localhost:5174/login`
Expected: Glass-morphism login card with email/password fields, demo buttons, Thai text.

- [ ] **Step 3: Verify demo login flow**

Click "ข้ามการเข้าสู่ระบบ" button.
Expected: Redirects to `/dashboard` (blank page with layout, no crash). Check localStorage has `auth_token` set.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LoginPage.vue
git commit -m "feat: add Vue login page with demo auth"
```

---

## Task 6: AppLayout (Sidebar + Topbar)

**Files:**
- Create: `frontend/src/layouts/AppLayout.vue`
- Create: `frontend/src/components/AppSidebar.vue`
- Create: `frontend/src/components/AppTopbar.vue`

### Steps

- [ ] **Step 1: Create AppSidebar.vue**

Migrates sidebar from `AdminDashboard.js`.

```vue
<template>
  <aside
    class="sidebar overflow-y-auto"
    :class="{ 'sidebar-hidden': !open }"
  >
    <!-- Logo -->
    <div class="h-16 flex items-center px-4 border-b border-gray-200">
      <div class="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center mr-3">
        <Shield class="w-5 h-5 text-white" />
      </div>
      <span class="text-lg font-semibold text-gray-900">ระบบสมุดพก</span>
    </div>

    <!-- Navigation -->
    <nav class="p-3 space-y-1">
      <template v-for="item in menuItems" :key="item.id">
        <!-- Menu item with submenu -->
        <div v-if="item.children">
          <button
            @click="toggleSubmenu(item.id)"
            class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors"
            :class="isParentActive(item) ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'"
          >
            <span class="flex items-center gap-3">
              <component :is="item.icon" class="w-5 h-5" />
              {{ item.label }}
            </span>
            <ChevronDown
              class="w-4 h-4 transition-transform"
              :class="{ 'rotate-180': openSubmenus.has(item.id) }"
            />
          </button>
          <div v-show="openSubmenus.has(item.id)" class="ml-8 mt-1 space-y-1">
            <RouterLink
              v-for="child in item.children"
              :key="child.id"
              :to="child.to"
              class="block px-3 py-2 rounded-lg text-sm transition-colors"
              :class="route.path === child.to ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-500 hover:bg-gray-100'"
            >
              {{ child.label }}
            </RouterLink>
          </div>
        </div>

        <!-- Simple menu item -->
        <RouterLink
          v-else
          :to="item.to"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
          :class="route.path === item.to ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-100'"
        >
          <component :is="item.icon" class="w-5 h-5" />
          {{ item.label }}
        </RouterLink>
      </template>
    </nav>
  </aside>
</template>

<script setup>
import { reactive } from 'vue'
import { useRoute } from 'vue-router'
import { RouterLink } from 'vue-router'
import {
  Shield, LayoutDashboard, Users, Clock, Award, FileText,
  Briefcase, Star, ChevronDown, CalendarCheck,
} from 'lucide-vue-next'

defineProps({ open: Boolean })

const route = useRoute()
const openSubmenus = reactive(new Set(['candidates']))

const menuItems = [
  { id: 'dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard, to: '/dashboard' },
  { id: 'probation-end', label: 'พ้นทดลองปฏิบัติราชการ', icon: CalendarCheck, to: '/probation-end' },
  {
    id: 'candidates', label: 'บัญชีรายชื่อผู้มีสิทธิ์', icon: Users,
    children: [
      { id: 'general', label: 'สายงานทั่วไป', to: '/candidates/general' },
      { id: 'academic', label: 'สายงานวิชาการ', to: '/candidates/academic' },
      { id: 'support', label: 'สายงานอำนวยการ', to: '/candidates/support' },
      { id: 'management', label: 'สายงานบริหาร', to: '/candidates/management' },
    ],
  },
  { id: 'time-counting', label: 'นับเวลาราชการ', icon: Clock, to: '/time-counting' },
  { id: 'royal-decorations', label: 'เครื่องราชอิสริยาภรณ์', icon: Award, to: '/royal-decorations' },
  { id: 'retirement-report', label: 'รายงานเกษียณอายุ', icon: FileText, to: '/retirement-report' },
  { id: 'work-management', label: 'มอบหมายงาน', icon: Briefcase, to: '/admin' },
  { id: 'awards', label: 'รางวัล/การยกย่อง', icon: Star, to: '/analytics' },
]

function toggleSubmenu(id) {
  if (openSubmenus.has(id)) {
    openSubmenus.delete(id)
  } else {
    openSubmenus.add(id)
  }
}

function isParentActive(item) {
  return item.children?.some((c) => route.path === c.to)
}
</script>
```

- [ ] **Step 2: Create AppTopbar.vue**

```vue
<template>
  <header class="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6">
    <!-- Left: hamburger + title -->
    <div class="flex items-center gap-3">
      <button @click="$emit('toggle-sidebar')" class="lg:hidden p-2 rounded-lg hover:bg-gray-100">
        <Menu class="w-5 h-5 text-gray-600" />
      </button>
      <h1 class="text-lg font-semibold text-gray-900">{{ pageTitle }}</h1>
    </div>

    <!-- Right: user -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2 text-sm text-gray-600">
        <UserCircle class="w-6 h-6" />
        <span class="hidden sm:inline">{{ auth.user?.name || 'ผู้ใช้' }}</span>
      </div>
      <button @click="handleLogout" class="text-sm text-red-600 hover:text-red-800">
        <LogOut class="w-5 h-5" />
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { Menu, UserCircle, LogOut } from 'lucide-vue-next'

defineEmits(['toggle-sidebar'])

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const pageTitles = {
  '/dashboard': 'แดชบอร์ด',
  '/probation-end': 'พ้นทดลองปฏิบัติราชการ',
  '/candidates': 'บัญชีรายชื่อผู้มีสิทธิ์',
  '/analytics': 'การวิเคราะห์ข้อมูล',
  '/admin': 'การจัดการระบบ',
}

const pageTitle = computed(() => {
  for (const [path, title] of Object.entries(pageTitles)) {
    if (route.path.startsWith(path)) return title
  }
  return 'ระบบสมุดพก'
})

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>
```

- [ ] **Step 3: Create AppLayout.vue**

Wraps all authenticated pages with sidebar + topbar.

```vue
<template>
  <!-- Mobile overlay -->
  <div
    v-if="sidebarOpen"
    class="fixed inset-0 bg-black/50 z-20 lg:hidden"
    @click="sidebarOpen = false"
  />

  <AppSidebar :open="sidebarOpen" />

  <div class="lg:ml-64 transition-all duration-300">
    <AppTopbar @toggle-sidebar="sidebarOpen = !sidebarOpen" />
    <main class="min-h-[calc(100vh-4rem)] bg-gray-50">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'

// Sidebar starts open on desktop, closed on mobile
const sidebarOpen = ref(window.innerWidth >= 1024)

function handleResize() {
  sidebarOpen.value = window.innerWidth >= 1024
}

onMounted(() => window.addEventListener('resize', handleResize))
onUnmounted(() => window.removeEventListener('resize', handleResize))
</script>
```

- [ ] **Step 4: Verify layout renders with sidebar**

Run: `cd frontend && npm run dev`
Login via demo → redirected to `/dashboard`.
Expected: Sidebar on the left with Thai menu items, topbar with user name, main content area shows blank (DashboardPage.vue not yet created).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/layouts/AppLayout.vue frontend/src/components/AppSidebar.vue frontend/src/components/AppTopbar.vue
git commit -m "feat: add app layout with sidebar and topbar navigation"
```

---

## Task 7: Reusable Components (StatCard, StatusBadge)

**Files:**
- Create: `frontend/src/components/StatCard.vue`
- Create: `frontend/src/components/StatusBadge.vue`

### Steps

- [ ] **Step 1: Create StatCard.vue**

Used across Dashboard, CandidateLists, ProbationEnd.

```vue
<template>
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm text-gray-500">{{ label }}</p>
        <p class="text-2xl font-bold mt-1" :class="valueClass">{{ value }}</p>
      </div>
      <div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="iconBgClass">
        <component :is="icon" class="w-5 h-5" :class="iconClass" />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  label: String,
  value: [String, Number],
  icon: Object,
  valueClass: { type: String, default: 'text-gray-900' },
  iconBgClass: { type: String, default: 'bg-primary-50' },
  iconClass: { type: String, default: 'text-primary-500' },
})
</script>
```

- [ ] **Step 2: Create StatusBadge.vue**

```vue
<template>
  <span
    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
    :class="classes"
  >
    {{ label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: String,
})

const statusMap = {
  eligible: { label: 'มีสิทธิ์', class: 'bg-green-100 text-green-800' },
  pending: { label: 'รอดำเนินการ', class: 'bg-yellow-100 text-yellow-800' },
  overdue: { label: 'เกินกำหนด', class: 'bg-red-100 text-red-800' },
  upcoming: { label: 'ใกล้ครบกำหนด', class: 'bg-yellow-100 text-yellow-800' },
  ready: { label: 'พร้อมดำเนินการ', class: 'bg-green-100 text-green-800' },
  active: { label: 'ใช้งานอยู่', class: 'bg-blue-100 text-blue-800' },
}

const label = computed(() => statusMap[props.status]?.label || props.status)
const classes = computed(() => statusMap[props.status]?.class || 'bg-gray-100 text-gray-800')
</script>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StatCard.vue frontend/src/components/StatusBadge.vue
git commit -m "feat: add reusable StatCard and StatusBadge components"
```

---

## Task 8: Dashboard Page

**Files:**
- Create: `frontend/src/pages/DashboardPage.vue`

### Steps

- [ ] **Step 1: Create DashboardPage.vue**

Migrates dashboard content from `AdminDashboard.js`.

```vue
<template>
  <div class="p-6 space-y-6">
    <!-- Stat Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="จำนวนข้าราชการทั้งหมด" value="1,234" :icon="Users" icon-bg-class="bg-blue-50" icon-class="text-blue-500" value-class="text-blue-600" />
      <StatCard label="พ้นทดลองราชการเดือนนี้" value="12" :icon="CalendarCheck" icon-bg-class="bg-green-50" icon-class="text-green-500" value-class="text-green-600" />
      <StatCard label="บัญชีรายชื่อผู้มีสิทธิ์" value="156" :icon="FileText" icon-bg-class="bg-amber-50" icon-class="text-amber-500" value-class="text-amber-600" />
      <StatCard label="เกษียณอายุในปีนี้" value="23" :icon="Clock" icon-bg-class="bg-red-50" icon-class="text-red-500" value-class="text-red-600" />
    </div>

    <!-- Priority Tasks -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
      <div class="px-6 py-4 border-b border-gray-200">
        <h2 class="text-lg font-semibold text-gray-900">งานที่ต้องดำเนินการ</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th class="px-6 py-3 font-medium">รายการ</th>
              <th class="px-6 py-3 font-medium">ประเภท</th>
              <th class="px-6 py-3 font-medium">กำหนดเวลา</th>
              <th class="px-6 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="task in priorityTasks" :key="task.id" class="hover:bg-gray-50">
              <td class="px-6 py-3 text-gray-900">{{ task.title }}</td>
              <td class="px-6 py-3 text-gray-500">{{ task.type }}</td>
              <td class="px-6 py-3 text-gray-500">{{ task.deadline }}</td>
              <td class="px-6 py-3">
                <StatusBadge :status="task.status" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <RouterLink
        v-for="action in quickActions"
        :key="action.to"
        :to="action.to"
        class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-primary-300 hover:shadow transition-all text-center"
      >
        <component :is="action.icon" class="w-8 h-8 mx-auto mb-2" :class="action.iconClass" />
        <p class="text-sm font-medium text-gray-700">{{ action.label }}</p>
      </RouterLink>
    </div>
  </div>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import StatCard from '@/components/StatCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Users, CalendarCheck, FileText, Clock, Award, Briefcase } from 'lucide-vue-next'

const priorityTasks = [
  { id: 1, title: 'ตรวจสอบรายชื่อพ้นทดลองราชการ ประจำเดือน เม.ย.', type: 'พ้นทดลอง', deadline: '31 มี.ค. 2569', status: 'upcoming' },
  { id: 2, title: 'จัดทำบัญชีรายชื่อผู้มีสิทธิ์ สายงานทั่วไป', type: 'บัญชีรายชื่อ', deadline: '15 เม.ย. 2569', status: 'pending' },
  { id: 3, title: 'รายงานข้อมูลเกษียณอายุ ปีงบ 2569', type: 'เกษียณอายุ', deadline: '1 มี.ค. 2569', status: 'overdue' },
  { id: 4, title: 'ตรวจสอบคุณสมบัติเลื่อนระดับ สายวิชาการ', type: 'บัญชีรายชื่อ', deadline: '30 เม.ย. 2569', status: 'eligible' },
]

const quickActions = [
  { label: 'พ้นทดลองราชการ', to: '/probation-end', icon: CalendarCheck, iconClass: 'text-green-500' },
  { label: 'บัญชีรายชื่อผู้มีสิทธิ์', to: '/candidates/general', icon: Users, iconClass: 'text-blue-500' },
  { label: 'รายงานเกษียณอายุ', to: '/retirement-report', icon: Clock, iconClass: 'text-red-500' },
  { label: 'เครื่องราชอิสริยาภรณ์', to: '/royal-decorations', icon: Award, iconClass: 'text-amber-500' },
]
</script>
```

- [ ] **Step 2: Verify full dashboard flow**

Run: `cd frontend && npm run dev`
1. Go to `http://localhost:5174` → redirects to `/login`
2. Click "ข้ามการเข้าสู่ระบบ" → redirects to `/dashboard`
3. Expected: Sidebar + topbar + 4 stat cards + priority tasks table + 4 quick action cards

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DashboardPage.vue
git commit -m "feat: add dashboard page with stats, tasks, and quick actions"
```

---

## Task 9: Candidate Lists Page

**Files:**
- Create: `frontend/src/pages/CandidateListsPage.vue`

### Steps

- [ ] **Step 1: Create CandidateListsPage.vue**

Migrates from `CandidateListsPage.js`. Uses route param `:section` for tab selection.

```vue
<template>
  <div class="p-6 space-y-6">
    <!-- Section Tabs -->
    <div class="flex gap-2 border-b border-gray-200 pb-1">
      <RouterLink
        v-for="s in sections"
        :key="s.id"
        :to="`/candidates/${s.id}`"
        class="px-4 py-2 text-sm rounded-t-lg transition-colors"
        :class="activeSection === s.id
          ? 'bg-primary-50 text-primary-700 font-medium border-b-2 border-primary-500'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'"
      >
        {{ s.label }}
      </RouterLink>
    </div>

    <!-- Stat Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard label="ทั้งหมดในบัญชี" :value="filteredCandidates.length" :icon="Users" />
      <StatCard label="มีสิทธิ์" :value="countByStatus('eligible')" :icon="CheckCircle" icon-bg-class="bg-green-50" icon-class="text-green-500" value-class="text-green-600" />
      <StatCard label="เกินกำหนด" :value="countByStatus('overdue')" :icon="AlertTriangle" icon-bg-class="bg-red-50" icon-class="text-red-500" value-class="text-red-600" />
    </div>

    <!-- Search + Actions -->
    <div class="flex flex-col sm:flex-row gap-3">
      <input
        v-model="search"
        type="text"
        class="input flex-1"
        placeholder="ค้นหาชื่อ-สกุล หรือตำแหน่ง..."
      />
    </div>

    <!-- Table -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-500 text-left">
          <tr>
            <th class="px-6 py-3 font-medium">ลำดับ</th>
            <th class="px-6 py-3 font-medium">ชื่อ-สกุล</th>
            <th class="px-6 py-3 font-medium">ตำแหน่งปัจจุบัน</th>
            <th class="px-6 py-3 font-medium">ระดับ</th>
            <th class="px-6 py-3 font-medium">วันครบกำหนด</th>
            <th class="px-6 py-3 font-medium">วันคงเหลือ</th>
            <th class="px-6 py-3 font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="(c, i) in filteredCandidates" :key="c.id" class="hover:bg-gray-50">
            <td class="px-6 py-3 text-gray-500">{{ i + 1 }}</td>
            <td class="px-6 py-3 text-gray-900 font-medium">{{ c.name }}</td>
            <td class="px-6 py-3 text-gray-600">{{ c.currentPosition }}</td>
            <td class="px-6 py-3 text-gray-600">{{ c.currentLevel }}</td>
            <td class="px-6 py-3 text-gray-500">{{ c.dueDate }}</td>
            <td class="px-6 py-3" :class="c.remainingDays <= 30 ? 'text-red-600 font-medium' : 'text-gray-500'">
              {{ c.remainingDays }} วัน
            </td>
            <td class="px-6 py-3">
              <StatusBadge :status="c.status" />
            </td>
          </tr>
          <tr v-if="filteredCandidates.length === 0">
            <td colspan="7" class="px-6 py-8 text-center text-gray-400">ไม่พบข้อมูล</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import StatCard from '@/components/StatCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Users, CheckCircle, AlertTriangle } from 'lucide-vue-next'

const props = defineProps({
  section: { type: String, default: 'general' },
})

const route = useRoute()
const search = ref('')

const activeSection = computed(() => route.params.section || props.section || 'general')

const sections = [
  { id: 'general', label: 'สายงานทั่วไป' },
  { id: 'academic', label: 'สายงานวิชาการ' },
  { id: 'support', label: 'สายงานอำนวยการ' },
  { id: 'management', label: 'สายงานบริหาร' },
]

// Mock data — will be replaced with API calls
const candidates = ref([
  { id: 1, name: 'นายสมชาย ใจดี', currentPosition: 'นักวิชาการ', currentLevel: 'ชำนาญงาน', dueDate: '15 เม.ย. 2569', remainingDays: 25, status: 'eligible', section: 'general' },
  { id: 2, name: 'นางสาวสมหญิง รักเรียน', currentPosition: 'นักจัดการ', currentLevel: 'ปฏิบัติการ', dueDate: '1 พ.ค. 2569', remainingDays: 41, status: 'pending', section: 'general' },
  { id: 3, name: 'นายประสิทธิ์ ทำงานดี', currentPosition: 'วิศวกร', currentLevel: 'ชำนาญการ', dueDate: '1 มี.ค. 2569', remainingDays: -20, status: 'overdue', section: 'academic' },
  { id: 4, name: 'นางวิลาวัลย์ ศรีสวัสดิ์', currentPosition: 'ผู้อำนวยการ', currentLevel: 'อำนวยการ', dueDate: '20 เม.ย. 2569', remainingDays: 30, status: 'eligible', section: 'support' },
  { id: 5, name: 'นายธีระ มั่นคง', currentPosition: 'ผู้บริหาร', currentLevel: 'บริหาร', dueDate: '10 พ.ค. 2569', remainingDays: 50, status: 'pending', section: 'management' },
])

const filteredCandidates = computed(() => {
  return candidates.value
    .filter((c) => c.section === activeSection.value)
    .filter((c) => {
      if (!search.value) return true
      const q = search.value.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.currentPosition.toLowerCase().includes(q)
    })
})

function countByStatus(status) {
  return filteredCandidates.value.filter((c) => c.status === status).length
}
</script>
```

- [ ] **Step 2: Verify candidate page with section tabs**

Navigate to: `http://localhost:5174/candidates/general`
Expected: Tab navigation (4 sections), stat cards, search box, data table with Thai text. Click "สายงานวิชาการ" tab → URL changes to `/candidates/academic`, table filters accordingly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CandidateListsPage.vue
git commit -m "feat: add candidate lists page with section tabs and search"
```

---

## Task 10: Probation End Page

**Files:**
- Create: `frontend/src/pages/ProbationEndPage.vue`

### Steps

- [ ] **Step 1: Create ProbationEndPage.vue**

Migrates from `ProbationEndPage.js`.

```vue
<template>
  <div class="p-6 space-y-6">
    <!-- Stat Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="ทั้งหมด" :value="employees.length" :icon="Users" />
      <StatCard label="พร้อมดำเนินการ" :value="countByStatus('ready')" :icon="CheckCircle" icon-bg-class="bg-green-50" icon-class="text-green-500" value-class="text-green-600" />
      <StatCard label="ใกล้ครบกำหนด" :value="countByStatus('upcoming')" :icon="Clock" icon-bg-class="bg-yellow-50" icon-class="text-yellow-500" value-class="text-yellow-600" />
      <StatCard label="เกินกำหนด" :value="countByStatus('overdue')" :icon="AlertTriangle" icon-bg-class="bg-red-50" icon-class="text-red-500" value-class="text-red-600" />
    </div>

    <!-- Search -->
    <input
      v-model="search"
      type="text"
      class="input max-w-md"
      placeholder="ค้นหาชื่อ-สกุล, ตำแหน่ง หรือหน่วยงาน..."
    />

    <!-- Table -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-500 text-left">
          <tr>
            <th class="px-6 py-3 font-medium">ลำดับ</th>
            <th class="px-6 py-3 font-medium">ชื่อ-สกุล</th>
            <th class="px-6 py-3 font-medium">ตำแหน่ง</th>
            <th class="px-6 py-3 font-medium">หน่วยงาน</th>
            <th class="px-6 py-3 font-medium">วันเริ่มทดลอง</th>
            <th class="px-6 py-3 font-medium">วันครบกำหนด</th>
            <th class="px-6 py-3 font-medium">วันคงเหลือ</th>
            <th class="px-6 py-3 font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="(e, i) in filtered" :key="e.id" class="hover:bg-gray-50">
            <td class="px-6 py-3 text-gray-500">{{ i + 1 }}</td>
            <td class="px-6 py-3 text-gray-900 font-medium">{{ e.name }}</td>
            <td class="px-6 py-3 text-gray-600">{{ e.position }}</td>
            <td class="px-6 py-3 text-gray-600">{{ e.department }}</td>
            <td class="px-6 py-3 text-gray-500">{{ e.startDate }}</td>
            <td class="px-6 py-3 text-gray-500">{{ e.endDate }}</td>
            <td class="px-6 py-3" :class="e.remainingDays <= 30 ? 'text-red-600 font-medium' : 'text-gray-500'">
              {{ e.remainingDays }} วัน
            </td>
            <td class="px-6 py-3">
              <StatusBadge :status="e.status" />
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="8" class="px-6 py-8 text-center text-gray-400">ไม่พบข้อมูล</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import StatCard from '@/components/StatCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Users, CheckCircle, Clock, AlertTriangle } from 'lucide-vue-next'

const search = ref('')

const employees = ref([
  { id: 1, name: 'นายวีระ สุขสวัสดิ์', position: 'นักวิชาการ', department: 'กองบริหารงานบุคคล', startDate: '1 ต.ค. 2568', endDate: '31 มี.ค. 2569', remainingDays: 10, status: 'upcoming' },
  { id: 2, name: 'นางสาวพิมพ์ชนก แก้วใส', position: 'นักจัดการทั่วไป', department: 'กองคลัง', startDate: '1 พ.ย. 2568', endDate: '30 เม.ย. 2569', remainingDays: 40, status: 'ready' },
  { id: 3, name: 'นายอรรถพล มีศรี', position: 'วิศวกร', department: 'กองช่าง', startDate: '1 ก.ย. 2568', endDate: '28 ก.พ. 2569', remainingDays: -21, status: 'overdue' },
  { id: 4, name: 'นางสาวรัตนา ดวงดี', position: 'นักวิเคราะห์นโยบาย', department: 'กองแผน', startDate: '1 ต.ค. 2568', endDate: '31 มี.ค. 2569', remainingDays: 10, status: 'upcoming' },
  { id: 5, name: 'นายชัยวัฒน์ ทองคำ', position: 'นักทรัพยากรบุคคล', department: 'กองบริหารงานบุคคล', startDate: '1 ธ.ค. 2568', endDate: '31 พ.ค. 2569', remainingDays: 71, status: 'ready' },
])

const filtered = computed(() => {
  if (!search.value) return employees.value
  const q = search.value.toLowerCase()
  return employees.value.filter(
    (e) => e.name.toLowerCase().includes(q) || e.position.toLowerCase().includes(q) || e.department.toLowerCase().includes(q)
  )
})

function countByStatus(status) {
  return employees.value.filter((e) => e.status === status).length
}
</script>
```

- [ ] **Step 2: Verify probation page**

Navigate to: `http://localhost:5174/probation-end`
Expected: 4 stat cards + search + table with 5 employees, status badges colored correctly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ProbationEndPage.vue
git commit -m "feat: add probation end tracking page"
```

---

## Task 11: Migrate CSS + Cleanup Old Files

**Files:**
- Modify: `frontend/src/style.css` (keep as-is, already compatible)
- Delete: `frontend/src/utils/router.js`
- Delete: `frontend/src/utils/eventManager.js`
- Delete: `frontend/src/utils/debug.js`
- Delete: `frontend/src/utils/loginTest.js`
- Delete: `frontend/src/services/apiService.js`
- Delete: `frontend/src/services/authService.js`
- Delete: `frontend/src/components/uiComponents.js`
- Delete: `frontend/src/components/admin/AdminDashboard.js`
- Delete: `frontend/src/pages/loginPage.js`
- Delete: `frontend/src/pages/modernLoginPage.js`
- Delete: `frontend/src/pages/loginPage_temp.js`
- Delete: `frontend/src/pages/CandidateListsPage.js`
- Delete: `frontend/src/pages/ProbationEndPage.js`
- Delete: `frontend/admin.html`
- Delete: `frontend/admin-panel/` (entire directory)
- Delete: `frontend/express-server.js`
- Delete: `frontend/main.js` (root-level duplicate)

### Steps

- [ ] **Step 1: Migrate style.css to Tailwind v4 format**

Tailwind v4 uses `@import "tailwindcss"` (single import) and `@theme` blocks instead of `tailwind.config.js`. Replace the **entire** `frontend/src/style.css` with:

```css
@import "tailwindcss";

/* Theme — migrated from tailwind.config.js */
@theme {
  /* Primary colors (sky/cyan palette) */
  --color-primary-50: #f0f9ff;
  --color-primary-100: #e0f2fe;
  --color-primary-200: #bae6fd;
  --color-primary-300: #7dd3fc;
  --color-primary-400: #38bdf8;
  --color-primary-500: #0ea5e9;
  --color-primary-600: #0284c7;
  --color-primary-700: #0369a1;
  --color-primary-800: #075985;
  --color-primary-900: #0c4a6e;
  --color-primary-950: #082f49;

  /* Government colors (slate palette) */
  --color-government-50: #f8fafc;
  --color-government-100: #f1f5f9;
  --color-government-200: #e2e8f0;
  --color-government-300: #cbd5e1;
  --color-government-400: #94a3b8;
  --color-government-500: #64748b;
  --color-government-600: #475569;
  --color-government-700: #334155;
  --color-government-800: #1e293b;
  --color-government-900: #0f172a;

  /* Fonts */
  --font-thai: 'Noto Sans Thai', system-ui, sans-serif;

  /* Custom spacing */
  --spacing-18: 4.5rem;
  --spacing-88: 22rem;

  /* Animations */
  --animate-fade-in: fade-in 0.5s ease-in-out;
  --animate-slide-up: slide-up 0.3s ease-out;
  --animate-bounce-subtle: bounce-subtle 1s ease-in-out infinite;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes bounce-subtle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

:root {
  --ring: #3b82f6;
  --border: #e5e7eb;
}

.semi-dark {
  --background: #1f2937;
  --foreground: #e5e7eb;
  --accent-color: #3b82f6;
  --border: #4b5563;
  --ring: #3b82f6;
}

.light {
  --background: #ffffff;
  --foreground: #000000;
  --accent-color: #3b82f6;
  --border: #e5e7eb;
  --ring: #3b82f6;
}

body {
  background-color: var(--background);
  color: var(--foreground);
}

/* Custom Base Styles */
@layer base {
  body {
    font-feature-settings: "rlig" 1, "calt" 1;
  }
  html {
    scroll-behavior: smooth;
  }
}

/* Custom Components */
@layer components {
  .btn {
    @apply inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none;
  }
  .btn-primary {
    @apply btn bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700;
  }
  .btn-secondary {
    @apply btn bg-government-200 text-government-800 hover:bg-government-300;
  }
  .btn-outline {
    @apply btn border border-primary-300 text-primary-600 hover:bg-primary-50;
  }
  .btn-ghost {
    @apply btn hover:bg-gray-100 text-gray-700;
  }
  .card {
    @apply bg-white rounded-lg shadow-sm border border-gray-200 p-6;
  }
  .card-header {
    @apply border-b border-gray-200 pb-4 mb-4;
  }
  .input {
    @apply w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500;
  }
  .input-error {
    @apply border-red-300 focus:ring-red-500 focus:border-red-500;
  }
  .label {
    @apply block text-sm font-medium text-gray-700 mb-1;
  }
  .sidebar {
    @apply w-64 bg-white shadow-sm border-r border-gray-200 h-screen fixed left-0 top-0 z-30 transform transition-transform duration-300;
  }
  .sidebar-hidden {
    @apply -translate-x-full;
  }
}

/* Utilities */
@layer utilities {
  .glass-effect {
    @apply bg-white/70 backdrop-blur-md border border-white/20;
  }
}

/* Custom Scrollbar */
::-webkit-scrollbar { width: 0.5rem; }
::-webkit-scrollbar-track { background: #f3f4f6; }
::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; }
::-webkit-scrollbar-thumb:hover { background: #9ca3af; }

/* Print */
@media print {
  .no-print { display: none !important; }
  body { background: white; color: black; }
}
```

Also delete the now-unused config files:
```bash
rm -f frontend/tailwind.config.js frontend/postcss.config.cjs
```

- [ ] **Step 2: Remove old vanilla JS files**

```bash
cd frontend
# Old vanilla JS source files
rm -f src/utils/router.js src/utils/eventManager.js src/utils/debug.js src/utils/loginTest.js
rm -f src/services/apiService.js src/services/authService.js
rm -f src/components/uiComponents.js src/components/admin/AdminDashboard.js src/components/Sidebar.js.backup
rm -f src/pages/loginPage.js src/pages/modernLoginPage.js src/pages/loginPage_temp.js
rm -f src/pages/CandidateListsPage.js src/pages/ProbationEndPage.js
# Old entry points and config
rm -f admin.html express-server.js main.js
rm -f tailwind.config.js postcss.config.cjs
rm -rf admin-panel/ src/admin/ src/shared/
```

- [ ] **Step 3: Verify app still works after cleanup**

Run: `cd frontend && npm run dev`
Full flow: login → dashboard → candidates → probation-end → logout.
Expected: Everything works, no 404 errors for old JS files.

- [ ] **Step 4: Verify production build**

Run: `cd frontend && npm run build`
Expected: Build succeeds, `dist/` directory created with no errors.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add -A
git commit -m "chore: remove old vanilla JS files, migrate to Tailwind v4 import"
```

---

## Task 12: Update Docker + Nginx Config

**Files:**
- Modify: `frontend/Dockerfile`
- Modify: `frontend/nginx.conf` (API proxy path may need update)

### Steps

- [ ] **Step 1: Read current frontend Dockerfile**

Read `frontend/Dockerfile` to understand the current build.

- [ ] **Step 2: Update Dockerfile if needed**

The existing multi-stage build (Node → Nginx) should work as-is since we're still using Vite. Verify the build stage runs `npm run build` and copies `dist/` to Nginx. If the Dockerfile references any deleted files, update accordingly.

- [ ] **Step 3: Verify Docker build**

```bash
cd frontend && docker build -t smartport-frontend-test .
```

Expected: Image builds successfully.

- [ ] **Step 4: Verify full stack with docker-compose**

```bash
docker-compose up --build
```

Expected: Frontend accessible at `http://localhost:8081`, backend at `http://localhost:8000`, full login flow works.

- [ ] **Step 5: Commit any Docker changes**

```bash
git add frontend/Dockerfile frontend/nginx.conf
git commit -m "chore: update Docker config for Vue 3 build"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Scaffold Vue 3 + Vite 6 | package.json, vite.config.js, index.html, main.js, App.vue |
| 2 | API composable + Pinia stores | useApi.js, auth.js, ui.js |
| 3 | Vue Router + auth guard | router/index.js, PlaceholderPage.vue |
| 4 | Toast component | ToastContainer.vue |
| 5 | Login page | LoginPage.vue |
| 6 | App layout (sidebar + topbar) | AppLayout.vue, AppSidebar.vue, AppTopbar.vue |
| 7 | Reusable components | StatCard.vue, StatusBadge.vue |
| 8 | Dashboard page | DashboardPage.vue |
| 9 | Candidate lists page | CandidateListsPage.vue |
| 10 | Probation end page | ProbationEndPage.vue |
| 11 | CSS migration + cleanup | style.css, delete old .js files |
| 12 | Docker + nginx verification | Dockerfile, nginx.conf |
