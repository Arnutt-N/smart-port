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

  it('fetchOverview calls the overview endpoint', async () => {
    mockGet.mockResolvedValue({ success: true, summary: {}, by_level: {}, top5: [] })

    const { fetchOverview } = useCandidates()
    await fetchOverview()

    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet.mock.calls[0][0]).toBe('/candidates/overview')
  })

  it('fetchOverview passes summary through and maps top5 rows', async () => {
    mockGet.mockResolvedValue({
      success: true,
      summary: {
        general_total: 2,
        academic_total: 5,
        qualified_total: 6,
        near_qualified_total: 0,
        not_yet_total: 1,
        check_data_total: 0,
      },
      by_level: { K2: { total: 3 } },
      top5: [{
        personnel_id: 7,
        full_name: 'สมหญิง ขยัน',
        current_position: 'เจ้าพนักงานธุรการ',
        current_level_code: 'O1',
        current_level_name: 'ปฏิบัติงาน',
        level_start_date_thai: '1 ม.ค. 2566',
        qualification_date_thai: '1 ม.ค. 2569',
        remaining_days: 10,
        status: 'not_yet',
        department: 'กองกลาง',
        supportive_days: 15,
        equivalence_days: 30,
        diverse_status: 'DIFF_PASS',
        target_level: 'O2',
      }],
    })

    const { fetchOverview } = useCandidates()
    const result = await fetchOverview()

    expect(result.summary.general_total).toBe(2)
    expect(result.summary.qualified_total).toBe(6)
    expect(result.byLevel.K2.total).toBe(3)
    expect(result.top5).toHaveLength(1)
    expect(result.top5[0].name).toBe('สมหญิง ขยัน')
    expect(result.top5[0].currentLevelName).toBe('ปฏิบัติงาน')
    expect(result.top5[0].remainingDays).toBe(10)
    expect(result.top5[0].status).toBe('NEAR_MET')
    expect(result.top5[0].supportiveDays).toBe(15)
    expect(result.top5[0].equivalenceDays).toBe(30)
    expect(result.top5[0].diverseStatus).toBe('DIFF_PASS')
  })

  it('fetchOverview tolerates missing fields in response', async () => {
    mockGet.mockResolvedValue({ success: true })

    const { fetchOverview } = useCandidates()
    const result = await fetchOverview()

    expect(result.summary).toEqual({})
    expect(result.byLevel).toEqual({})
    expect(result.top5).toEqual([])
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
      status: 'NOT_MET',
      department: 'กองบริหาร',
    })
  })
})
