import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const fetchMe = vi.fn()
const updateMe = vi.fn()
const changePassword = vi.fn()
const mockGet = vi.fn()
const mockPut = vi.fn()
const confirmSave = vi.fn(async () => true)

const authState = {
  isSuperAdmin: false,
  isAdmin: true,
  fetchMe,
  updateMe,
  changePassword,
  user: { id: 1, username: 'alice', name: 'Alice', role: 'operator' },
}

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => authState,
}))

vi.mock('@/stores/ui.js', () => ({
  useUiStore: () => ({ showToast: vi.fn() }),
}))

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, put: mockPut }),
}))

vi.mock('@/composables/useConfirm.js', () => ({
  confirmSave: (...args) => confirmSave(...args),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'settings-account', query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

const SettingsPage = (await import('@/pages/SettingsPage.vue')).default

describe('SettingsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    authState.isSuperAdmin = false
    authState.isAdmin = true
    fetchMe.mockReset()
    updateMe.mockReset()
    changePassword.mockReset()
    mockGet.mockReset()
    mockPut.mockReset()
    confirmSave.mockReset()
    confirmSave.mockResolvedValue(true)
    fetchMe.mockResolvedValue({
      username: 'alice',
      full_name: 'Alice',
      email: 'a@example.com',
    })
  })

  it('loads account fields on mount', async () => {
    const wrapper = mount(SettingsPage)
    await flushPromises()

    expect(fetchMe).toHaveBeenCalled()
    expect(wrapper.find('#settings-username').element.value).toBe('alice')
    expect(wrapper.find('#settings-fullname').element.value).toBe('Alice')
  })

  it('saves profile via updateMe after confirm', async () => {
    updateMe.mockResolvedValue({ username: 'alice', full_name: 'Alice B', email: '' })
    const wrapper = mount(SettingsPage)
    await flushPromises()

    await wrapper.find('#settings-fullname').setValue('Alice B')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(confirmSave).toHaveBeenCalled()
    expect(updateMe).toHaveBeenCalledWith(expect.objectContaining({
      full_name: 'Alice B',
      username: 'alice',
    }))
  })

})
