import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const login = vi.fn()
const push = vi.fn()

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({
    login,
    get mustChangePassword() {
      return mustChangePasswordVal
    },
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

let mustChangePasswordVal = false

const LoginPage = (await import('@/pages/LoginPage.vue')).default

function mountPage() {
  return mount(LoginPage, { attachTo: document.body })
}

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset()
    push.mockReset()
    mustChangePasswordVal = false
  })

  it('toggles password visibility', async () => {
    const wrapper = mountPage()
    const input = wrapper.get('input[autocomplete="current-password"]')
    expect(input.attributes('type')).toBe('password')

    await wrapper.get('button[aria-label="แสดง/ซ่อนรหัสผ่าน"]').trigger('click')
    expect(input.attributes('type')).toBe('text')

    await wrapper.get('button[aria-label="แสดง/ซ่อนรหัสผ่าน"]').trigger('click')
    expect(input.attributes('type')).toBe('password')
  })

  it('binds username and password inputs and remember-me checkbox', async () => {
    const wrapper = mountPage()
    await wrapper.get('input[autocomplete="username"]').setValue('admin')
    await wrapper.get('input[autocomplete="current-password"]').setValue('secret123')
    await wrapper.get('input[type="checkbox"]').setValue(true)

    expect(wrapper.vm.form.username).toBe('admin')
    expect(wrapper.vm.form.password).toBe('secret123')
    expect(wrapper.vm.rememberMe).toBe(true)
  })

  it('shows forgot-password info and clears prior error', async () => {
    const wrapper = mountPage()
    wrapper.vm.errorMsg = 'previous error'
    await wrapper.vm.showAccountHelp('forgot')

    expect(wrapper.vm.infoMsg).toContain('ลืมรหัสผ่าน')
    expect(wrapper.vm.infoMsg).toContain('ผู้ดูแลระบบ')
    expect(wrapper.vm.errorMsg).toBe('')
    expect(wrapper.find('[role="status"]').text()).toContain('ลืมรหัสผ่าน')
  })

  it('shows register info and clears prior error', async () => {
    const wrapper = mountPage()
    wrapper.vm.errorMsg = 'previous error'
    await wrapper.vm.showAccountHelp('register')

    expect(wrapper.vm.infoMsg).toContain('สร้างบัญชีใหม่')
    expect(wrapper.vm.infoMsg).toContain('ผู้ดูแลระบบ')
    expect(wrapper.vm.errorMsg).toBe('')
  })

  it('logs in and navigates to the dashboard when password change is not required', async () => {
    login.mockResolvedValue({ token: 't', user: { id: 1, role: 'admin' } })
    mustChangePasswordVal = false
    const wrapper = mountPage()
    await wrapper.get('input[autocomplete="username"]').setValue('admin')
    await wrapper.get('input[autocomplete="current-password"]').setValue('admin123')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(login).toHaveBeenCalledWith({ username: 'admin', password: 'admin123' })
    expect(push).toHaveBeenCalledWith('/dashboard')
    expect(wrapper.vm.loading).toBe(false)
  })

  it('redirects to change-password when mustChangePassword is true', async () => {
    login.mockResolvedValue({ token: 't', user: { id: 2, role: 'operator', must_change_password: true } })
    mustChangePasswordVal = true
    const wrapper = mountPage()
    await wrapper.get('input[autocomplete="username"]').setValue('operator1')
    await wrapper.get('input[autocomplete="current-password"]').setValue('tempPass1')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(login).toHaveBeenCalledWith({ username: 'operator1', password: 'tempPass1' })
    expect(push).toHaveBeenCalledWith('/change-password')
  })

  it('shows error message and re-enables the button when login fails', async () => {
    login.mockRejectedValue(new Error('รหัสผ่านไม่ถูกต้อง'))
    const wrapper = mountPage()
    await wrapper.get('input[autocomplete="username"]').setValue('admin')
    await wrapper.get('input[autocomplete="current-password"]').setValue('wrong')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(push).not.toHaveBeenCalled()
    expect(wrapper.vm.errorMsg).toBe('รหัสผ่านไม่ถูกต้อง')
    expect(wrapper.vm.loading).toBe(false)
    expect(wrapper.find('.bg-red-50').text()).toContain('รหัสผ่านไม่ถูกต้อง')
  })

  it('falls back to a generic error message when the API error has no message', async () => {
    login.mockRejectedValue({})
    const wrapper = mountPage()
    await wrapper.get('input[autocomplete="username"]').setValue('admin')
    await wrapper.get('input[autocomplete="current-password"]').setValue('whatever')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.vm.errorMsg).toBe('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่')
  })

  it('clears info and error messages at the start of a new submit', async () => {
    login.mockImplementation(async () => {
      // first call throws, second succeeds
      if (login.mock.calls.length === 1) {
        throw new Error('first fail')
      }
      return { token: 't', user: { id: 1 } }
    })
    mustChangePasswordVal = false
    const wrapper = mountPage()
    await wrapper.get('input[autocomplete="username"]').setValue('admin')
    await wrapper.get('input[autocomplete="current-password"]').setValue('pw')

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.vm.errorMsg).toBe('first fail')

    // seed an infoMsg to ensure submit clears it
    wrapper.vm.infoMsg = 'leftover info'

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.vm.infoMsg).toBe('')
    expect(wrapper.vm.errorMsg).toBe('')
    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('disables the submit button and shows spinner while loading', async () => {
    let resolveLogin
    login.mockReturnValue(new Promise((resolve) => { resolveLogin = resolve }))
    const wrapper = mountPage()
    await wrapper.get('input[autocomplete="username"]').setValue('admin')
    await wrapper.get('input[autocomplete="current-password"]').setValue('pw')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const submitBtn = wrapper.get('button[type="submit"]')
    expect(submitBtn.attributes('disabled')).toBeDefined()
    expect(submitBtn.text()).toContain('กำลังเข้าสู่ระบบ')
    expect(wrapper.vm.loading).toBe(true)

    resolveLogin({ token: 't', user: { id: 1 } })
    await flushPromises()
    expect(wrapper.vm.loading).toBe(false)
  })
})