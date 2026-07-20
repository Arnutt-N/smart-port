import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

const mockFetchList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockApprove = vi.fn()
const mockReject = vi.fn()

vi.mock('@/composables/useEquivalence.js', () => ({
  useEquivalence: () => ({
    fetchList: mockFetchList,
    create: mockCreate,
    update: mockUpdate,
    approve: mockApprove,
    reject: mockReject,
  }),
}))

const mockApiGet = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockApiGet }),
}))

const EquivalencePage = (await import('@/pages/EquivalencePage.vue')).default

const sampleRow = {
  equivalenceId: 9,
  personnelId: 3,
  fullName: 'สมชาย ใจดี',
  actualPosition: 'นักทรัพยากรบุคคลชำนาญการ',
  equivalentType: 'ACADEMIC',
  requestStartDate: '2020-01-01',
  requestEndDate: '2021-12-31',
  requestStartDateThai: '1 ม.ค. 2563',
  requestEndDateThai: '31 ธ.ค. 2564',
  requestTotalDays: 731,
  approvalStatus: 'PENDING',
  approvedStartDate: null,
  approvedEndDate: null,
  approvedTotalDays: null,
  approvedBy: null,
  approvedByName: null,
  approvalOrderRef: null,
}

async function mountPage({ role = 'admin' } = {}) {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 1, role }
  const wrapper = mount(EquivalencePage)
  await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
  await wrapper.vm.$nextTick()
  return wrapper
}

function fillValidForm(wrapper) {
  wrapper.vm.formData = {
    personnel_id: 3,
    actual_position: 'นักทรัพยากรบุคคลชำนาญการ',
    equivalent_type: 'ACADEMIC',
    request_start_date: '2020-01-01',
    request_end_date: '2021-12-31',
    approval_order_ref: '',
  }
}

describe('EquivalencePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchList.mockResolvedValue({
      success: true,
      data: [sampleRow],
      summary: null,
      pagination: { total: 1, limit: 20, offset: 0 },
    })
  })

  it('loads and renders equivalence requests on mount', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('สมชาย ใจดี')
    expect(wrapper.text()).toContain('นักทรัพยากรบุคคลชำนาญการ')
  })

  it('shows error state when fetch fails', async () => {
    mockFetchList.mockRejectedValueOnce(new Error('network'))
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('network')
  })

  it('computes status counts from rows when summary is null', async () => {
    const wrapper = await mountPage()
    expect(wrapper.vm.statusCounts).toEqual({ pending: 1, approved: 0, rejected: 0 })
  })

  it('uses summary status counts when present', async () => {
    mockFetchList.mockResolvedValue({
      success: true,
      data: [sampleRow],
      summary: { total: 5, pending_count: 2, approved_count: 2, rejected_count: 1 },
      pagination: { total: 5, limit: 20, offset: 0 },
    })
    const wrapper = await mountPage()
    expect(wrapper.vm.statusCounts).toEqual({ pending: 2, approved: 2, rejected: 1 })
    expect(wrapper.vm.totalCount).toBe(5)
  })

  it('blocks save when required form fields are missing', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreate()
    await wrapper.vm.$nextTick()

    await wrapper.vm.handleSave()

    expect(mockCreate).not.toHaveBeenCalled()
    expect(wrapper.vm.showModal).toBe(true)
  })

  it('create success closes modal and refreshes list', async () => {
    const wrapper = await mountPage()
    mockCreate.mockResolvedValue({ success: true })
    mockFetchList.mockClear()

    wrapper.vm.openCreate()
    fillValidForm(wrapper)
    await wrapper.vm.handleSave()

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      personnel_id: 3,
      equivalent_type: 'ACADEMIC',
    }))
    expect(wrapper.vm.showModal).toBe(false)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('edit success calls update with equivalence id', async () => {
    const wrapper = await mountPage()
    mockUpdate.mockResolvedValue({ success: true })

    wrapper.vm.openEdit(sampleRow)
    expect(wrapper.vm.formData.actual_position).toBe('นักทรัพยากรบุคคลชำนาญการ')
    await wrapper.vm.handleSave()

    expect(mockUpdate).toHaveBeenCalledWith(9, expect.objectContaining({
      personnel_id: 3,
    }))
  })

  it('approve flow sends approved dates for the record', async () => {
    const wrapper = await mountPage()
    mockApprove.mockResolvedValue({ success: true })
    mockFetchList.mockClear()

    wrapper.vm.openApprove(sampleRow)
    await wrapper.vm.handleApprove()

    expect(mockApprove).toHaveBeenCalledWith(9, {
      approvedStartDate: '2020-01-01',
      approvedEndDate: '2021-12-31',
    })
    expect(wrapper.vm.showApproveModal).toBe(false)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('approve without dates does not call API', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openApprove(sampleRow)
    wrapper.vm.approveForm.approved_start_date = ''
    wrapper.vm.approveForm.approved_end_date = ''

    await wrapper.vm.handleApprove()

    expect(mockApprove).not.toHaveBeenCalled()
  })

  it('reject flow calls reject with the record id', async () => {
    const wrapper = await mountPage()
    mockReject.mockResolvedValue({ success: true })

    wrapper.vm.confirmReject(9)
    await wrapper.vm.handleReject()

    expect(mockReject).toHaveBeenCalledWith(9)
    expect(wrapper.vm.showRejectConfirm).toBe(false)
  })

  it('openView sets viewing record and shows modal', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openView(sampleRow)
    expect(wrapper.vm.viewingRecord).toEqual(sampleRow)
    expect(wrapper.vm.showViewModal).toBe(true)
  })

  it('debounces search and refetches after 300ms', async () => {
    vi.useFakeTimers()
    const wrapper = await mountPage()
    mockFetchList.mockClear()

    wrapper.vm.searchQuery = 'สม'
    wrapper.vm.onSearchInput()
    await vi.advanceTimersByTimeAsync(300)

    expect(mockFetchList).toHaveBeenCalledWith(expect.objectContaining({ search: 'สม', offset: 0 }))
    vi.useRealTimers()
  })

  it('selectPersonnel fills form and closes dropdown', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreate()
    wrapper.vm.selectPersonnel({ personnel_id: 9, full_name: 'สมหญิง รักงาน' })

    expect(wrapper.vm.formData.personnel_id).toBe(9)
    expect(wrapper.vm.personnelSearch).toBe('สมหญิง รักงาน')
    expect(wrapper.vm.showPersonnelDropdown).toBe(false)
  })
})
