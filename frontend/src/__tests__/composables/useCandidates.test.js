import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useApi before importing useCandidates
const mockGet = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet }),
}))

const { useCandidates } = await import('@/composables/useCandidates.js')

describe('useCandidates', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('returns fetchByLevel function', () => {
    const { fetchByLevel } = useCandidates()
    expect(typeof fetchByLevel).toBe('function')
  })

  it('calls API with correct URL and default params', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [],
      summary: {},
      pagination: { total: 0 },
    })

    const { fetchByLevel } = useCandidates()
    await fetchByLevel('O2')

    expect(mockGet).toHaveBeenCalledTimes(1)
    const url = mockGet.mock.calls[0][0]
    expect(url).toContain('/candidates/O2')
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=0')
  })

  it('passes search param when provided', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [],
      summary: {},
      pagination: { total: 0 },
    })

    const { fetchByLevel } = useCandidates()
    await fetchByLevel('K3', { search: 'สมชาย', limit: 10, offset: 20 })

    const url = mockGet.mock.calls[0][0]
    expect(url).toContain('search=%E0%B8%AA%E0%B8%A1%E0%B8%8A%E0%B8%B2%E0%B8%A2')
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=20')
  })

  it('maps snake_case API response to camelCase', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{
        personnel_id: 1,
        full_name: 'สมชาย ใจดี',
        current_position: 'นักวิชาการ',
        current_level_code: 'K2',
        current_level_name: 'ชำนาญการ',
        level_start_date_thai: '1 ม.ค. 2567',
        qualification_date_thai: '1 ม.ค. 2568',
        remaining_days: 45,
        status: 'qualified',
        department: 'กองบริหาร',
      }],
      summary: { total: 1 },
      pagination: { total: 1 },
    })

    const { fetchByLevel } = useCandidates()
    const result = await fetchByLevel('K3')

    expect(result.data[0]).toEqual({
      personnelId: 1,
      name: 'สมชาย ใจดี',
      currentPosition: 'นักวิชาการ',
      currentLevelCode: 'K2',
      currentLevelName: 'ชำนาญการ',
      levelStartDate: '1 ม.ค. 2567',
      qualificationDate: '1 ม.ค. 2568',
      remainingDays: 45,
      status: 'qualified',
      department: 'กองบริหาร',
    })
  })
})
