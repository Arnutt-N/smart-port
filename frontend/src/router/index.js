import { createRouter, createWebHistory } from 'vue-router'
import { isChunkLoadError, resolveChunkRecoveryTarget } from '@/utils/chunkGuard.js'
import { useNavProgress } from '@/composables/useNavProgress.js'

const blankDebugEnabled = (
  sessionStorage.getItem('blankDebugSession') === '4975e3'
  || new URLSearchParams(window.location.search).get('blankDebug') === '4975e3'
)

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/change-password',
    name: 'change-password',
    component: () => import('@/pages/ChangePasswordPage.vue'),
    meta: { requiresAuth: true },
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
        path: 'profile',
        name: 'my-profile',
        component: () => import('@/pages/ProfilePage.vue'),
      },
      {
        path: 'profile/:id',
        name: 'profile',
        component: () => import('@/pages/ProfilePage.vue'),
      },
      {
        path: 'work-results',
        name: 'work-results',
        component: () => import('@/pages/WorkResultsPage.vue'),
      },
      {
        path: 'awards',
        name: 'awards',
        component: () => import('@/pages/AwardsPage.vue'),
      },
      {
        path: 'analytics',
        name: 'analytics',
        component: () => import('@/pages/AnalyticsPage.vue'),
      },
      {
        path: 'admin',
        name: 'admin',
        component: () => import('@/pages/AdminPage.vue'),
        meta: { requiresAdmin: true },
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
        path: 'ocr',
        name: 'ocr',
        component: () => import('@/pages/OcrPage.vue'),
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
        // path เดิมก่อนย้ายเข้าเมนูแอดมิน — คง redirect ไว้กัน bookmark เก่าพัง
        path: 'time-multiplier/areas',
        redirect: '/settings/special-areas',
      },
      {
        path: 'settings/special-areas',
        name: 'settings-special-areas',
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
        component: () => import('@/pages/RoyalDecorationsPage.vue'),
      },
      {
        path: 'retirement-report',
        name: 'retirement-report',
        component: () => import('@/pages/RetirementReportPage.vue'),
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

const { isNavigating } = useNavProgress()

router.beforeEach(async (to) => {
  isNavigating.value = true

  // #region agent log
  if (blankDebugEnabled) fetch('http://127.0.0.1:7593/ingest/2c3dac7b-bfe2-4e17-bf18-ee2af8b3d131',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4975e3'},body:JSON.stringify({sessionId:'4975e3',runId:'blank-v3',hypothesisId:'K',location:'router/index.js:beforeEach',message:'navigation guard entered',data:{toPath:to.path,matchedNames:to.matched.map((record)=>String(record.name??record.path)),requiresAuth:to.meta.requiresAuth!==false,requiresAdmin:!!to.meta.requiresAdmin},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const { useAuthStore } = await import('@/stores/auth.js')
  const auth = useAuthStore()

  if (to.meta.requiresAuth !== false && !auth.isAuthenticated) {
    return '/login'
  }

  if (auth.isAuthenticated && auth.mustChangePassword && to.path !== '/change-password') {
    return '/change-password'
  }

  if (to.path === '/change-password' && auth.isAuthenticated && !auth.mustChangePassword) {
    return '/dashboard'
  }

  if (to.path === '/login' && auth.isAuthenticated) {
    return '/dashboard'
  }

  // หน้า admin only — operator เด้งกลับ dashboard
  if (to.meta.requiresAdmin && auth.user?.role !== 'admin') {
    return '/dashboard'
  }
})

router.afterEach((to, from, failure) => {
  isNavigating.value = false

  // #region agent log
  if (blankDebugEnabled) fetch('http://127.0.0.1:7593/ingest/2c3dac7b-bfe2-4e17-bf18-ee2af8b3d131',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4975e3'},body:JSON.stringify({sessionId:'4975e3',runId:'blank-v3',hypothesisId:'K',location:'router/index.js:afterEach',message:'navigation completed',data:{toPath:to.path,fromPath:from.path,failureType:failure?.type??null,failureMessage:failure?String(failure.message).slice(0,300):null,matchedNames:to.matched.map((record)=>String(record.name??record.path))},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
})

// chunk เก่าหายหลัง deploy ใหม่ → dynamic import พังและ navigation ถูกยกเลิกเงียบๆ
// (อาการ: กดเมนูแล้วคอนเทนต์ค้าง/ไม่เปลี่ยน) — hard reload เพื่อดึง asset ชุดใหม่
// export เพื่อทดสอบโดย inject assign (jsdom ห้าม spy window.location.assign)
export function onRouterError(
  error,
  to,
  {
    assign = (url) => window.location.assign(url),
    getPathname = () => window.location.pathname,
    now = Date.now(),
    storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
    fallbackPath = '/dashboard',
  } = {},
) {
  isNavigating.value = false
  const target = to?.fullPath ?? getPathname()

  // #region agent log
  if (blankDebugEnabled) fetch('http://127.0.0.1:7593/ingest/2c3dac7b-bfe2-4e17-bf18-ee2af8b3d131',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4975e3'},body:JSON.stringify({sessionId:'4975e3',runId:'blank-v3',hypothesisId:isChunkLoadError(error)?'K':'J',location:'router/index.js:onRouterError',message:'router error',data:{target,chunk:isChunkLoadError(error),errorName:error?.name??null,errorMessage:String(error?.message??error).slice(0,500)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  if (isChunkLoadError(error)) {
    const recovery = resolveChunkRecoveryTarget(target, storage, now, fallbackPath)
    if (recovery.url) {
      assign(recovery.url)
    }
  }
}

router.onError((error, to) => onRouterError(error, to))

export default router
