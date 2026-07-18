import { mount, RouterLinkStub } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

const mockFetchList = vi.fn()
const mockFetchAreas = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/composables/useMultiplier.js', () => ({
  useMultiplier: () => ({
    fetchList: mockFetchList,
    fetchAreas: mockFetchAreas,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  }),
}))

const mockApiGet = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockApiGet }),
}))

const MultiplierPage = (await import('@/pages/MultiplierPage.vue')).default

const sampleRow = {
  multiplierId: 7,
  personnelId: 3,
  fullName: 'สมชาย ใจดี',
  areaMultiplierId: 2,
  province: 'ยะลา',
  district: null,
  areaLabel: 'ยะลา / ทั้งจังหวัด',
  basisType: 'EMERGENCY_DECREE',
  startDate: '2020-01-01',
  endDate: '2020-12-31',
  startDateThai: '1 ม.ค. 2563',
  endDateThai: '31 ธ.ค. 2563',
  eligibleDays: 366,
  multiplierRatio: 200,
  effectiveDays: 732,
  bonusDays: 366,
  netYears: 2,
  netMonths: 0,
  netDayRemainder: 1,
  proofReference: 'คส.123/2563',
  description: '',
}

const sampleArea = {
  areaMultiplierId: 2,
  province: 'ยะลา',
  district: null,
  areaLabel: 'ยะลา / ทั้งจังหวัด',
  basisType: 'EMERGENCY_DECREE',
  multiplierRatio: 200,
  legalReference: 'TEST_SEED',
  sourceReference: '',
  isActive: true,
  sourcePending: true,
}

function resolvedData() {
  mockFetchList.mockResolvedValue({
    success: true,
    data: [sampleRow],
    summary: { total: 1, distinct_personnel: 1, total_effective_days: 732, total_bonus_days: 366 },
    pagination: { total: 1, limit: 20, offset: 0, has_more: false },
  })
  mockFetchAreas.mockResolvedValue({
    success: true,
    data: [sampleArea],
    summary: { total: 1, source_pending: 1 },
  })
}

async function mountPage({ role = 'admin' } = {}) {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { user_id: 1, role }
  const wrapper = mount(MultiplierPage, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await vi.waitFor(() => {
    expect(mockFetchList).toHaveBeenCalled()
  })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('MultiplierPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolvedData()
  })

  it('loads records and areas on mount and renders them', async () => {
    const wrapper = await mountPage()
    expect(mockFetchAreas).toHaveBeenCalled()
    expect(wrapper.text()).toContain('สมชาย ใจดี')
    expect(wrapper.text()).toContain('ยะลา / ทั้งจังหวัด')
  })

  it('shows error banner when loading fails', async () => {
    mockFetchList.mockRejectedValue(new Error('boom'))
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('boom'))
  })

  it('hides the special-areas settings link from non-admin users', async () => {
    const wrapper = await mountPage({ role: 'operator' })
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links.some((l) => l.props('to') === '/settings/special-areas')).toBe(false)
  })

  it('shows the settings link to admins', async () => {
    const wrapper = await mountPage({ role: 'admin' })
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links.some((l) => l.props('to') === '/settings/special-areas')).toBe(true)
  })

  it('blocks submit when required form fields are missing', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    await wrapper.vm.$nextTick()

    await wrapper.vm.handleSubmit()

    expect(mockCreate).not.toHaveBeenCalled()
    expect(wrapper.vm.showModal).toBe(true)
  })

  it('delete flow calls remove and refreshes the list', async () => {
    const wrapper = await mountPage()
    mockRemove.mockResolvedValue({ success: true })
    mockFetchList.mockClear()

    wrapper.vm.openDeleteConfirm(sampleRow)
    await wrapper.vm.handleDelete()

    expect(mockRemove).toHaveBeenCalledWith(7)
    expect(mockFetchList).toHaveBeenCalled()
    expect(wrapper.vm.showDeleteConfirm).toBe(false)
  })
})
