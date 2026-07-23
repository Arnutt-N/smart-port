import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetchList = vi.fn()

vi.mock('@/composables/useWorkResults.js', () => ({
  useWorkResults: () => ({ fetchList: mockFetchList }),
}))

const WorkResultsPage = (await import('@/pages/WorkResultsPage.vue')).default

const sampleRow = {
  proposalId: 1,
  title: 'ผลงานเด่น',
  servantName: 'สมชาย ใจดี',
  proposalType: 'improvement',
  submissionDate: '2024-01-01',
  status: 'approved',
  description: 'รายละเอียด',
}

function resolvedData(rows = [sampleRow]) {
  mockFetchList.mockResolvedValue({
    data: rows,
    pagination: { total: rows.length, limit: 20, offset: 0, has_more: false },
  })
}

async function mountPage() {
  const wrapper = mount(WorkResultsPage)
  await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('WorkResultsPage', () => {
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
    expect(wrapper.text()).toContain('ผลงานเด่น')
    expect(wrapper.text()).toContain('สมชาย ใจดี')
  })

  it('shows error state with retry when loading fails', async () => {
    mockFetchList.mockRejectedValue(new Error('โหลดข้อมูลไม่สำเร็จ'))
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('โหลดข้อมูลไม่สำเร็จ'))
  })

  it('shows empty state when no rows', async () => {
    resolvedData([])
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('ไม่พบข้อมูล'))
  })

  it('opens detail modal', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openView(sampleRow)
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.showViewModal).toBe(true)
    expect(document.body.textContent).toContain('รายละเอียดผลงาน')
  })
})
