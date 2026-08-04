import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

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

const mockConfirmDelete = vi.fn(async () => true)
const mockConfirmSave = vi.fn(async () => true)
vi.mock('@/composables/useConfirm.js', () => ({
  confirmDelete: (...args) => mockConfirmDelete(...args),
  confirmSave: (...args) => mockConfirmSave(...args),
}))

const mockSearchPersonnel = vi.fn(async () => [])
vi.mock('@/composables/usePersonnelSearch.js', () => ({
  usePersonnelSearch: () => ({ searchPersonnel: (...args) => mockSearchPersonnel(...args) }),
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

async function mountPage(role = 'admin') {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 1, role }
  const wrapper = mount(SupportivePage)
  await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
  await wrapper.vm.$nextTick()
  return wrapper
}

function fillValidForm(wrapper) {
  wrapper.vm.formData = {
    personnel_id: 3,
    primary_series_name: 'บริหารทั่วไป',
    job_series_name: 'ทรัพยากรบุคคล',
    start_date: '2021-01-01',
    end_date: '2021-12-31',
    description: '',
  }
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

  it('shows error state when fetch fails', async () => {
    mockFetchList.mockRejectedValueOnce(new Error('เซิร์ฟเวอร์ล่ม'))
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('เซิร์ฟเวอร์ล่ม')
  })

  it('uses summary distinct_personnel when present', async () => {
    mockFetchList.mockResolvedValue({
      success: true,
      data: [sampleRow],
      summary: { distinct_personnel: 7 },
      pagination: { total: 1, limit: 20, offset: 0 },
    })
    const wrapper = await mountPage()
    expect(wrapper.vm.distinctPersonnelCount).toBe(7)
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
      job_series_name: 'ทรัพยากรบุคคล',
    }))
    expect(wrapper.vm.showModal).toBe(false)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('edit success calls update with supportive id', async () => {
    const wrapper = await mountPage()
    mockUpdate.mockResolvedValue({ success: true })
    mockFetchList.mockClear()

    wrapper.vm.openEdit(sampleRow)
    expect(wrapper.vm.formData.personnel_id).toBe(3)
    await wrapper.vm.handleSave()

    expect(mockUpdate).toHaveBeenCalledWith(11, expect.objectContaining({
      primary_series_name: 'บริหารทั่วไป',
    }))
    expect(wrapper.vm.showModal).toBe(false)
  })

  it('delete flow calls remove with the record id', async () => {
    const wrapper = await mountPage()
    mockRemove.mockResolvedValue({ success: true })
    mockFetchList.mockClear()
    mockConfirmDelete.mockResolvedValueOnce(true)

    await wrapper.vm.confirmDelete(11)

    expect(mockConfirmDelete).toHaveBeenCalled()
    expect(mockRemove).toHaveBeenCalledWith(11)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('delete cancelled does not call remove', async () => {
    const wrapper = await mountPage()
    mockConfirmDelete.mockResolvedValueOnce(false)
    mockRemove.mockClear()

    await wrapper.vm.confirmDelete(11)

    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('closeModal clears form errors', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreate()
    wrapper.vm.formErrors = { personnel_id: true }
    wrapper.vm.closeModal()
    expect(wrapper.vm.showModal).toBe(false)
    expect(wrapper.vm.formErrors).toEqual({})
  })

  it('debounces search and refetches after 300ms', async () => {
    vi.useFakeTimers()
    const wrapper = await mountPage()
    mockFetchList.mockClear()

    wrapper.vm.searchQuery = 'สม'
    wrapper.vm.onSearchInput()
    expect(mockFetchList).not.toHaveBeenCalled()

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

  it('personnel input clears selection and fetches after debounce', async () => {
    vi.useFakeTimers()
    mockSearchPersonnel.mockResolvedValue([{ personnel_id: 1, full_name: 'A' }])
    const wrapper = await mountPage()
    wrapper.vm.openCreate()
    wrapper.vm.formData.personnel_id = 3
    wrapper.vm.personnelSearch = 'สมช'
    wrapper.vm.onPersonnelInput()

    expect(wrapper.vm.formData.personnel_id).toBeNull()
    await vi.advanceTimersByTimeAsync(300)
    expect(mockSearchPersonnel).toHaveBeenCalledWith('สมช', { limit: 10 })
    expect(wrapper.vm.showPersonnelDropdown).toBe(true)
    vi.useRealTimers()
  })

  // backend ปฏิเสธ DELETE ของ operator ด้วย 403 (audit.php: checkPermission delete => [])
  // ปุ่มลบจึงต้องไม่โผล่ให้ operator กด — แต่ปุ่มแก้ไขต้องยังอยู่เพราะ operator แก้ไขได้
  it('hides the delete button for operator but keeps edit available', async () => {
    const wrapper = await mountPage('operator')
    expect(wrapper.vm.isAdmin).toBe(false)
    expect(wrapper.findAll('button[title="ลบ"]')).toHaveLength(0)
    expect(wrapper.findAll('button[title="แก้ไข"]').length).toBeGreaterThan(0)
  })

  it('shows the delete button for admin', async () => {
    const wrapper = await mountPage('admin')
    expect(wrapper.vm.isAdmin).toBe(true)
    expect(wrapper.findAll('button[title="ลบ"]').length).toBeGreaterThan(0)
  })
})
