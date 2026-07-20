import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useApi ก่อน import useMultiplier
const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDel = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, post: mockPost, put: mockPut, del: mockDel }),
}))

const { useMultiplier } = await import('@/composables/useMultiplier.js')

const serverAreaRow = {
  area_multiplier_id: 8,
  province: 'สตูล',
  district: 'ควนโดน',
  area_label: 'สตูล / ควนโดน',
  basis_type: 'MARTIAL_LAW',
  multiplier_ratio: 150,
  effective_start_date: '2004-01-26',
  effective_end_date: null,
  effective_start_date_thai: '26 ม.ค. 2547',
  effective_end_date_thai: null,
  legal_reference: 'ประกาศทดสอบ',
  source_reference: null,
  is_active: 1,
  source_pending: false,
}

const serverRow = {
  multiplier_id: 7,
  personnel_id: 3,
  full_name: 'สมชาย ใจดี',
  area_multiplier_id: 8,
  province: 'สตูล',
  district: 'ควนโดน',
  area_label: 'สตูล / ควนโดน',
  basis_type: 'MARTIAL_LAW',
  start_date: '2020-01-01',
  end_date: '2020-12-31',
  start_date_thai: '1 ม.ค. 2563',
  end_date_thai: '31 ธ.ค. 2563',
  eligible_start_date: '2020-01-01',
  eligible_end_date: '2020-12-31',
  eligible_start_date_thai: '1 ม.ค. 2563',
  eligible_end_date_thai: '31 ธ.ค. 2563',
  service_days: 366,
  eligible_days: 366,
  multiplier_ratio: 150,
  effective_days: 549,
  bonus_days: 183,
  net_years: 1,
  net_months: 6,
  net_day_remainder: 0,
  proof_reference: 'คส.1/2563',
  description: '',
}

describe('useMultiplier — list / CRUD', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDel.mockReset()
  })

  it('fetchList calls GET /multiplier with limit/offset and maps rows', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [serverRow],
      summary: { total: 1 },
      pagination: { total: 1, limit: 10, offset: 5, has_more: false },
    })

    const { fetchList } = useMultiplier()
    const result = await fetchList({ limit: 10, offset: 5 })

    const url = mockGet.mock.calls[0][0]
    expect(url).toContain('/multiplier?')
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=5')
    expect(result.data[0]).toMatchObject({
      multiplierId: 7,
      personnelId: 3,
      fullName: 'สมชาย ใจดี',
      areaLabel: 'สตูล / ควนโดน',
      effectiveDays: 549,
      bonusDays: 183,
    })
    expect(result.pagination.total).toBe(1)
  })

  it('fetchList uses default pagination and empty data when API omits fields', async () => {
    mockGet.mockResolvedValue({ success: true })

    const { fetchList } = useMultiplier()
    const result = await fetchList()

    expect(result.data).toEqual([])
    expect(result.summary).toEqual({})
    expect(result.pagination).toMatchObject({ total: 0, limit: 20, offset: 0, has_more: false })
  })

  it('fetchAreas passes province/district/active_only and maps areas', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [serverAreaRow],
      summary: { total: 1, source_pending: 0 },
    })

    const { fetchAreas } = useMultiplier()
    const result = await fetchAreas({ province: 'สตูล', district: 'ควนโดน', activeOnly: true })

    const url = mockGet.mock.calls[0][0]
    expect(url).toContain('/multiplier/areas?')
    expect(url).toContain('province=')
    expect(url).toContain('district=')
    expect(url).toContain('active_only=1')
    expect(result.data[0]).toMatchObject({
      areaMultiplierId: 8,
      province: 'สตูล',
      isActive: true,
      sourcePending: false,
    })
  })

  it('fetchAreas omits filters and sets active_only=0 when inactive included', async () => {
    mockGet.mockResolvedValue({ success: true, data: [] })

    const { fetchAreas } = useMultiplier()
    await fetchAreas({ activeOnly: false })

    const url = mockGet.mock.calls[0][0]
    expect(url).not.toContain('province=')
    expect(url).not.toContain('district=')
    expect(url).toContain('active_only=0')
  })

  it('create posts to /multiplier', async () => {
    mockPost.mockResolvedValue({ success: true, multiplier_id: 7 })
    const payload = { personnel_id: 3, area_multiplier_id: 8 }

    const { create } = useMultiplier()
    const result = await create(payload)

    expect(mockPost).toHaveBeenCalledWith('/multiplier', payload)
    expect(result.multiplier_id).toBe(7)
  })

  it('update puts to /multiplier/:id and maps returned row', async () => {
    mockPut.mockResolvedValue({ success: true, data: serverRow, computed: { bonus_days: 183 } })

    const { update } = useMultiplier()
    const result = await update(7, { proof_reference: 'คส.1/2563' })

    expect(mockPut).toHaveBeenCalledWith('/multiplier/7', { proof_reference: 'คส.1/2563' })
    expect(result.data.multiplierId).toBe(7)
    expect(result.computed.bonus_days).toBe(183)
  })

  it('remove calls DELETE /multiplier/:id', async () => {
    mockDel.mockResolvedValue({ success: true })

    const { remove } = useMultiplier()
    const result = await remove(7)

    expect(mockDel).toHaveBeenCalledWith('/multiplier/7')
    expect(result.success).toBe(true)
  })
})

describe('useMultiplier — area admin', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDel.mockReset()
  })

  it('createArea posts to /multiplier/areas and maps returned row to camelCase', async () => {
    mockPost.mockResolvedValue({ success: true, area_multiplier_id: 8, data: serverAreaRow })

    const { createArea } = useMultiplier()
    const result = await createArea({
      province: 'สตูล',
      district: 'ควนโดน',
      basis_type: 'MARTIAL_LAW',
      multiplier_ratio: 150,
      effective_start_date: '2004-01-26',
    })

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith(
      '/multiplier/areas',
      expect.objectContaining({ province: 'สตูล', multiplier_ratio: 150 }),
    )
    expect(result.areaMultiplierId).toBe(8)
    expect(result.data.areaMultiplierId).toBe(8)
    expect(result.data.multiplierRatio).toBe(150)
    expect(result.data.isActive).toBe(true)
  })

  it('setAreaStatus puts is_active 0 when deactivating', async () => {
    mockPut.mockResolvedValue({ success: true, data: { ...serverAreaRow, is_active: 0 } })

    const { setAreaStatus } = useMultiplier()
    const result = await setAreaStatus(8, false)

    expect(mockPut).toHaveBeenCalledWith('/multiplier/areas/8/status', { is_active: 0 })
    expect(result.data.isActive).toBe(false)
  })

  it('setAreaStatus puts is_active 1 when reactivating', async () => {
    mockPut.mockResolvedValue({ success: true, data: serverAreaRow })

    const { setAreaStatus } = useMultiplier()
    const result = await setAreaStatus(8, true)

    expect(mockPut).toHaveBeenCalledWith('/multiplier/areas/8/status', { is_active: 1 })
    expect(result.data.isActive).toBe(true)
  })
})
