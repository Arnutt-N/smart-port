import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const changePassword = vi.fn()
const logout = vi.fn()
const push = vi.fn()
const confirmLogoutMock = vi.fn(async () => true)

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({ changePassword, logout }),
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
    confirmLogoutMock.mockReset()
    confirmLogoutMock.mockResolvedValue(true)
  })

  it('rejects mismatched confirmation before calling the API', async () => {
    const wrapper = mount(ChangePasswordPage)
    await wrapper.get('#current-password').setValue('temporary-password')
    await wrapper.get('#new-password').setValue('new-secure-password')
    await wrapper.get('#confirm-password').setValue('different-password')

    await wrapper.get('form').trigger('submit')

    expect(changePassword).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('ไม่ตรงกัน')
  })

  it('changes the password and continues to the dashboard', async () => {
    changePassword.mockResolvedValue({ success: true })
    const wrapper = mount(ChangePasswordPage)
    await wrapper.get('#current-password').setValue('temporary-password')
    await wrapper.get('#new-password').setValue('new-secure-password')
    await wrapper.get('#confirm-password').setValue('new-secure-password')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(changePassword).toHaveBeenCalledWith('temporary-password', 'new-secure-password')
    expect(push).toHaveBeenCalledWith('/dashboard')
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
