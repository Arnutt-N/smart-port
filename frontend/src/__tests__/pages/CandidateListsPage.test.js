import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const mockFetchOverview = vi.fn()
const mockFetchByLevel = vi.fn()

vi.mock('@/composables/useCandidates.js', () => ({
  useCandidates: () => ({
    fetchOverview: mockFetchOverview,
    fetchByLevel: mockFetchByLevel,
  }),
}))

vi.mock('@/composables/useRemainingDays.js', () => ({
  getCandidateRemainingDaysClass: (days) => {
    if (days === null || days === undefined) return 'text-gray-400'
    if (days < 0) return 'text-gray-700'
    if (days === 0) return 'text-green-600 font-medium'
    if (days <= 30) return 'text-orange-600 font-medium'
    return 'text-yellow-600'
  },
  formatRemainingDays: (days) => {
    if (days === null || days === undefined) return '-'
    if (days < 0) return `เกิน ${Math.abs(days)} วัน`
    if (days === 0) return 'ครบกำหนดวันนี้'
    return `${days} วัน`
  },
}))

const CandidateListsPage = (await import('@/pages/CandidateListsPage.vue')).default

const overviewPayload = {
  success: true,
  summary: {
    general_total: 12,
    academic_total: 8,
    support_total: 5,
    management_total: 3,
    qualified_total: 4,
    near_qualified_total: 6,
    not_yet_total: 18,
    check_data_total: 2,
  },
  by_level: {},
  top5: [
    {
      personnelId: 1,
      name: 'สมชาย ใจดี',
      currentPosition: 'นักวิเคราะห์นโยบาย',
      currentLevelName: 'ชำนาญงาน',
      qualificationDate: '15/08/2568',
      remainingDays: 10,
      status: 'check_data',
    },
  ],
}

const byLevelPayload = {
  success: true,
  data: [
    {
      personnelId: 10,
      name: 'สมหญิง รักงาน',
      currentPosition: 'นักวิเคราะห์',
      currentLevelCode: 'O2',
      currentLevelName: 'ชำนาญงาน',
      levelStartDate: '01/01/2562',
      qualificationDate: '01/01/2569',
      remainingDays: 200,
      status: 'NOT_MET',
      department: 'กลุ่มงาน A',
      supportiveDays: 0,
      equivalenceDays: 0,
      diverseStatus: null,
    },
  ],
  summary: { total: 1 },
  pagination: { total: 1, limit: 20, offset: 0, has_more: false },
}

describe('CandidateListsPage', () => {
  beforeEach(() => {
    mockFetchOverview.mockReset()
    mockFetchByLevel.mockReset()
  })

  it('renders overview stat cards and top-5 table after fetch', async () => {
    mockFetchOverview.mockResolvedValue(overviewPayload)
    const wrapper = mount(CandidateListsPage, { props: { section: 'overview' } })
    await flushPromises()
    await nextTick()

    expect(mockFetchOverview).toHaveBeenCalledTimes(1)
    // 4 category stat cards + 4 status stat cards = 8 StatCard values rendered
    const html = wrapper.html()
    expect(html).toContain('12') // generalTotal
    expect(html).toContain('8')  // academicTotal
    expect(html).toContain('5')  // supportiveTotal
    expect(html).toContain('3')  // managementTotal
    // top5 table
    expect(html).toContain('สมชาย ใจดี')
    expect(html).toContain('นักวิเคราะห์นโยบาย')
    expect(wrapper.text()).toContain('ใกล้ครบกำหนดที่สุด')
  })

  it('shows overview error state with retry button', async () => {
    mockFetchOverview.mockRejectedValueOnce(new Error('เซิร์ฟเวอร์ล่ม'))
    const wrapper = mount(CandidateListsPage, { props: { section: 'overview' } })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('เกิดข้อผิดพลาด')
    expect(wrapper.text()).toContain('เซิร์ฟเวอร์ล่ม')

    mockFetchOverview.mockResolvedValueOnce(overviewPayload)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    await nextTick()

    expect(mockFetchOverview).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('สมชาย ใจดี')
  })

  it('shows empty row when top5 is empty', async () => {
    mockFetchOverview.mockResolvedValue({ ...overviewPayload, top5: [] })
    const wrapper = mount(CandidateListsPage, { props: { section: 'overview' } })
    await flushPromises()

    expect(wrapper.text()).toContain('ไม่พบข้อมูล')
  })

  it('renders sub-tabs for general section and loads first tab on mount', async () => {
    mockFetchByLevel.mockResolvedValue(byLevelPayload)
    const wrapper = mount(CandidateListsPage, { props: { section: 'general' } })
    await flushPromises()
    await nextTick()

    // sub-tab buttons: O2 ชำนาญงาน, O3 อาวุโส
    const tabButtons = wrapper.findAll('button')
    const tabLabels = tabButtons.map((b) => b.text())
    expect(tabLabels).toContain('ชำนาญงาน')
    expect(tabLabels).toContain('อาวุโส')

    // first tab (O2) auto-loaded
    expect(mockFetchByLevel).toHaveBeenCalledWith('O2', expect.objectContaining({ search: '', limit: 20, offset: 0 }))
    expect(wrapper.text()).toContain('สมหญิง รักงาน')
  })

  it('switching sub-tab resets offset+search and fetches new level', async () => {
    mockFetchByLevel.mockResolvedValue(byLevelPayload)
    const wrapper = mount(CandidateListsPage, { props: { section: 'academic' } })
    await flushPromises()

    // first tab K2 auto-loaded
    expect(mockFetchByLevel).toHaveBeenLastCalledWith('K2', expect.objectContaining({ offset: 0, search: '' }))

    // click K3
    const k3Btn = wrapper.findAll('button').find((b) => b.text() === 'ชำนาญการพิเศษ')
    await k3Btn.trigger('click')
    await flushPromises()

    expect(wrapper.vm.activeSubTab).toBe('K3')
    expect(mockFetchByLevel).toHaveBeenLastCalledWith('K3', expect.objectContaining({ offset: 0, search: '' }))
  })

  it('debounces search input by 300ms then resets offset and fetches', async () => {
    vi.useFakeTimers()
    mockFetchByLevel.mockResolvedValue(byLevelPayload)
    const wrapper = mount(CandidateListsPage, { props: { section: 'general' } })
    await flushPromises()
    mockFetchByLevel.mockClear()

    await wrapper.get('input[placeholder="ค้นหาชื่อ หรือตำแหน่ง..."]').setValue('สม')
    // not yet called (debounce)
    expect(mockFetchByLevel).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)
    expect(mockFetchByLevel).toHaveBeenCalledTimes(1)
    expect(mockFetchByLevel).toHaveBeenCalledWith('O2', expect.objectContaining({ search: 'สม', offset: 0 }))
    vi.useRealTimers()
  })

  it('shows error state with retry for sub-tab fetch', async () => {
    mockFetchByLevel.mockRejectedValueOnce(new Error('network down'))
    const wrapper = mount(CandidateListsPage, { props: { section: 'general' } })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('network down')

    mockFetchByLevel.mockResolvedValueOnce(byLevelPayload)
    // retry button is the first button in the EmptyState slot
    const retryBtn = wrapper.findAll('button').find((b) => b.text() === 'ลองใหม่')
    await retryBtn.trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('สมหญิง รักงาน')
  })

  it('opens and closes the view modal via the row eye button and backdrop', async () => {
    mockFetchByLevel.mockResolvedValue(byLevelPayload)
    const wrapper = mount(CandidateListsPage, {
      props: { section: 'general' },
      attachTo: document.body,
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.vm.showViewModal).toBe(false)
    // eye button is the last button in each row
    const eyeBtn = wrapper.findAll('button').find((b) => b.attributes('title') === 'ดูรายละเอียด')
    await eyeBtn.trigger('click')
    await nextTick()
    expect(wrapper.vm.showViewModal).toBe(true)
    expect(wrapper.vm.viewingRow?.name).toBe('สมหญิง รักงาน')

    // close via backdrop (the absolute inset div)
    const backdrop = document.body.querySelector('.fixed.inset-0.z-50 .absolute.inset-0')
    expect(backdrop).toBeTruthy()
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    await flushPromises()
    expect(wrapper.vm.showViewModal).toBe(false)

    wrapper.unmount()
  })

  it('changes page via PaginationBar and fetches with new offset', async () => {
    mockFetchByLevel.mockResolvedValue({
      ...byLevelPayload,
      pagination: { total: 50, limit: 20, offset: 0, has_more: true },
    })
    const wrapper = mount(CandidateListsPage, { props: { section: 'general' } })
    await flushPromises()
    mockFetchByLevel.mockClear()

    // PaginationBar emits update:offset
    wrapper.findComponent({ name: 'PaginationBar' }).vm.$emit('update:offset', 20)
    await flushPromises()

    expect(wrapper.vm.pagination.offset).toBe(20)
    expect(mockFetchByLevel).toHaveBeenCalledWith('O2', expect.objectContaining({ offset: 20 }))
  })

  it('falls back to overview config when section is unknown (no fetch fired)', async () => {
    const wrapper = mount(CandidateListsPage, { props: { section: 'unknown' } })
    await flushPromises()
    await nextTick()

    // unknown section -> currentConfig falls back to overview label,
    // but onMounted only fetches overview when section === 'overview' exactly,
    // so no fetch fires (subTabConfig[unknown] is undefined -> no sub-tab load either)
    expect(mockFetchOverview).not.toHaveBeenCalled()
    expect(mockFetchByLevel).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('ภาพรวมบัญชีรายชื่อผู้มีคุณสมบัติ')
  })

  it('reloads when section prop changes from overview to a sub-tab section', async () => {
    mockFetchOverview.mockResolvedValue(overviewPayload)
    mockFetchByLevel.mockResolvedValue(byLevelPayload)
    const wrapper = mount(CandidateListsPage, { props: { section: 'overview' } })
    await flushPromises()

    expect(mockFetchOverview).toHaveBeenCalledTimes(1)
    expect(mockFetchByLevel).not.toHaveBeenCalled()

    await wrapper.setProps({ section: 'support' })
    await flushPromises()

    // watcher resets state and triggers fetch for first sub-tab (M1)
    expect(wrapper.vm.searchQuery).toBe('')
    expect(wrapper.vm.pagination.offset).toBe(0)
    expect(mockFetchByLevel).toHaveBeenCalledWith('M1', expect.objectContaining({ offset: 0, search: '' }))
  })

  it('loads management section with S1/S2 tabs', async () => {
    mockFetchByLevel.mockResolvedValue(byLevelPayload)
    const wrapper = mount(CandidateListsPage, { props: { section: 'management' } })
    await flushPromises()
    await nextTick()

    const tabLabels = wrapper.findAll('button').map((b) => b.text())
    expect(tabLabels).toContain('บริหารต้น')
    expect(tabLabels).toContain('บริหารสูง')
    expect(mockFetchByLevel).toHaveBeenCalledWith('S1', expect.objectContaining({ offset: 0, search: '' }))
    expect(wrapper.text()).toContain('สายงานบริหาร')
  })

  it('shows empty by-level table when data is empty', async () => {
    mockFetchByLevel.mockResolvedValue({
      ...byLevelPayload,
      data: [],
      summary: { total: 0 },
      pagination: { total: 0, limit: 20, offset: 0, has_more: false },
    })
    const wrapper = mount(CandidateListsPage, { props: { section: 'general' } })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('ไม่พบข้อมูล')
    expect(wrapper.text()).toContain('ไม่พบรายชื่อผู้มีคุณสมบัติในระดับนี้')
  })

  it('renders supportive/equivalence days and diverse status in table and modal', async () => {
    mockFetchByLevel.mockResolvedValue({
      ...byLevelPayload,
      data: [
        {
          ...byLevelPayload.data[0],
          supportiveDays: 15,
          equivalenceDays: 30,
          diverseStatus: 'qualified',
          department: 'กองบริหาร',
        },
      ],
    })
    const wrapper = mount(CandidateListsPage, {
      props: { section: 'general' },
      attachTo: document.body,
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('15 วัน')
    expect(wrapper.text()).toContain('30 วัน')
    expect(wrapper.text()).toContain('ถึงเกณฑ์')

    const eyeBtn = wrapper.findAll('button').find((b) => b.attributes('title') === 'ดูรายละเอียด')
    await eyeBtn.trigger('click')
    await nextTick()

    expect(document.body.textContent).toContain('กองบริหาร')
    expect(document.body.textContent).toContain('15 วัน')
    expect(document.body.textContent).toContain('30 วัน')

    const closeBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent.trim() === 'ปิด')
    expect(closeBtn).toBeTruthy()
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(wrapper.vm.showViewModal).toBe(false)

    wrapper.unmount()
  })

  it('defaults overview totals to 0 when summary fields are missing', async () => {
    mockFetchOverview.mockResolvedValue({
      success: true,
      summary: {},
      by_level: {},
      top5: [],
    })
    const wrapper = mount(CandidateListsPage, { props: { section: 'overview' } })
    await flushPromises()
    await nextTick()

    expect(wrapper.vm.overviewData).toMatchObject({
      generalTotal: 0,
      academicTotal: 0,
      supportiveTotal: 0,
      managementTotal: 0,
      qualifiedTotal: 0,
      nearQualifiedTotal: 0,
      notYetTotal: 0,
      checkDataTotal: 0,
    })
  })

  it('uses generic overview error when reject has no message', async () => {
    mockFetchOverview.mockRejectedValueOnce({})
    const wrapper = mount(CandidateListsPage, { props: { section: 'overview' } })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('ไม่สามารถโหลดข้อมูลภาพรวมได้')
  })

  it('reloads overview when section changes back from a sub-tab', async () => {
    mockFetchByLevel.mockResolvedValue(byLevelPayload)
    mockFetchOverview.mockResolvedValue(overviewPayload)
    const wrapper = mount(CandidateListsPage, { props: { section: 'general' } })
    await flushPromises()

    mockFetchOverview.mockClear()
    await wrapper.setProps({ section: 'overview' })
    await flushPromises()

    expect(mockFetchOverview).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('สมชาย ใจดี')
  })
})
