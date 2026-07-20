import { mount } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const logout = vi.fn()
const push = vi.fn()

let userVal = null
let isAdminVal = false

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({
    get user() { return userVal },
    get isAdmin() { return isAdminVal },
    logout,
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: currentPath }),
  useRouter: () => ({ push }),
}))

let currentPath = '/dashboard'

const AppTopbar = (await import('@/components/AppTopbar.vue')).default

function mountTopbar() {
  return mount(AppTopbar, { attachTo: document.body })
}

describe('AppTopbar', () => {
  beforeEach(() => {
    logout.mockReset()
    push.mockReset()
    userVal = { name: 'สมชาย', email: 'somchai@example.go.th' }
    isAdminVal = false
    currentPath = '/dashboard'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the current page title from route path', () => {
    currentPath = '/users'
    const wrapper = mountTopbar()
    expect(wrapper.text()).toContain('จัดการผู้ใช้')
  })

  it('falls back to Dashboard title for unknown routes', () => {
    currentPath = '/unknown/route'
    const wrapper = mountTopbar()
    expect(wrapper.text()).toContain('Dashboard')
  })

  it('matches the longest path prefix (e.g. /candidates/overview -> Candidate Lists)', () => {
    currentPath = '/candidates/overview'
    const wrapper = mountTopbar()
    expect(wrapper.text()).toContain('Candidate Lists')
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

  it('navigates to /change-password when ตั้งค่า clicked', async () => {
    const wrapper = mountTopbar()
    await wrapper.get('button[aria-label="เมนูผู้ใช้"]').trigger('click')
    const settingsBtn = wrapper.findAll('button').find((b) => b.text().includes('ตั้งค่า'))
    await settingsBtn.trigger('click')

    expect(push).toHaveBeenCalledWith('/change-password')
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

    expect(logout).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/login')
    expect(wrapper.vm.dropdownOpen).toBe(false)
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