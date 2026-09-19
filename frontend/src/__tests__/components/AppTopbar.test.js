import { mount } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const logout = vi.fn()
const push = vi.fn()
const confirmLogoutMock = vi.fn(async () => true)

let userVal = null
let isAdminVal = false

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({
    get user() { return userVal },
    get isAdmin() { return isAdminVal },
    logout,
  }),
}))

vi.mock('@/composables/useConfirm.js', () => ({
  confirmLogout: (...args) => confirmLogoutMock(...args),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: currentPath, name: currentName, params: currentParams, meta: currentMeta }),
  useRouter: () => ({ push }),
  RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
}))

let currentPath = '/dashboard'
let currentName = 'dashboard'
let currentParams = {}
let currentMeta = { title: 'Dashboard', breadcrumb: ['Dashboard'] }

function setRoute({ path, name, params = {}, meta = {} }) {
  currentPath = path
  currentName = name
  currentParams = params
  currentMeta = meta
}

const AppTopbar = (await import('@/components/AppTopbar.vue')).default

function mountTopbar() {
  return mount(AppTopbar, { attachTo: document.body })
}

describe('AppTopbar', () => {
  beforeEach(() => {
    logout.mockReset()
    push.mockReset()
    confirmLogoutMock.mockReset()
    confirmLogoutMock.mockResolvedValue(true)
    userVal = { name: 'สมชาย', email: 'somchai@example.go.th' }
    isAdminVal = false
    setRoute({ path: '/dashboard', name: 'dashboard', meta: { title: 'Dashboard', breadcrumb: ['Dashboard'] } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the current page title from route meta', () => {
    setRoute({ path: '/users', name: 'users', meta: { title: 'จัดการผู้ใช้', breadcrumb: ['จัดการผู้ใช้'] } })
    const wrapper = mountTopbar()
    expect(wrapper.text()).toContain('จัดการผู้ใช้')
    expect(wrapper.findAll('nav[aria-label="Breadcrumb"] span[aria-hidden="true"]')).toHaveLength(1)
  })

  it('renders every former fallback page from its own meta (no Dashboard leak)', () => {
    const cases = [
      { path: '/personnel', name: 'personnel', meta: { title: 'ข้อมูลบุคลากร', breadcrumb: ['ข้อมูลบุคลากร'] } },
      { path: '/audit', name: 'audit', meta: { title: 'ประวัติการเปลี่ยนแปลง', breadcrumb: ['ประวัติการเปลี่ยนแปลง'] } },
      { path: '/import', name: 'import', meta: { title: 'นำเข้าข้อมูลบุคลากร', breadcrumb: ['นำเข้าข้อมูลบุคลากร'] } },
      { path: '/ocr', name: 'ocr', meta: { title: 'แปลงเอกสาร PDF', breadcrumb: ['แปลงเอกสาร PDF'] } },
      { path: '/time-multiplier', name: 'time-multiplier', meta: { title: 'การนับทวีคูณ', breadcrumb: ['การนับทวีคูณ'] } },
      { path: '/profile/42', name: 'profile', params: { id: '42' }, meta: { title: 'โปรไฟล์ข้าราชการ', breadcrumb: ['โปรไฟล์ข้าราชการ'] } },
    ]
    for (const c of cases) {
      setRoute(c)
      const wrapper = mountTopbar()
      expect(wrapper.text()).toContain(c.meta.title)
      expect(wrapper.text()).not.toContain('Dashboard')
      wrapper.unmount()
    }
  })

  it('shows locked การจัดการงาน title for /admin', () => {
    setRoute({ path: '/admin', name: 'admin', meta: { title: 'การจัดการงาน', breadcrumb: ['การจัดการงาน'] } })
    const wrapper = mountTopbar()
    expect(wrapper.text()).toContain('การจัดการงาน')
  })

  it('renders two-level trail for special-areas', () => {
    setRoute({ path: '/settings/special-areas', name: 'settings-special-areas', meta: { title: 'จัดการพื้นที่พิเศษ', breadcrumb: ['การนับทวีคูณ', 'จัดการพื้นที่พิเศษ'] } })
    const wrapper = mountTopbar()
    expect(wrapper.text()).toContain('การนับทวีคูณ')
    expect(wrapper.text()).toContain('จัดการพื้นที่พิเศษ')
    expect(wrapper.findAll('nav[aria-label="Breadcrumb"] span[aria-hidden="true"]')).toHaveLength(2)
  })

  it('renders Home link back to /dashboard', () => {
    const wrapper = mountTopbar()
    const home = wrapper.find('a[aria-label="กลับหน้า Dashboard"]')
    expect(home.exists()).toBe(true)
    expect(home.attributes('href')).toBe('/dashboard')
  })

  it('expands candidates trail with dynamic section label', () => {
    setRoute({ path: '/candidates/overview', name: 'candidates', params: { section: 'overview' }, meta: { title: 'Candidate Lists', breadcrumb: ['Candidate Lists'] } })
    const wrapper = mountTopbar()
    expect(wrapper.text()).toContain('Candidate Lists')
    expect(wrapper.text()).toContain('ภาพรวม')
  })

  it('shows user name initial and full name', () => {
    const wrapper = mountTopbar()
    expect(wrapper.text()).toContain('สมชาย')
  })

  it('shows fallback "A" initial and "ผู้ใช้" when user is null', () => {
    userVal = null
    const wrapper = mountTopbar()
    expect(wrapper.text()).toContain('A')
    expect(wrapper.text()).toContain('ผู้ใช้')
  })

  it('toggles dropdown open and closed on avatar button click', async () => {
    const wrapper = mountTopbar()
    expect(wrapper.vm.dropdownOpen).toBe(false)

    await wrapper.get('button[aria-label="เมนูผู้ใช้"]').trigger('click')
    expect(wrapper.vm.dropdownOpen).toBe(true)

    await wrapper.get('button[aria-label="เมนูผู้ใช้"]').trigger('click')
    expect(wrapper.vm.dropdownOpen).toBe(false)
  })

  it('navigates to /profile and closes dropdown when โปรไฟล์ clicked', async () => {
    const wrapper = mountTopbar()
    await wrapper.get('button[aria-label="เมนูผู้ใช้"]').trigger('click')
    const profileBtn = wrapper.findAll('button').find((b) => b.text().includes('โปรไฟล์'))
    await profileBtn.trigger('click')

    expect(push).toHaveBeenCalledWith('/profile')
    expect(wrapper.vm.dropdownOpen).toBe(false)
  })

  it('navigates to /settings/account when ตั้งค่า clicked', async () => {
    const wrapper = mountTopbar()
    await wrapper.get('button[aria-label="เมนูผู้ใช้"]').trigger('click')
    const settingsBtn = wrapper.findAll('button').find((b) => b.text().includes('ตั้งค่า'))
    await settingsBtn.trigger('click')

    expect(push).toHaveBeenCalledWith('/settings/account')
  })

  it('shows ผู้ดูแล menu item only for admin', async () => {
    // operator: no ผู้ดูแล button
    isAdminVal = false
    let wrapper = mountTopbar()
    await wrapper.get('button[aria-label="เมนูผู้ใช้"]').trigger('click')
    let adminBtn = wrapper.findAll('button').find((b) => b.text().includes('ผู้ดูแล'))
    expect(adminBtn).toBeUndefined()

    wrapper.unmount()

    // admin: ผู้ดูแล button present and navigates to /users
    isAdminVal = true
    wrapper = mountTopbar()
    await wrapper.get('button[aria-label="เมนูผู้ใช้"]').trigger('click')
    adminBtn = wrapper.findAll('button').find((b) => b.text().includes('ผู้ดูแล'))
    expect(adminBtn).toBeTruthy()
    await adminBtn.trigger('click')
    expect(push).toHaveBeenCalledWith('/users')

    wrapper.unmount()
  })

  it('logs out and redirects to /login when ออกจากระบบ clicked', async () => {
    const wrapper = mountTopbar()
    await wrapper.get('button[aria-label="เมนูผู้ใช้"]').trigger('click')
    const logoutBtn = wrapper.findAll('button').find((b) => b.text().includes('ออกจากระบบ'))
    await logoutBtn.trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    expect(confirmLogoutMock).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/login')
    expect(wrapper.vm.dropdownOpen).toBe(false)
  })

  it('does not logout when confirm is cancelled', async () => {
    confirmLogoutMock.mockResolvedValueOnce(false)
    const wrapper = mountTopbar()
    await wrapper.get('button[aria-label="เมนูผู้ใช้"]').trigger('click')
    const logoutBtn = wrapper.findAll('button').find((b) => b.text().includes('ออกจากระบบ'))
    await logoutBtn.trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    expect(confirmLogoutMock).toHaveBeenCalledTimes(1)
    expect(logout).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('emits toggle-sidebar when hamburger button clicked', async () => {
    const wrapper = mountTopbar()
    await wrapper.get('button[aria-label="เปิด/ปิดเมนู"]').trigger('click')
    expect(wrapper.emitted('toggle-sidebar')).toBeTruthy()
    expect(wrapper.emitted('toggle-sidebar').length).toBe(1)
  })

  it('closes dropdown when clicking outside the dropdown container', async () => {
    const wrapper = mountTopbar()
    await wrapper.get('button[aria-label="เมนูผู้ใช้"]').trigger('click')
    expect(wrapper.vm.dropdownOpen).toBe(true)

    // simulate a click outside the dropdown container
    const outsideEvent = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(outsideEvent, 'target', { value: document.body })
    document.dispatchEvent(outsideEvent)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.dropdownOpen).toBe(false)
    wrapper.unmount()
  })

  it('marks the last breadcrumb crumb with aria-current="page"', () => {
    setRoute({ path: '/settings/special-areas', name: 'settings-special-areas', meta: { title: 'จัดการพื้นที่พิเศษ', breadcrumb: ['การนับทวีคูณ', 'จัดการพื้นที่พิเศษ'] } })
    const wrapper = mountTopbar()
    const current = wrapper.find('[aria-current="page"]')
    expect(current.exists()).toBe(true)
    expect(current.text()).toContain('จัดการพื้นที่พิเศษ')
    wrapper.unmount()
  })

  it('hides the separator when trail is empty (no dangling slash)', () => {
    setRoute({ path: '/login', name: 'login', meta: {} })
    const wrapper = mountTopbar()
    expect(wrapper.findAll('nav[aria-label="Breadcrumb"] span[aria-hidden="true"]')).toHaveLength(0)
    wrapper.unmount()
  })

  it('keeps dropdown open when clicking inside the dropdown container', async () => {
    const wrapper = mountTopbar()
    await wrapper.get('button[aria-label="เมนูผู้ใช้"]').trigger('click')
    expect(wrapper.vm.dropdownOpen).toBe(true)

    // click on the dropdown user-info header (inside the dropdown container)
    const userInfo = wrapper.find('.px-4.py-3.border-b')
    const insideEvent = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(insideEvent, 'target', { value: userInfo.element })
    document.dispatchEvent(insideEvent)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.dropdownOpen).toBe(true)
    wrapper.unmount()
  })
})
