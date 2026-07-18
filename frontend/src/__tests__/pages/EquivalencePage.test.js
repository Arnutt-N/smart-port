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
  auth.user = { user_id: 1, role }
  const wrapper = mount(EquivalencePage)
  await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
  await wrapper.vm.$nextTick()
  return wrapper
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

  it('blocks save when required form fields are missing', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreate()
    await wrapper.vm.$nextTick()

    await wrapper.vm.handleSave()

    expect(mockCreate).not.toHaveBeenCalled()
    expect(wrapper.vm.showModal).toBe(true)
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

  it('reject flow calls reject with the record id', async () => {
    const wrapper = await mountPage()
    mockReject.mockResolvedValue({ success: true })

    wrapper.vm.confirmReject(9)
    await wrapper.vm.handleReject()

    expect(mockReject).toHaveBeenCalledWith(9)
    expect(wrapper.vm.showRejectConfirm).toBe(false)
  })
})
