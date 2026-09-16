import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDel = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, post: mockPost, put: mockPut, del: mockDel }),
}))

const { useWorkResults } = await import('@/composables/useWorkResults.js')

describe('useWorkResults', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDel.mockReset()
  })

  it('exposes CRUD functions', () => {
    const api = useWorkResults()
    expect(typeof api.fetchList).toBe('function')
    expect(typeof api.fetchDetail).toBe('function')
    expect(typeof api.create).toBe('function')
    expect(typeof api.update).toBe('function')
    expect(typeof api.remove).toBe('function')
  })

  it('fetchList passes status filter and maps rows', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{
        proposal_id: 1, personnel_id: 2, personnel_name: 'ก', proposal_type: 'improvement',
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

  it('create maps camelCase payload to snake_case', async () => {
    mockPost.mockResolvedValue({ success: true })
    const { create } = useWorkResults()
    await create({
      personnelId: 3,
      title: 'A',
      proposalType: 'innovation',
      submissionDate: '2024-05-05',
      status: 'draft',
      description: 'd',
    })
    expect(mockPost).toHaveBeenCalledWith('/work-results', {
      personnel_id: 3,
      title: 'A',
      proposal_type: 'innovation',
      submission_date: '2024-05-05',
      status: 'draft',
      description: 'd',
    })
  })

  it('update and remove target the id', async () => {
    mockPut.mockResolvedValue({ success: true })
    mockDel.mockResolvedValue({ success: true })
    const { update, remove } = useWorkResults()
    await update(7, { title: 'B' })
    expect(mockPut).toHaveBeenCalledWith('/work-results/7', { title: 'B' })
    await remove(7)
    expect(mockDel).toHaveBeenCalledWith('/work-results/7')
  })
})
