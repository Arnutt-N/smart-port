import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

const mockFetchList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/composables/useUsers.js', () => ({
  useUsers: () => ({
    fetchList: mockFetchList,
    create: mockCreate,
    update: mockUpdate,
  }),
}))

const UserManagementPage = (await import('@/pages/UserManagementPage.vue')).default

const selfRow = {
  userId: 1,
  username: 'admin',
  fullName: 'ผู้ดูแลระบบ',
  email: 'admin@example.go.th',
  role: 'admin',
  isActive: true,
  lastLoginAt: '2026-07-01 10:00:00',
  mustChangePassword: false,
}

const otherRow = {
  userId: 2,
  username: 'somchai.j',
  fullName: 'สมชาย ใจดี',
  email: null,
  role: 'operator',
  isActive: true,
  lastLoginAt: null,
  mustChangePassword: true,
}

function resolvedData(rows = [selfRow, otherRow]) {
  mockFetchList.mockResolvedValue({
    data: rows,
    pagination: { total: rows.length, limit: 20, offset: 0, has_more: false },
  })
}

async function mountPage() {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 1, role: 'admin' }
  const wrapper = mount(UserManagementPage)
  await vi.waitFor(() => {
    expect(mockFetchList).toHaveBeenCalled()
  })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('UserManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolvedData()
  })

  it('loads users on mount and renders rows', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('somchai.j')
    expect(wrapper.text()).toContain('สมชาย ใจดี')
    expect(wrapper.text()).toContain('ยังไม่เปลี่ยนรหัสผ่าน')
    expect(wrapper.text()).toContain('Admin')
    expect(wrapper.text()).toContain('Operator')
  })

  it('hides the deactivate button for the logged-in user (self-guard)', async () => {
    const wrapper = await mountPage()
    const toggleButtons = wrapper.findAll('button[title="ปิดบัญชี"]')
    expect(toggleButtons).toHaveLength(1) // เฉพาะแถวของคนอื่น
  })

  it('shows error state with retry when loading fails', async () => {
    mockFetchList.mockRejectedValue(new Error('โหลดไม่สำเร็จ'))
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('โหลดไม่สำเร็จ'))

    resolvedData()
    const retry = wrapper.findAll('button').find((b) => b.text() === 'ลองใหม่')
    await retry.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('somchai.j'))
  })

  it('blocks create when password is too short', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreate()
    wrapper.vm.formData = {
      username: 'new.user',
      password: 'short',
      passwordConfirm: 'short',
      fullName: 'ผู้ใช้ใหม่',
      email: '',
      role: 'operator',
    }

    await wrapper.vm.submitForm()

    expect(mockCreate).not.toHaveBeenCalled()
    expect(wrapper.vm.showFormModal).toBe(true)
  })

  it('blocks create when password confirmation mismatches', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreate()
    wrapper.vm.formData = {
      username: 'new.user',
      password: 'password1',
      passwordConfirm: 'password2',
      fullName: 'ผู้ใช้ใหม่',
      email: '',
      role: 'operator',
    }

    await wrapper.vm.submitForm()

    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('creates a user and refreshes the list', async () => {
    const wrapper = await mountPage()
    mockCreate.mockResolvedValue({ success: true })
    mockFetchList.mockClear()

    wrapper.vm.openCreate()
    wrapper.vm.formData = {
      username: 'new.user',
      password: 'password1',
      passwordConfirm: 'password1',
      fullName: 'ผู้ใช้ใหม่',
      email: 'new@example.go.th',
      role: 'operator',
    }
    await wrapper.vm.submitForm()

    expect(mockCreate).toHaveBeenCalledWith({
      username: 'new.user',
      password: 'password1',
      fullName: 'ผู้ใช้ใหม่',
      email: 'new@example.go.th',
      role: 'operator',
    })
    expect(wrapper.vm.showFormModal).toBe(false)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('edits a user without touching username/password', async () => {
    const wrapper = await mountPage()
    mockUpdate.mockResolvedValue({ success: true })

    wrapper.vm.openEdit(otherRow)
    expect(wrapper.vm.formData.username).toBe('somchai.j')
    wrapper.vm.formData.fullName = 'สมชาย แก้ไข'
    await wrapper.vm.submitForm()

    expect(mockUpdate).toHaveBeenCalledWith(2, {
      fullName: 'สมชาย แก้ไข',
      email: null,
      role: 'operator',
    })
    expect(wrapper.vm.showFormModal).toBe(false)
  })

  it('reset password flow validates and submits new password', async () => {
    const wrapper = await mountPage()
    mockUpdate.mockResolvedValue({ success: true })

    wrapper.vm.openResetPassword(otherRow)
    wrapper.vm.resetForm = { password: 'newpass123', passwordConfirm: 'different' }
    await wrapper.vm.submitResetPassword()
    expect(mockUpdate).not.toHaveBeenCalled()

    wrapper.vm.resetForm = { password: 'newpass123', passwordConfirm: 'newpass123' }
    await wrapper.vm.submitResetPassword()
    expect(mockUpdate).toHaveBeenCalledWith(2, { password: 'newpass123' })
    expect(wrapper.vm.showResetModal).toBe(false)
  })

  it('toggle active confirms and calls update with flipped status', async () => {
    const wrapper = await mountPage()
    mockUpdate.mockResolvedValue({ success: true })
    mockFetchList.mockClear()

    wrapper.vm.openToggleActive(otherRow)
    expect(wrapper.vm.showToggleConfirm).toBe(true)
    await wrapper.vm.submitToggleActive()

    expect(mockUpdate).toHaveBeenCalledWith(2, { isActive: false })
    expect(wrapper.vm.showToggleConfirm).toBe(false)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('keeps API error visible as toast when update fails', async () => {
    const wrapper = await mountPage()
    mockUpdate.mockRejectedValue(new Error('ชื่อผู้ใช้ซ้ำ'))

    wrapper.vm.openEdit(otherRow)
    await wrapper.vm.submitForm()

    expect(wrapper.vm.showFormModal).toBe(true)
  })
})
