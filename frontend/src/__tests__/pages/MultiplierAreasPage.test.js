import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetchAreas = vi.fn()
const mockCreateArea = vi.fn()
const mockSetAreaStatus = vi.fn()

vi.mock('@/composables/useMultiplier.js', () => ({
  useMultiplier: () => ({
    fetchAreas: mockFetchAreas,
    createArea: mockCreateArea,
    setAreaStatus: mockSetAreaStatus,
  }),
}))

const MultiplierAreasPage = (await import('@/pages/MultiplierAreasPage.vue')).default

const activeArea = {
  areaMultiplierId: 1,
  province: 'ยะลา',
  district: null,
  areaLabel: 'ยะลา / ทั้งจังหวัด',
  basisType: 'EMERGENCY_DECREE',
  multiplierRatio: 200,
  effectiveStartDateThai: '1 ม.ค. 2563',
  effectiveEndDateThai: null,
  legalReference: '',
  sourceReference: '',
  isActive: true,
  sourcePending: true,
}

const inactiveArea = {
  areaMultiplierId: 2,
  province: 'นราธิวาส',
  district: 'เบตง',
  areaLabel: 'นราธิวาส / เบตง',
  basisType: 'MARTIAL_LAW',
  multiplierRatio: 150,
  effectiveStartDateThai: '1 ม.ค. 2560',
  effectiveEndDateThai: '31 ธ.ค. 2562',
  legalReference: 'ประกาศ กศ.123',
  sourceReference: 'หนังสือเวียน',
  isActive: false,
  sourcePending: false,
}

function resolvedData(areas = [activeArea, inactiveArea]) {
  mockFetchAreas.mockResolvedValue({ data: areas })
}

async function mountPage() {
  const wrapper = mount(MultiplierAreasPage, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  await vi.waitFor(() => {
    expect(mockFetchAreas).toHaveBeenCalled()
  })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('MultiplierAreasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolvedData()
    window.confirm = vi.fn(() => true)
  })

  it('loads areas on mount and renders labels, ratios and statuses', async () => {
    const wrapper = await mountPage()
    expect(mockFetchAreas).toHaveBeenCalledWith({ activeOnly: false })
    expect(wrapper.text()).toContain('ยะลา / ทั้งจังหวัด')
    expect(wrapper.text()).toContain('พ.ร.ก.ฉุกเฉิน')
    expect(wrapper.text()).toContain('กฎอัยการศึก')
    expect(wrapper.text()).toContain('200%')
    expect(wrapper.text()).toContain('ไม่กำหนด')
    expect(wrapper.text()).toContain('รอเอกสาร')
    expect(wrapper.text()).toContain('ยืนยันแล้ว')
    expect(wrapper.text()).toContain('ปิดใช้งาน')
  })

  it('computes summary counts for active and source-pending areas', async () => {
    const wrapper = await mountPage()
    expect(wrapper.vm.activeCount).toBe(1)
    expect(wrapper.vm.pendingCount).toBe(1)
    expect(wrapper.vm.basisOptions).toEqual(['EMERGENCY_DECREE', 'MARTIAL_LAW'])
  })

  it('shows error state when loading fails', async () => {
    mockFetchAreas.mockRejectedValue(new Error('โหลดพื้นที่ไม่สำเร็จ'))
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('โหลดพื้นที่ไม่สำเร็จ'))
  })

  it('toggle status confirms then calls setAreaStatus and refetches', async () => {
    const wrapper = await mountPage()
    mockSetAreaStatus.mockResolvedValue({ success: true })
    mockFetchAreas.mockClear()

    await wrapper.vm.toggleStatus(activeArea)

    expect(window.confirm).toHaveBeenCalled()
    expect(mockSetAreaStatus).toHaveBeenCalledWith(1, false)
    expect(mockFetchAreas).toHaveBeenCalled()
    expect(wrapper.vm.togglingId).toBeNull()
  })

  it('toggle status does nothing when user cancels confirm', async () => {
    window.confirm = vi.fn(() => false)
    const wrapper = await mountPage()

    await wrapper.vm.toggleStatus(activeArea)

    expect(mockSetAreaStatus).not.toHaveBeenCalled()
  })

  it('shows action error banner when toggle fails', async () => {
    const wrapper = await mountPage()
    mockSetAreaStatus.mockRejectedValue(new Error('เปลี่ยนสถานะไม่สำเร็จ'))

    await wrapper.vm.toggleStatus(inactiveArea)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('เปลี่ยนสถานะไม่สำเร็จ')
  })

  it('blocks submit when required fields are missing', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    await wrapper.vm.handleSubmit()

    expect(mockCreateArea).not.toHaveBeenCalled()
    expect(wrapper.vm.showModal).toBe(true)
    expect(wrapper.vm.formErrors.province).toBe(true)
    expect(wrapper.vm.formErrors.basis_type).toBe(true)
    expect(wrapper.vm.formErrors.effective_start_date).toBe(true)
  })

  it('blocks submit when end date is before start date', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    wrapper.vm.formData = {
      province: 'ยะลา',
      district: '',
      basis_type: 'EMERGENCY_DECREE',
      multiplier_ratio: 200,
      effective_start_date: '2026-01-01',
      effective_end_date: '2025-01-01',
      legal_reference: '',
      source_reference: '',
    }
    await wrapper.vm.handleSubmit()

    expect(mockCreateArea).not.toHaveBeenCalled()
    expect(wrapper.vm.formErrors.effective_end_date).toBe(true)
  })

  it('blocks submit when ratio is out of range', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    wrapper.vm.formData = {
      ...wrapper.vm.formData,
      province: 'ยะลา',
      basis_type: 'EMERGENCY_DECREE',
      multiplier_ratio: 50,
      effective_start_date: '2026-01-01',
      effective_end_date: '',
    }
    await wrapper.vm.handleSubmit()

    expect(mockCreateArea).not.toHaveBeenCalled()
    expect(wrapper.vm.formErrors.multiplier_ratio).toBe(true)
  })

  it('creates an area with numeric ratio and refreshes', async () => {
    const wrapper = await mountPage()
    mockCreateArea.mockResolvedValue({ success: true })
    mockFetchAreas.mockClear()

    wrapper.vm.openCreateModal()
    wrapper.vm.formData = {
      province: 'ปัตตานี',
      district: '',
      basis_type: 'EMERGENCY_DECREE',
      multiplier_ratio: '200',
      effective_start_date: '2026-01-01',
      effective_end_date: '',
      legal_reference: 'พ.ร.ก. ฉบับที่ 1',
      source_reference: '',
    }
    await wrapper.vm.handleSubmit()

    expect(mockCreateArea).toHaveBeenCalledWith(
      expect.objectContaining({ province: 'ปัตตานี', multiplier_ratio: 200 }),
    )
    expect(wrapper.vm.showModal).toBe(false)
    expect(mockFetchAreas).toHaveBeenCalled()
  })

  it('keeps modal open with submit error when create fails', async () => {
    const wrapper = await mountPage()
    mockCreateArea.mockRejectedValue(new Error('พื้นที่ซ้ำ'))

    wrapper.vm.openCreateModal()
    wrapper.vm.formData = {
      ...wrapper.vm.formData,
      province: 'ยะลา',
      basis_type: 'EMERGENCY_DECREE',
      effective_start_date: '2026-01-01',
    }
    await wrapper.vm.handleSubmit()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.showModal).toBe(true)
    expect(wrapper.text()).toContain('พื้นที่ซ้ำ')
  })

  it('closes modal via Escape key', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openCreateModal()
    await wrapper.vm.$nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.showModal).toBe(false)
  })
})
