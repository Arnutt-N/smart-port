import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet }),
}))

const { useRetirement } = await import('@/composables/useRetirement.js')

describe('useRetirement', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('exposes fetchList', () => {
    expect(typeof useRetirement().fetchList).toBe('function')
  })

  it('passes search/within/pagination params and maps rows', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{
        servant_id: 3, employee_id: 'EMP003', full_name: 'สมศักดิ์',
        retirement_date: '2030-09-30', servant_status: 'active', remaining_days: 120,
      }],
      pagination: { total: 1 },
    })
    const { fetchList } = useRetirement()
    const result = await fetchList({ search: 'ก', within: 12, limit: 5, offset: 0 })
    const url = mockGet.mock.calls[0][0]
    expect(url).toContain('/retirement')
    expect(url).toContain('within=12')
    expect(result.data[0]).toEqual({
      servantId: 3, employeeId: 'EMP003', fullName: 'สมศักดิ์',
      retirementDate: '2030-09-30', servantStatus: 'active', remainingDays: 120,
    })
  })

  it('keeps null remainingDays as null', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{ servant_id: 1, remaining_days: null }],
      pagination: {},
    })
    const { fetchList } = useRetirement()
    const result = await fetchList()
    expect(result.data[0].remainingDays).toBeNull()
  })
})
