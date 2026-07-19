import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockFetchList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/composables/useDiverse.js', () => ({
  useDiverse: () => ({
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

const DiversePage = (await import('@/pages/DiversePage.vue')).default

const sampleRow = {
  experienceId: 5,
  personnelId: 3,
  fullName: 'สมชาย ใจดี',
  fromJobSeries: 'ธุรการ',
  fromWorkGroup: 'บริหารทั่วไป',
  fromProvince: 'กรุงเทพมหานคร',
  fromStartDate: '2019-01-01',
  fromEndDate: '2020-12-31',
  fromStartDateThai: '1 ม.ค. 2562',
  fromEndDateThai: '31 ธ.ค. 2563',
  toJobSeries: 'ทรัพยากรบุคคล',
  toWorkGroup: 'บริหารทั่วไป',
  toProvince: 'นนทบุรี',
  toStartDate: '2021-01-01',
  toEndDate: '2022-12-31',
  toStartDateThai: '1 ม.ค. 2564',
  toEndDateThai: '31 ธ.ค. 2565',
  isDiffJobSeries: 1,
  isDiffOrg: 0,
  isDiffLocation: 1,
  diffCount: 2,
  description: '',
}

async function mountPage() {
  setActivePinia(createPinia())
  const wrapper = mount(DiversePage)
  await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('DiversePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchList.mockResolvedValue({
      success: true,
      data: [sampleRow],
      summary: null,
      pagination: { total: 1, limit: 20, offset: 0 },
    })
  })

  it('loads and renders diverse-experience records on mount', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('สมชาย ใจดี')
    expect(wrapper.text()).toContain('ธุรการ')
    expect(wrapper.text()).toContain('ทรัพยากรบุคคล')
  })

  it('blocks submit when required form fields are missing', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    await wrapper.vm.$nextTick()

    await wrapper.vm.handleSubmit()

    expect(mockCreate).not.toHaveBeenCalled()
    expect(wrapper.vm.showModal).toBe(true)
  })

  it('delete flow calls remove with the experience id', async () => {
    const wrapper = await mountPage()
    mockRemove.mockResolvedValue({ success: true })
    mockFetchList.mockClear()

    wrapper.vm.confirmDelete(sampleRow)
    await wrapper.vm.handleDelete()

    expect(mockRemove).toHaveBeenCalledWith(5)
    expect(wrapper.vm.showDeleteConfirm).toBe(false)
    expect(mockFetchList).toHaveBeenCalled()
  })
})
