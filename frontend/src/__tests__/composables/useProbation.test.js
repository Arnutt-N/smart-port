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
      status: 'IN_PROGRESS',
      totalTasks: 5,
      completedTasks: 2,
    })
  })
})
