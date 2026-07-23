import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet }),
}))

const { useAnalytics } = await import('@/composables/useAnalytics.js')

describe('useAnalytics', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('exposes fetchSummary', () => {
    expect(typeof useAnalytics().fetchSummary).toBe('function')
  })

  it('maps totals and distribution buckets', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        totals: {
          personnel: 100, civil_servants: 80, awards: 12,
          decorations: 5, work_results: 30, retirement_upcoming: 3,
        },
        proposals_by_status: [{ label: 'approved', count: 10 }],
        awards_by_type: [{ label: 'honor', count: 4 }],
      },
    })
    const { fetchSummary } = useAnalytics()
    const result = await fetchSummary()
    expect(mockGet).toHaveBeenCalledWith('/analytics')
    expect(result.data.totals).toEqual({
      personnel: 100, civilServants: 80, awards: 12,
      decorations: 5, workResults: 30, retirementUpcoming: 3,
    })
    expect(result.data.proposalsByStatus).toEqual([{ label: 'approved', count: 10 }])
    expect(result.data.awardsByType).toEqual([{ label: 'honor', count: 4 }])
  })

  it('defaults to zeros and empty arrays when data missing', async () => {
    mockGet.mockResolvedValue({ success: true, data: {} })
    const { fetchSummary } = useAnalytics()
    const result = await fetchSummary()
    expect(result.data.totals.personnel).toBe(0)
    expect(result.data.proposalsByStatus).toEqual([])
    expect(result.data.awardsByType).toEqual([])
  })
})
