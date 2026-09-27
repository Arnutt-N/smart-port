import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const changePassword = vi.fn()
const logout = vi.fn()
const push = vi.fn()
const showToast = vi.fn()
const confirmLogoutMock = vi.fn(async () => true)

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({ changePassword, logout }),
}))

vi.mock('@/stores/ui.js', () => ({
  useUiStore: () => ({ showToast }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/composables/useConfirm.js', () => ({
  confirmLogout: (...args) => confirmLogoutMock(...args),
}))

const ChangePasswordPage = (await import('@/pages/ChangePasswordPage.vue')).default

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    changePassword.mockReset()
    logout.mockReset()
    push.mockReset()
    showToast.mockReset()
    confirmLogoutMock.mockReset()
    confirmLogoutMock.mockResolvedValue(true)
  })

  it('rejects mismatched confirmation before calling the API', async () => {
    const wrapper = mount(ChangePasswordPage)
    await wrapper.get('#current-password').setValue('temporary-password')
    await wrapper.get('#new-password').setValue('N3w!SecurePass1')
    await wrapper.get('#confirm-password').setValue('different-password')

    await wrapper.get('form').trigger('submit')

    expect(changePassword).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('ไม่ตรงกัน')
  })

  it('rejects policy-invalid password with the backend message before calling the API', async () => {
    const wrapper = mount(ChangePasswordPage)
    // ครบ length/bytes/case/digit แต่ไม่มีอักขระพิเศษ → missing_special
    await wrapper.get('#current-password').setValue('temporary-password')
    await wrapper.get('#new-password').setValue('Abcdefghij12')
    await wrapper.get('#confirm-password').setValue('Abcdefghij12')

    await wrapper.get('form').trigger('submit')

    expect(changePassword).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'รหัสผ่านต้องมีอักขระพิเศษอย่างน้อย 1 ตัว'
    )
    // ค่าที่กรอกยังอยู่ครบ
    expect(wrapper.get('#new-password').element.value).toBe('Abcdefghij12')
  })

  it('keeps entered values visible when the backend rejects the password', async () => {
    changePassword.mockRejectedValue(new Error('รหัสผ่านใหม่ต้องไม่ซ้ำกับ 5 รุ่นล่าสุด'))
    const wrapper = mount(ChangePasswordPage)
    await wrapper.get('#current-password').setValue('temporary-password')
    await wrapper.get('#new-password').setValue('N3w!SecurePass1')
    await wrapper.get('#confirm-password').setValue('N3w!SecurePass1')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(changePassword).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[role="alert"]').text()).toContain('รหัสผ่านใหม่ต้องไม่ซ้ำกับ 5 รุ่นล่าสุด')
    expect(wrapper.get('#new-password').element.value).toBe('N3w!SecurePass1')
    expect(wrapper.get('#current-password').element.value).toBe('temporary-password')
    expect(logout).not.toHaveBeenCalled()
  })

  it('changes the password, revokes the session, and returns to login', async () => {
    changePassword.mockResolvedValue({ success: true })
    const wrapper = mount(ChangePasswordPage)
    await wrapper.get('#current-password').setValue('temporary-password')
    await wrapper.get('#new-password').setValue('N3w!SecurePass1')
    await wrapper.get('#confirm-password').setValue('N3w!SecurePass1')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(changePassword).toHaveBeenCalledWith('temporary-password', 'N3w!SecurePass1')
    // T4: เปลี่ยนรหัส = revoke ทุก session — บังคับ login ใหม่พร้อม toast แจ้ง
    expect(logout).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่', 'success')
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('logout asks for confirmation before signing out', async () => {
    const wrapper = mount(ChangePasswordPage)
    await wrapper.get('button[type="button"]').trigger('click')
    await flushPromises()

    expect(confirmLogoutMock).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('logout cancelled does not sign out', async () => {
    confirmLogoutMock.mockResolvedValueOnce(false)
    const wrapper = mount(ChangePasswordPage)
    await wrapper.get('button[type="button"]').trigger('click')
    await flushPromises()

    expect(confirmLogoutMock).toHaveBeenCalledTimes(1)
    expect(logout).not.toHaveBeenCalled()
  })
})
