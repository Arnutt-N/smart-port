import { createRouter, createWebHistory } from 'vue-router'
import { isChunkLoadError, resolveChunkRecoveryTarget } from '@/utils/chunkGuard.js'
import { useNavProgress } from '@/composables/useNavProgress.js'

// section ที่ CandidateListsPage รู้จัก (ตรงกับ categoryConfig ในหน้า) — ค่าอื่น redirect
// ไป overview กัน bookmark/URL ผิดแล้วเข้าหน้าเปล่า
export const KNOWN_CANDIDATE_SECTIONS = ['overview', 'general', 'academic', 'support', 'management']

// re-export เพื่อ compat — single source จริงอยู่ที่ @/utils/breadcrumb.js
// (แยกไฟล์เพื่อตัด circular import: Topbar → breadcrumb → router)
export { CANDIDATE_SECTION_LABELS } from '@/utils/breadcrumb.js'

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
        meta: { title: 'Dashboard', breadcrumb: ['Dashboard'] },
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
        // trail ต่อท้ายด้วยชื่อ section แบบ dynamic — Topbar เติมให้จาก CANDIDATE_SECTION_LABELS
        meta: { title: 'Candidate Lists', breadcrumb: ['Candidate Lists'] },
      },
      {
        path: 'probation-end',
        name: 'probation-end',
        component: () => import('@/pages/ProbationEndPage.vue'),
        meta: { title: 'พ้นทดลองปฏิบัติราชการ', breadcrumb: ['พ้นทดลองปฏิบัติราชการ'] },
      },
      {
        path: 'personnel',
        name: 'personnel',
        component: () => import('@/pages/PersonnelPage.vue'),
        meta: { title: 'ข้อมูลบุคลากร', breadcrumb: ['ข้อมูลบุคลากร'] },
      },
      {
        path: 'profile',
        name: 'my-profile',
        component: () => import('@/pages/ProfilePage.vue'),
        meta: { title: 'โปรไฟล์ของฉัน', breadcrumb: ['โปรไฟล์ของฉัน'] },
      },
      {
        path: 'profile/:id',
        name: 'profile',
        component: () => import('@/pages/ProfilePage.vue'),
        meta: { title: 'โปรไฟล์ข้าราชการ', breadcrumb: ['โปรไฟล์ข้าราชการ'] },
      },
      {
        path: 'work-results',
        name: 'work-results',
        component: () => import('@/pages/WorkResultsPage.vue'),
        meta: { title: 'ผลงานและข้อเสนอ', breadcrumb: ['ผลงานและข้อเสนอ'] },
      },
      {
        path: 'awards',
        name: 'awards',
        component: () => import('@/pages/AwardsPage.vue'),
        meta: { title: 'รางวัล/ความดีความชอบ', breadcrumb: ['รางวัล/ความดีความชอบ'] },
      },
      {
        path: 'analytics',
        name: 'analytics',
        component: () => import('@/pages/AnalyticsPage.vue'),
        meta: { title: 'การวิเคราะห์ข้อมูล', breadcrumb: ['การวิเคราะห์ข้อมูล'] },
      },
      {
        path: 'admin',
        name: 'admin',
        component: () => import('@/pages/AdminPage.vue'),
        meta: { requiresAdmin: true, title: 'การจัดการงาน', breadcrumb: ['การจัดการงาน'] },
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/pages/UserManagementPage.vue'),
        meta: { requiresAdmin: true, title: 'จัดการผู้ใช้', breadcrumb: ['จัดการผู้ใช้'] },
      },
      {
        path: 'audit',
        name: 'audit',
        component: () => import('@/pages/AuditLogPage.vue'),
        meta: { requiresAdmin: true, title: 'ประวัติการเปลี่ยนแปลง', breadcrumb: ['ประวัติการเปลี่ยนแปลง'] },
      },
      {
        path: 'import',
        name: 'import',
        component: () => import('@/pages/ImportPage.vue'),
        meta: { requiresAdmin: true, title: 'นำเข้าข้อมูลบุคลากร', breadcrumb: ['นำเข้าข้อมูลบุคลากร'] },
      },
      {
        path: 'ocr',
        name: 'ocr',
        component: () => import('@/pages/OcrPage.vue'),
        meta: { requiresAdmin: true, title: 'แปลงเอกสาร PDF', breadcrumb: ['แปลงเอกสาร PDF'] },
      },
      {
        path: 'time-counting',
        name: 'time-counting',
        component: () => import('@/pages/SupportivePage.vue'),
        meta: { title: 'การนับเกื้อกูล', breadcrumb: ['การนับเกื้อกูล'] },
      },
      {
        path: 'time-multiplier',
        name: 'time-multiplier',
        component: () => import('@/pages/MultiplierPage.vue'),
        meta: { title: 'การนับทวีคูณ', breadcrumb: ['การนับทวีคูณ'] },
      },
      {
        path: 'settings/account',
        name: 'settings-account',
        component: () => import('@/pages/SettingsPage.vue'),
        meta: { title: 'ตั้งค่า', breadcrumb: ['ตั้งค่า'] },
      },
      {
        path: 'settings/permissions',
        name: 'settings-permissions',
        component: () => import('@/pages/SettingsPage.vue'),
        meta: { requiresSuperAdmin: true, title: 'สิทธิ์ระบบ', breadcrumb: ['สิทธิ์ระบบ'] },
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
        meta: { requiresAdmin: true, title: 'จัดการพื้นที่พิเศษ', breadcrumb: ['การนับทวีคูณ', 'จัดการพื้นที่พิเศษ'] },
      },
      {
        path: 'time-difference',
        name: 'time-difference',
        component: () => import('@/pages/DiversePage.vue'),
        meta: { title: 'การนับแตกต่าง', breadcrumb: ['การนับแตกต่าง'] },
      },
      {
        path: 'position-compare',
        name: 'position-compare',
        component: () => import('@/pages/EquivalencePage.vue'),
        meta: { title: 'การเทียบตำแหน่ง', breadcrumb: ['การเทียบตำแหน่ง'] },
      },
      {
        path: 'royal-decorations',
        name: 'royal-decorations',
        component: () => import('@/pages/RoyalDecorationsPage.vue'),
        meta: { title: 'เครื่องราชอิสริยาภรณ์', breadcrumb: ['เครื่องราชอิสริยาภรณ์'] },
      },
      {
        path: 'retirement-report',
        name: 'retirement-report',
        component: () => import('@/pages/RetirementReportPage.vue'),
        meta: { title: 'รายงานผู้เกษียณ', breadcrumb: ['รายงานผู้เกษียณ'] },
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

  const { useAuthStore } = await import('@/stores/auth.js')
  const auth = useAuthStore()

  if (to.meta.requiresAuth !== false && !auth.isAuthenticated) {
    return '/login'
  }

  // N4: โหลด effective grants ของ role ตัวเองครั้งเดียวต่อ session (grants=null หลัง
  // login/refresh เสมอ) — ล้มเงียบได้เพราะ can() fallback เทียบ role ตาม intents เดิม
  if (auth.isAuthenticated && !auth.permissionGrants && !auth.isSuperAdmin) {
    // F2: หน้า admin-gated ต้องรอ grants ก่อนตัดสินใจ — ไม่งั้น nav แรกหลัง login
    // ใช้ stale role fallback (admin ที่ถูก override ปิด delete จะหลุดเข้าไปได้)
    if (to.meta.requiresAdmin || to.meta.requiresSuperAdmin) {
      try {
        await auth.fetchPermissionGrants()
      } catch {
        // ล้มเงียบเหมือนเดิม — fallback role ตัดสินแทน
      }
    } else {
      auth.fetchPermissionGrants().catch(() => {})
    }
  }

  if (auth.isAuthenticated && auth.mustChangePassword && to.path !== '/change-password') {
    return '/change-password'
  }

  if (to.path === '/change-password' && auth.isAuthenticated && !auth.mustChangePassword) {
    return '/settings/account'
  }

  if (to.path === '/login' && auth.isAuthenticated) {
    return '/dashboard'
  }

  // section ไม่รู้จักหรือว่าง → กลับ /candidates/overview — เช็คใน global guard เพราะ
  // beforeEnter ของ route record ไม่ทำงานตอนสลับ params ภายใน record เดิม
  // กรณีว่าง: redirect record 'candidates → /candidates/overview' โดน optional
  // param 'candidates/:section?' บัง (Vue Router 4 จัดแบบ score) — resolve('/candidates')
  // ตกที่ :section? พร้อม section='' หน้า overview จะไม่ยิง fetch และโล่ง
  if (
    to.name === 'candidates' &&
    !KNOWN_CANDIDATE_SECTIONS.includes(String(to.params.section ?? ''))
  ) {
    return { path: '/candidates/overview' }
  }

  // หน้า admin only — operator/viewer เด้งกลับ dashboard (superadmin ผ่านได้)
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return '/dashboard'
  }

  if (to.meta.requiresSuperAdmin && !auth.isSuperAdmin) {
    return '/dashboard'
  }
})

router.afterEach(() => {
  isNavigating.value = false
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

  if (isChunkLoadError(error)) {
    const recovery = resolveChunkRecoveryTarget(target, storage, now, fallbackPath)
    if (recovery.url) {
      assign(recovery.url)
    }
  }
}

router.onError((error, to) => onRouterError(error, to))

export default router
