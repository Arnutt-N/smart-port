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
        path: 'candidates',
        redirect: '/candidates/overview',
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
        path: 'users',
        name: 'users',
        component: () => import('@/pages/UserManagementPage.vue'),
        meta: { requiresAdmin: true },
      },
      {
        path: 'audit',
        name: 'audit',
        component: () => import('@/pages/AuditLogPage.vue'),
        meta: { requiresAdmin: true },
      },
      {
        path: 'import',
        name: 'import',
        component: () => import('@/pages/ImportPage.vue'),
        meta: { requiresAdmin: true },
      },
      {
        path: 'time-counting',
        name: 'time-counting',
        component: () => import('@/pages/SupportivePage.vue'),
      },
      {
        path: 'time-multiplier',
        name: 'time-multiplier',
        component: () => import('@/pages/MultiplierPage.vue'),
      },
      {
        path: 'time-multiplier/areas',
        name: 'time-multiplier-areas',
        component: () => import('@/pages/MultiplierAreasPage.vue'),
        meta: { requiresAdmin: true },
      },
      {
        path: 'time-difference',
        name: 'time-difference',
        component: () => import('@/pages/DiversePage.vue'),
      },
      {
        path: 'position-compare',
        name: 'position-compare',
        component: () => import('@/pages/EquivalencePage.vue'),
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

  // หน้า admin only — operator เด้งกลับ dashboard
  if (to.meta.requiresAdmin && auth.user?.role !== 'admin') {
    return '/dashboard'
  }
})

export default router
