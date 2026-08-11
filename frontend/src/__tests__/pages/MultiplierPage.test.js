import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

const mockFetchList = vi.fn()
const mockFetchAreas = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()
const mockSearchPersonnel = vi.fn(async () => [])
const mockReplace = vi.fn()
const routeQuery = { value: {} }

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

const mockConfirmDelete = vi.fn(async () => true)
const mockConfirmSave = vi.fn(async () => true)
vi.mock('@/composables/useConfirm.js', () => ({
  confirmDelete: (...args) => mockConfirmDelete(...args),
  confirmSave: (...args) => mockConfirmSave(...args),
}))

vi.mock('@/composables/usePersonnelSearch.js', () => ({
  usePersonnelSearch: () => ({ searchPersonnel: mockSearchPersonnel }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ get query() { return routeQuery.value } }),
  useRouter: () => ({ replace: mockReplace }),
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
  auth.user = { id: 1, role }
  const wrapper = mount(MultiplierPage, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await vi.waitFor(() => {
    expect(mockFetchList).toHaveBeenCalled()
  })
  await wrapper.vm.$nextTick()
  return wrapper
}

function fillValidForm(wrapper) {
  wrapper.vm.formData = {
    personnel_id: 3,
    area_multiplier_id: 2,
    start_date: '2020-01-01',
    end_date: '2020-12-31',
    proof_reference: 'คส.123/2563',
    description: '',
  }
}

describe('MultiplierPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeQuery.value = {}
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

  it('create success closes modal and refreshes list', async () => {
    const wrapper = await mountPage()
    mockCreate.mockResolvedValue({ success: true })
    mockFetchList.mockClear()

    wrapper.vm.openCreateModal()
    fillValidForm(wrapper)
    await wrapper.vm.handleSubmit()

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      personnel_id: 3,
      area_multiplier_id: 2,
    }))
    expect(wrapper.vm.showModal).toBe(false)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('edit success calls update with multiplier id', async () => {
    const wrapper = await mountPage()
    mockUpdate.mockResolvedValue({ success: true, data: sampleRow })

    wrapper.vm.openEditModal(sampleRow)
    expect(wrapper.vm.isEditMode).toBe(true)
    expect(wrapper.vm.editingId).toBe(7)
    await wrapper.vm.handleSubmit()

    expect(mockUpdate).toHaveBeenCalledWith(7, expect.objectContaining({
      personnel_id: 3,
      area_multiplier_id: 2,
    }))
  })

  it('rejects end_date before start_date in validation', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    wrapper.vm.formData = {
      personnel_id: 3,
      area_multiplier_id: 2,
      start_date: '2020-12-31',
      end_date: '2020-01-01',
      proof_reference: '',
      description: '',
    }

    await wrapper.vm.handleSubmit()

    expect(mockCreate).not.toHaveBeenCalled()
    expect(wrapper.vm.formErrors.end_date).toBe(true)
  })

  it('shows submitError when create fails', async () => {
    const wrapper = await mountPage()
    mockCreate.mockRejectedValue(new Error('บันทึกไม่ได้'))
    wrapper.vm.openCreateModal()
    fillValidForm(wrapper)

    await wrapper.vm.handleSubmit()

    expect(wrapper.vm.submitError).toBe('บันทึกไม่ได้')
    expect(wrapper.vm.showModal).toBe(true)
  })

  it('delete flow calls remove and refreshes the list', async () => {
    const wrapper = await mountPage()
    mockRemove.mockResolvedValue({ success: true })
    mockFetchList.mockClear()
    mockConfirmDelete.mockResolvedValueOnce(true)

    await wrapper.vm.openDeleteConfirm(sampleRow)

    expect(mockConfirmDelete).toHaveBeenCalled()
    expect(mockRemove).toHaveBeenCalledWith(7)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('delete cancelled does not call remove', async () => {
    const wrapper = await mountPage()
    mockConfirmDelete.mockResolvedValueOnce(false)
    mockRemove.mockClear()

    await wrapper.vm.openDeleteConfirm(sampleRow)

    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('onPageChange updates offset and refetches', async () => {
    const wrapper = await mountPage()
    mockFetchList.mockClear()
    wrapper.vm.onPageChange(20)
    expect(wrapper.vm.pagination.offset).toBe(20)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('basisTypeLabel and formatNumber helpers work', async () => {
    const wrapper = await mountPage()
    expect(wrapper.vm.basisTypeLabel('MARTIAL_LAW')).toBe('กฎอัยการศึก')
    expect(wrapper.vm.basisTypeLabel('EMERGENCY_DECREE')).toBe('พ.ร.ก.ฉุกเฉิน')
    expect(wrapper.vm.basisTypeLabel('UNKNOWN')).toBe('UNKNOWN')
    expect(wrapper.vm.formatNumber(1234)).toMatch(/1[,.]?234/)
  })

  it('Escape key closes modal when open', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    expect(wrapper.vm.showModal).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.showModal).toBe(false)
  })

  it('selectPersonnel fills form and closes dropdown', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    wrapper.vm.selectPersonnel({ personnel_id: 9, full_name: 'สมหญิง รักงาน' })

    expect(wrapper.vm.formData.personnel_id).toBe(9)
    expect(wrapper.vm.personnelSearch).toBe('สมหญิง รักงาน')
    expect(wrapper.vm.showPersonnelDropdown).toBe(false)
  })

  it('ignores in-flight personnel results after query is cleared', async () => {
    vi.useFakeTimers()
    let resolveSearch
    mockSearchPersonnel.mockImplementation(
      () => new Promise((resolve) => { resolveSearch = resolve }),
    )
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    wrapper.vm.personnelSearch = 'สมชาย'
    wrapper.vm.queuePersonnelSearch()
    await vi.advanceTimersByTimeAsync(300)

    wrapper.vm.personnelSearch = ''
    wrapper.vm.queuePersonnelSearch()
    resolveSearch([{ personnel_id: 1, full_name: 'A' }])
    await flushPromises()

    expect(wrapper.vm.personnelResults).toEqual([])
    expect(wrapper.vm.showPersonnelDropdown).toBe(false)
    vi.useRealTimers()
  })

  it('opens create modal prefilled from profile create query', async () => {
    routeQuery.value = {
      create: '1',
      personnel_id: '12',
      full_name: 'นายสมชาย ไทยแท้',
    }
    const wrapper = await mountPage()
    expect(wrapper.vm.showModal).toBe(true)
    expect(wrapper.vm.formData.personnel_id).toBe(12)
    expect(wrapper.vm.personnelSearch).toBe('นายสมชาย ไทยแท้')
    expect(mockReplace).toHaveBeenCalledWith({ query: {} })
  })
})
