import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetchList = vi.fn()

vi.mock('@/composables/useRetirement.js', () => ({
  useRetirement: () => ({ fetchList: mockFetchList }),
}))

const RetirementReportPage = (await import('@/pages/RetirementReportPage.vue')).default

const sampleRow = {
  servantId: 3,
  employeeId: 'EMP003',
  fullName: 'สมศักดิ์ ตั้งใจ',
  retirementDate: '2030-09-30',
  servantStatus: 'active',
  remainingDays: 120,
}

function resolvedData(rows = [sampleRow]) {
  mockFetchList.mockResolvedValue({
    data: rows,
    pagination: { total: rows.length, limit: 20, offset: 0, has_more: false },
  })
}

async function mountPage() {
  const wrapper = mount(RetirementReportPage)
  await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
  await vi.waitFor(() => expect(wrapper.vm.loading).toBe(false))
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('RetirementReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolvedData()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('loads data on mount and renders rows and stat cards', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('สมศักดิ์ ตั้งใจ')
    expect(wrapper.text()).toContain('EMP003')
    expect(wrapper.text()).toContain('เกษียณภายใน 12 เดือน')
  })

  it('shows error state with retry when loading fails', async () => {
    mockFetchList.mockRejectedValue(new Error('โหลดข้อมูลไม่สำเร็จ'))
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('โหลดข้อมูลไม่สำเร็จ'))
  })

  it('within filter resets offset and refetches', async () => {
    const wrapper = await mountPage()
    mockFetchList.mockClear()
    wrapper.vm.within = '6'
    wrapper.vm.pagination.offset = 40
    wrapper.vm.onFilterChange()
    await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
    expect(mockFetchList).toHaveBeenCalledWith(expect.objectContaining({ within: '6', offset: 0 }))
  })

  it('shows empty state when no rows', async () => {
    resolvedData([])
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('ไม่พบข้อมูล'))
  })
})
