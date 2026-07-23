import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet }),
}))

const { useWorkResults } = await import('@/composables/useWorkResults.js')

describe('useWorkResults', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('exposes read-only functions', () => {
    const api = useWorkResults()
    expect(typeof api.fetchList).toBe('function')
    expect(typeof api.fetchDetail).toBe('function')
    expect(api.create).toBeUndefined()
  })

  it('fetchList passes status filter and maps rows', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{
        proposal_id: 1, servant_id: 2, servant_name: 'ก', proposal_type: 'improvement',
        title: 'ผลงาน', description: 'd', impact_description: 'i', quantitative_result: '10',
        result_unit: 'ครั้ง', submission_date: '2024-01-01', evaluation_score: 88,
        status: 'approved', approval_level: 'department', created_at: '2024-01-02',
      }],
      pagination: { total: 1 },
    })
    const { fetchList } = useWorkResults()
    const result = await fetchList({ search: 'x', status: 'approved', limit: 5, offset: 0 })
    const url = mockGet.mock.calls[0][0]
    expect(url).toContain('/work-results')
    expect(url).toContain('status=approved')
    expect(result.data[0].proposalId).toBe(1)
    expect(result.data[0].evaluationScore).toBe(88)
    expect(result.data[0].approvalLevel).toBe('department')
  })

  it('fetchDetail maps single row', async () => {
    mockGet.mockResolvedValue({ success: true, data: { proposal_id: 5, title: 'T' } })
    const { fetchDetail } = useWorkResults()
    const result = await fetchDetail(5)
    expect(mockGet.mock.calls[0][0]).toBe('/work-results/5')
    expect(result.data.proposalId).toBe(5)
    expect(result.data.title).toBe('T')
  })

  it('fetchDetail returns null when no data', async () => {
    mockGet.mockResolvedValue({ success: true, data: null })
    const { fetchDetail } = useWorkResults()
    const result = await fetchDetail(9)
    expect(result.data).toBeNull()
  })
})
