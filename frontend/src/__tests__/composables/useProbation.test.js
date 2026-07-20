import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet }),
}))

const { useProbation } = await import('@/composables/useProbation.js')

describe('useProbation', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('returns fetchList function', () => {
    const { fetchList } = useProbation()
    expect(typeof fetchList).toBe('function')
  })

  it('calls API with correct URL and default params', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [],
      summary: {},
      pagination: { total: 0 },
    })

    const { fetchList } = useProbation()
    await fetchList()

    expect(mockGet).toHaveBeenCalledTimes(1)
    const url = mockGet.mock.calls[0][0]
    expect(url).toContain('/probation')
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=0')
  })

  it('passes custom search/limit/offset params', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [],
      summary: {},
      pagination: { total: 0 },
    })

    const { fetchList } = useProbation()
    await fetchList({ search: 'ทดสอบ', limit: 5, offset: 10 })

    const url = mockGet.mock.calls[0][0]
    expect(url).toContain('search=')
    expect(url).toContain('limit=5')
    expect(url).toContain('offset=10')
  })

  it('maps snake_case API response to camelCase', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{
        enrollment_id: 10,
        personnel_id: 5,
        full_name: 'สมหญิง รักดี',
        position_name: 'นักจัดการ',
        department: 'กองคลัง',
        start_date_thai: '1 เม.ย. 2567',
        end_date_thai: '1 ต.ค. 2567',
        remaining_days: 120,
        status: 'IN_PROGRESS',
        total_tasks: 5,
        completed_tasks: 2,
      }],
      summary: { total: 1 },
      pagination: { total: 1 },
    })

    const { fetchList } = useProbation()
    const result = await fetchList()

    expect(result.data[0]).toEqual({
      enrollmentId: 10,
      personnelId: 5,
      name: 'สมหญิง รักดี',
      position: 'นักจัดการ',
      department: 'กองคลัง',
      startDate: '1 เม.ย. 2567',
      endDate: '1 ต.ค. 2567',
      remainingDays: 120,
      status: 'NOT_DUE',
      totalTasks: 5,
      completedTasks: 2,
    })
  })

  it('passes through terminal backend statuses', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [
        { enrollment_id: 1, personnel_id: 1, full_name: 'A', status: 'COMPLETED', remaining_days: 0 },
        { enrollment_id: 2, personnel_id: 2, full_name: 'B', status: 'FAILED', remaining_days: -1 },
        { enrollment_id: 3, personnel_id: 3, full_name: 'C', status: 'EXTENDED', remaining_days: 10 },
      ],
      pagination: {},
    })

    const { fetchList } = useProbation()
    const result = await fetchList()

    expect(result.data.map((r) => r.status)).toEqual(['COMPLETED', 'FAILED', 'EXTENDED'])
  })

  it('computes IN_PROGRESS display status from remaining days', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [
        { enrollment_id: 1, personnel_id: 1, full_name: 'A', status: 'IN_PROGRESS', remaining_days: null },
        { enrollment_id: 2, personnel_id: 2, full_name: 'B', status: 'IN_PROGRESS', remaining_days: 15 },
        { enrollment_id: 3, personnel_id: 3, full_name: 'C', status: 'IN_PROGRESS', remaining_days: 0 },
        { enrollment_id: 4, personnel_id: 4, full_name: 'D', status: 'IN_PROGRESS', remaining_days: -3 },
      ],
      pagination: {},
    })

    const { fetchList } = useProbation()
    const result = await fetchList()

    expect(result.data.map((r) => r.status)).toEqual(['NOT_DUE', 'NEAR_DEADLINE', 'READY', 'OVERDUE'])
  })

  it('returns empty data array when API omits data field', async () => {
    mockGet.mockResolvedValue({ success: true, pagination: {} })
    const { fetchList } = useProbation()
    const result = await fetchList()
    expect(result.data).toEqual([])
  })
})
