import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

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

const DiversePage = (await import('@/pages/DiversePage.vue')).default

const sampleRow = {
  experienceId: 5,
  personnelId: 3,
  fullName: 'สมชาย ใจดี',
  fromJobSeries: 'ธุรการ',
  fromWorkGroup: 'บริหารทั่วไป',
  fromDivision: 'ฝ่าย A',
  fromProvince: 'กรุงเทพมหานคร',
  fromStartDate: '2019-01-01',
  fromEndDate: '2020-12-31',
  fromStartDateThai: '1 ม.ค. 2562',
  fromEndDateThai: '31 ธ.ค. 2563',
  toJobSeries: 'ทรัพยากรบุคคล',
  toWorkGroup: 'บริหารทั่วไป',
  toDivision: 'ฝ่าย B',
  toProvince: 'นนทบุรี',
  toStartDate: '2021-01-01',
  toEndDate: '2022-12-31',
  toStartDateThai: '1 ม.ค. 2564',
  toEndDateThai: '31 ธ.ค. 2565',
  isDiffJobSeries: 1,
  isDiffOrg: 0,
  isDiffLocation: 1,
  isDiffWorkNature: 0,
  diffCount: 2,
  description: '',
}

async function mountPage(role = 'admin') {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 1, role }
  const wrapper = mount(DiversePage)
  await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
  await wrapper.vm.$nextTick()
  return wrapper
}

function fillValidForm(wrapper) {
  wrapper.vm.formData = {
    personnel_id: 3,
    from_job_series: 'ธุรการ',
    from_work_group: '',
    from_division: '',
    from_province: '',
    from_start_date: '2019-01-01',
    from_end_date: '2020-12-31',
    to_job_series: 'ทรัพยากรบุคคล',
    to_work_group: '',
    to_division: '',
    to_province: '',
    to_start_date: '2021-01-01',
    to_end_date: '2022-12-31',
    is_diff_job_series: true,
    is_diff_org: false,
    is_diff_location: true,
    is_diff_work_nature: false,
  }
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

  it('shows error state when fetch fails', async () => {
    mockFetchList.mockRejectedValueOnce(new Error('โหลดไม่ได้'))
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('โหลดไม่ได้')
  })

  it('uses summary counts when present for pass/not-yet stats', async () => {
    mockFetchList.mockResolvedValue({
      success: true,
      data: [sampleRow],
      summary: { total: 10, qualified_count: 4 },
      pagination: { total: 10, limit: 20, offset: 0 },
    })
    const wrapper = await mountPage()
    expect(wrapper.vm.passCount).toBe(4)
    expect(wrapper.vm.notYetCount).toBe(6)
  })

  it('computes pass/not-yet from rows when summary is null', async () => {
    const wrapper = await mountPage()
    expect(wrapper.vm.passCount).toBe(0) // diffCount 2 < 3
    expect(wrapper.vm.notYetCount).toBe(1)
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
      is_diff_job_series: 1,
      is_diff_location: 1,
      is_diff_org: 0,
    }))
    expect(wrapper.vm.showModal).toBe(false)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('edit success calls update with experience id', async () => {
    const wrapper = await mountPage()
    mockUpdate.mockResolvedValue({ success: true })
    mockFetchList.mockClear()

    wrapper.vm.openEditModal(sampleRow)
    expect(wrapper.vm.formData.personnel_id).toBe(3)
    expect(wrapper.vm.formData.from_job_series).toBe('ธุรการ')
    expect(wrapper.vm.diffCountPreview).toBe(2)

    await wrapper.vm.handleSubmit()

    expect(mockUpdate).toHaveBeenCalledWith(5, expect.objectContaining({
      personnel_id: 3,
      from_job_series: 'ธุรการ',
    }))
    expect(wrapper.vm.showModal).toBe(false)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('shows toast on submit error and keeps modal open', async () => {
    const wrapper = await mountPage()
    mockCreate.mockRejectedValue(new Error('บันทึกไม่ได้'))
    wrapper.vm.openCreateModal()
    fillValidForm(wrapper)

    await wrapper.vm.handleSubmit()

    expect(wrapper.vm.showModal).toBe(true)
    expect(wrapper.vm.submitting).toBe(false)
  })

  it('delete flow calls remove with the experience id', async () => {
    const wrapper = await mountPage()
    mockRemove.mockResolvedValue({ success: true })
    mockFetchList.mockClear()
    mockConfirmDelete.mockResolvedValueOnce(true)

    await wrapper.vm.confirmDelete(sampleRow)

    expect(mockConfirmDelete).toHaveBeenCalled()
    expect(mockRemove).toHaveBeenCalledWith(5)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('delete cancelled does not call remove', async () => {
    const wrapper = await mountPage()
    mockConfirmDelete.mockResolvedValueOnce(false)
    mockRemove.mockClear()

    await wrapper.vm.confirmDelete(sampleRow)

    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('closeModal clears editing state', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openEditModal(sampleRow)
    wrapper.vm.closeModal()
    expect(wrapper.vm.showModal).toBe(false)
    expect(wrapper.vm.editingRow).toBeNull()
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

  it('skips search while IME is composing then runs on composition end', async () => {
    vi.useFakeTimers()
    const wrapper = await mountPage()
    mockFetchList.mockClear()

    wrapper.vm.isComposing = true
    wrapper.vm.onSearchInput()
    expect(mockFetchList).not.toHaveBeenCalled()

    wrapper.vm.onCompositionEnd()
    await vi.advanceTimersByTimeAsync(300)
    expect(mockFetchList).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('selectPersonnel fills form and clears dropdown', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    wrapper.vm.selectPersonnel({ personnel_id: 9, full_name: 'สมหญิง รักงาน' })

    expect(wrapper.vm.formData.personnel_id).toBe(9)
    expect(wrapper.vm.selectedPersonnelName).toBe('สมหญิง รักงาน')
    expect(wrapper.vm.showPersonnelDropdown).toBe(false)
  })

  it('personnel search fetches results after debounce when query length >= 2', async () => {
    vi.useFakeTimers()
    mockSearchPersonnel.mockResolvedValue([{ personnel_id: 1, full_name: 'A' }])
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    wrapper.vm.personnelSearch = 'สมช'
    wrapper.vm.onPersonnelSearch()

    await vi.advanceTimersByTimeAsync(300)
    expect(mockSearchPersonnel).toHaveBeenCalled()
    expect(wrapper.vm.personnelResults).toHaveLength(1)
    expect(wrapper.vm.showPersonnelDropdown).toBe(true)
    vi.useRealTimers()
  })

  it('personnel search clears results when query is too short', async () => {
    vi.useFakeTimers()
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    wrapper.vm.personnelResults = [{ personnel_id: 1 }]
    wrapper.vm.showPersonnelDropdown = true
    wrapper.vm.personnelSearch = 'ส'
    wrapper.vm.onPersonnelSearch()

    await vi.advanceTimersByTimeAsync(300)
    expect(wrapper.vm.personnelResults).toEqual([])
    expect(wrapper.vm.showPersonnelDropdown).toBe(false)
    vi.useRealTimers()
  })

  it('personnel search swallows API errors', async () => {
    vi.useFakeTimers()
    mockSearchPersonnel.mockRejectedValue(new Error('down'))
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    wrapper.vm.personnelSearch = 'สมชาย'
    wrapper.vm.onPersonnelSearch()

    await vi.advanceTimersByTimeAsync(300)
    expect(wrapper.vm.personnelResults).toEqual([])
    vi.useRealTimers()
  })

  // backend ปฏิเสธ DELETE ของ operator ด้วย 403 (audit.php: checkPermission delete => [])
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
