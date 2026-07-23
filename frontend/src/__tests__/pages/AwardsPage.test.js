import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

const mockFetchList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/composables/useAwards.js', () => ({
  useAwards: () => ({
    fetchList: mockFetchList,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  }),
}))

const AwardsPage = (await import('@/pages/AwardsPage.vue')).default

const sampleRow = {
  awardId: 1,
  servantId: 5,
  servantName: 'สมชาย ใจดี',
  awardName: 'รางวัลดีเด่น',
  awardType: 'honor',
  awardLevel: 'national',
  awardedDate: '2024-01-01',
  description: 'x',
}

function resolvedData(rows = [sampleRow]) {
  mockFetchList.mockResolvedValue({
    data: rows,
    pagination: { total: rows.length, limit: 20, offset: 0, has_more: false },
  })
}

async function mountPage(role = 'admin') {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 1, role }
  const wrapper = mount(AwardsPage)
  await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('AwardsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolvedData()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('loads data on mount and renders rows', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('รางวัลดีเด่น')
    expect(wrapper.text()).toContain('สมชาย ใจดี')
  })

  it('shows add button for admin and opens create modal', async () => {
    const wrapper = await mountPage('admin')
    expect(wrapper.text()).toContain('เพิ่มรางวัล')
    wrapper.vm.openCreate()
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.showFormModal).toBe(true)
  })

  it('hides add button for non-admin', async () => {
    const wrapper = await mountPage('operator')
    expect(wrapper.vm.isAdmin).toBe(false)
    expect(wrapper.text()).not.toContain('เพิ่มรางวัล')
  })

  it('shows error state when loading fails', async () => {
    mockFetchList.mockRejectedValue(new Error('โหลดข้อมูลไม่สำเร็จ'))
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('โหลดข้อมูลไม่สำเร็จ'))
  })

  it('shows empty state when no rows', async () => {
    resolvedData([])
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('ไม่พบข้อมูล'))
  })
})
