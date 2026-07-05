import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useApi ก่อน import useMultiplier
const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, post: mockPost, put: mockPut }),
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

describe('useMultiplier — area admin', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
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
