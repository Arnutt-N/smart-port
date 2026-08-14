import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

const mockFetchMe = vi.fn()
const mockFetchById = vi.fn()
const mockPush = vi.fn()
const routeParams = { value: {} }

vi.mock('@/composables/useProfile.js', () => ({
  useProfile: () => ({ fetchMe: mockFetchMe, fetchById: mockFetchById }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ get params() { return routeParams.value } }),
  useRouter: () => ({ push: mockPush }),
}))

const ProfilePage = (await import('@/pages/ProfilePage.vue')).default

async function mountPage(role = 'admin') {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 1, role }
  const wrapper = mount(ProfilePage)
  await wrapper.vm.$nextTick()
  await wrapper.vm.$nextTick()
  return wrapper
}

function activeServant(overrides = {}) {
  return {
    servantId: 5,
    employeeId: 'EMP005',
    fullName: 'นายสมชาย ไทยแท้',
    birthDate: '1980-01-01',
    appointmentDate: '2000-01-01',
    retirementDate: '2040-09-30',
    servantStatus: 'active',
    photoPath: null,
    isActive: true,
    ...overrides,
  }
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
    mockFetchById.mockResolvedValue({ data: activeServant() })
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

  it('shows career time shortcuts for admin when personnel is active', async () => {
    routeParams.value = { id: '5' }
    const wrapper = await mountPage('admin')
    await vi.waitFor(() => expect(mockFetchById).toHaveBeenCalledWith('5'))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('การนับเกื้อกูล')
    expect(wrapper.text()).toContain('การนับทวีคูณ')
    expect(wrapper.text()).toContain('การนับแตกต่าง')
    expect(wrapper.text()).toContain('การเทียบตำแหน่ง')
  })

  it('hides career time shortcuts when personnel is inactive', async () => {
    routeParams.value = { id: '5' }
    mockFetchById.mockResolvedValue({ data: activeServant({ isActive: false }) })
    const wrapper = await mountPage('admin')
    await vi.waitFor(() => expect(mockFetchById).toHaveBeenCalledWith('5'))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('ทางลัดเพิ่มรายการนับเวลา')
  })

  it('hides career time shortcuts for viewer', async () => {
    routeParams.value = { id: '5' }
    const wrapper = await mountPage('viewer')
    await vi.waitFor(() => expect(mockFetchById).toHaveBeenCalledWith('5'))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('ทางลัดเพิ่มรายการนับเวลา')
  })

  it('shows career time shortcuts for operator when personnel is active', async () => {
    routeParams.value = { id: '5' }
    const wrapper = await mountPage('operator')
    await vi.waitFor(() => expect(mockFetchById).toHaveBeenCalledWith('5'))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('ทางลัดเพิ่มรายการนับเวลา')
    expect(wrapper.text()).toContain('การนับเกื้อกูล')
    expect(wrapper.text()).toContain('การนับทวีคูณ')
    expect(wrapper.text()).toContain('การนับแตกต่าง')
    expect(wrapper.text()).toContain('การเทียบตำแหน่ง')
  })

  it('navigates to time page with create query when shortcut clicked', async () => {
    routeParams.value = { id: '5' }
    const wrapper = await mountPage('admin')
    await vi.waitFor(() => expect(mockFetchById).toHaveBeenCalledWith('5'))
    await wrapper.vm.$nextTick()

    const button = wrapper.findAll('button').find((b) => b.text().includes('การนับเกื้อกูล'))
    expect(button).toBeTruthy()
    await button.trigger('click')

    expect(mockPush).toHaveBeenCalledWith({
      path: '/time-counting',
      query: { create: '1', personnel_id: '5', full_name: 'นายสมชาย ไทยแท้' },
    })
  })
})
