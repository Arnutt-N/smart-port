import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const changePassword = vi.fn()
const logout = vi.fn()
const push = vi.fn()

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({ changePassword, logout }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

const ChangePasswordPage = (await import('@/pages/ChangePasswordPage.vue')).default

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    changePassword.mockReset()
    logout.mockReset()
    push.mockReset()
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
})
