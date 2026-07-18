import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockFetchList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/composables/useSupportive.js', () => ({
  useSupportive: () => ({
    fetchList: mockFetchList,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  }),
}))

const mockApiGet = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockApiGet }),
}))

const SupportivePage = (await import('@/pages/SupportivePage.vue')).default

const sampleRow = {
  supportiveId: 11,
  personnelId: 3,
  fullName: 'สมชาย ใจดี',
  jobSeriesName: 'ทรัพยากรบุคคล',
  primarySeriesName: 'บริหารทั่วไป',
  startDate: '2021-01-01',
  endDate: '2021-12-31',
  startDateThai: '1 ม.ค. 2564',
  endDateThai: '31 ธ.ค. 2564',
  totalDays: 365,
  ratioPercent: 50,
  effectiveDays: 183,
  netEndDate: '2022-06-30',
  description: '',
}

async function mountPage() {
  setActivePinia(createPinia())
  const wrapper = mount(SupportivePage)
  await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('SupportivePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchList.mockResolvedValue({
      success: true,
      data: [sampleRow],
      summary: null,
      pagination: { total: 1, limit: 20, offset: 0 },
    })
  })

  it('loads and renders supportive records on mount', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('สมชาย ใจดี')
    expect(wrapper.text()).toContain('ทรัพยากรบุคคล')
  })

  it('blocks save when required form fields are missing', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreate()
    await wrapper.vm.$nextTick()

    await wrapper.vm.handleSave()

    expect(mockCreate).not.toHaveBeenCalled()
    expect(wrapper.vm.showModal).toBe(true)
  })

  it('delete flow calls remove with the record id', async () => {
    const wrapper = await mountPage()
    mockRemove.mockResolvedValue({ success: true })
    mockFetchList.mockClear()

    wrapper.vm.confirmDelete(11)
    await wrapper.vm.handleDelete()

    expect(mockRemove).toHaveBeenCalledWith(11)
    expect(wrapper.vm.showDeleteConfirm).toBe(false)
    expect(mockFetchList).toHaveBeenCalled()
  })
})
