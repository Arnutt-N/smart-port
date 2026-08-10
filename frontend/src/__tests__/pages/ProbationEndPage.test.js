import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

const mockFetchList = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/composables/useProbation.js', () => ({
  useProbation: () => ({
    fetchList: mockFetchList,
    update: mockUpdate,
    remove: mockRemove,
  }),
}))

const mockConfirmDelete = vi.fn(async () => true)
const mockConfirmSave = vi.fn(async () => true)
vi.mock('@/composables/useConfirm.js', () => ({
  confirmDelete: (...args) => mockConfirmDelete(...args),
  confirmSave: (...args) => mockConfirmSave(...args),
}))

const ProbationEndPage = (await import('@/pages/ProbationEndPage.vue')).default

const sampleRow = {
  enrollmentId: 9,
  personnelId: 3,
  name: 'สมหญิง รักดี',
  position: 'นักวิชาการศึกษา',
  department: 'สำนักงานเขตพื้นที่การศึกษา',
  startDate: '1 ต.ค. 2567',
  endDate: '30 ก.ย. 2569',
  startDateIso: '2024-10-01',
  endDateIso: '2026-09-30',
  remainingDays: 120,
  overallStatus: 'IN_PROGRESS',
  status: 'in_progress',
  totalTasks: 4,
  completedTasks: 1,
  remarks: '',
}

function resolvedData(rows = [sampleRow]) {
  mockFetchList.mockResolvedValue({
    data: rows,
    summary: { total: 10, in_progress: 6, near_deadline: 3, overdue: 1 },
    pagination: { total: rows.length, limit: 20, offset: 0, has_more: false },
  })
}

async function mountPage({ role = 'admin' } = {}) {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 1, role, username: 'tester' }
  auth.token = 'test-token'

  const wrapper = mount(ProbationEndPage)
  await vi.waitFor(() => {
    expect(mockFetchList).toHaveBeenCalled()
  })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('ProbationEndPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolvedData()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('loads data on mount and renders summary cards and rows', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('สมหญิง รักดี')
    expect(wrapper.text()).toContain('นักวิชาการศึกษา')
    expect(wrapper.text()).toContain('ทั้งหมด')
    expect(wrapper.text()).toContain('ใกล้ครบกำหนด')
    expect(wrapper.text()).toContain('เกินกำหนด')
  })

  it('shows error state with retry when loading fails', async () => {
    mockFetchList.mockRejectedValue(new Error('โหลดข้อมูลไม่สำเร็จ'))
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('โหลดข้อมูลไม่สำเร็จ'))
  })

  it('opens view modal with details and closes it', async () => {
    const wrapper = await mountPage()

    wrapper.vm.openView(sampleRow)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.showViewModal).toBe(true)
    expect(document.body.textContent).toContain('รายละเอียดการทดลองปฏิบัติราชการ')
    expect(document.body.textContent).toContain('1/4 ภารกิจ')

    wrapper.vm.showViewModal = false
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).not.toContain('รายละเอียดการทดลองปฏิบัติราชการ')
  })

  it('shows view/edit/delete for admin and hides delete for operator', async () => {
    const adminWrapper = await mountPage({ role: 'admin' })
    const adminKeys = adminWrapper.vm.rowActions(sampleRow).map((a) => a.key)
    expect(adminKeys).toEqual(['view', 'edit', 'delete'])
    adminWrapper.unmount()

    vi.clearAllMocks()
    resolvedData()
    const opWrapper = await mountPage({ role: 'operator' })
    const opKeys = opWrapper.vm.rowActions(sampleRow).map((a) => a.key)
    expect(opKeys).toEqual(['view', 'edit'])
  })

  it('saves edit after confirmation', async () => {
    mockUpdate.mockResolvedValue({ success: true })
    const wrapper = await mountPage()

    wrapper.vm.openEdit(sampleRow)
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.showEditModal).toBe(true)
    expect(wrapper.vm.formData.start_date).toBe('2024-10-01')

    await wrapper.vm.handleSave()
    expect(mockConfirmSave).toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith(9, expect.objectContaining({
      start_date: '2024-10-01',
      end_date: '2026-09-30',
      overall_status: 'IN_PROGRESS',
    }))
  })

  it('deletes enrollment after confirmation', async () => {
    mockRemove.mockResolvedValue({ success: true })
    const wrapper = await mountPage()
    mockFetchList.mockClear()
    resolvedData([])

    await wrapper.vm.confirmDelete(sampleRow)
    expect(mockConfirmDelete).toHaveBeenCalled()
    expect(mockRemove).toHaveBeenCalledWith(9)
    expect(mockFetchList).toHaveBeenCalled()
  })

  it('search input debounces and resets offset before refetching', async () => {
    vi.useFakeTimers()
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
    mockFetchList.mockClear()

    wrapper.vm.searchQuery = 'สมหญิง'
    wrapper.vm.pagination.offset = 40
    wrapper.vm.onSearch()
    expect(mockFetchList).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)

    expect(mockFetchList).toHaveBeenCalledTimes(1)
    expect(mockFetchList).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'สมหญิง', offset: 0 }),
    )
  })

  it('shows empty state when no rows match', async () => {
    resolvedData([])
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('ไม่พบข้อมูล'))
  })
})
