import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetchMe = vi.fn()
const mockFetchById = vi.fn()
const routeParams = { value: {} }

vi.mock('@/composables/useProfile.js', () => ({
  useProfile: () => ({ fetchMe: mockFetchMe, fetchById: mockFetchById }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ get params() { return routeParams.value } }),
}))

const ProfilePage = (await import('@/pages/ProfilePage.vue')).default

async function mountPage() {
  const wrapper = mount(ProfilePage)
  await wrapper.vm.$nextTick()
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeParams.value = {}
    mockFetchMe.mockResolvedValue({
      data: {
        userId: 1, username: 'admin', fullName: 'ผู้ดูแลระบบ', email: 'a@b.c',
        role: 'admin', isActive: true, mustChangePassword: false,
        lastLoginAt: '2024-01-01 10:00:00', createdAt: '2023-01-01',
      },
    })
    mockFetchById.mockResolvedValue({
      data: {
        servantId: 5, employeeId: 'EMP005', fullName: 'นายสมชาย ไทยแท้',
        birthDate: '1980-01-01', appointmentDate: '2000-01-01',
        retirementDate: '2040-09-30', servantStatus: 'active', photoPath: null,
      },
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders own account when no id param', async () => {
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(mockFetchMe).toHaveBeenCalled())
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('โปรไฟล์ของฉัน')
    expect(wrapper.text()).toContain('ผู้ดูแลระบบ')
  })

  it('renders servant detail when id param present', async () => {
    routeParams.value = { id: '5' }
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(mockFetchById).toHaveBeenCalledWith('5'))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('โปรไฟล์ข้าราชการ')
    expect(wrapper.text()).toContain('นายสมชาย ไทยแท้')
  })

  it('shows error state when loading fails', async () => {
    mockFetchMe.mockRejectedValue(new Error('โหลดข้อมูลไม่สำเร็จ'))
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('โหลดข้อมูลไม่สำเร็จ'))
  })
})
