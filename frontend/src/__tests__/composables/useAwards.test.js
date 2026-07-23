import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDel = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, post: mockPost, put: mockPut, del: mockDel }),
}))

const { useAwards } = await import('@/composables/useAwards.js')

describe('useAwards', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDel.mockReset()
  })

  it('exposes CRUD functions', () => {
    const api = useAwards()
    expect(typeof api.fetchList).toBe('function')
    expect(typeof api.create).toBe('function')
    expect(typeof api.update).toBe('function')
    expect(typeof api.remove).toBe('function')
  })

  it('fetchList calls /awards with params and maps rows', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{
        award_id: 1, servant_id: 5, servant_name: 'สมชาย',
        award_name: 'รางวัลดีเด่น', award_type: 'honor', award_level: 'national',
        awarded_date: '2024-01-01', description: 'x', created_at: '2024-01-02',
      }],
      pagination: { total: 1 },
    })
    const { fetchList } = useAwards()
    const result = await fetchList({ search: 'a', limit: 5, offset: 10 })
    const url = mockGet.mock.calls[0][0]
    expect(url).toContain('/awards')
    expect(url).toContain('search=a')
    expect(url).toContain('limit=5')
    expect(url).toContain('offset=10')
    expect(result.data[0]).toEqual({
      awardId: 1, servantId: 5, servantName: 'สมชาย',
      awardName: 'รางวัลดีเด่น', awardType: 'honor', awardLevel: 'national',
      awardedDate: '2024-01-01', description: 'x', createdAt: '2024-01-02',
    })
  })

  it('create maps camelCase payload to snake_case', async () => {
    mockPost.mockResolvedValue({ success: true })
    const { create } = useAwards()
    await create({ servantId: 3, awardName: 'A', awardType: 'general', awardLevel: 'ministry', awardedDate: '2024-05-05', description: 'd' })
    expect(mockPost).toHaveBeenCalledWith('/awards', {
      servant_id: 3, award_name: 'A', award_type: 'general', award_level: 'ministry', awarded_date: '2024-05-05', description: 'd',
    })
  })

  it('update and remove target the id', async () => {
    mockPut.mockResolvedValue({ success: true })
    mockDel.mockResolvedValue({ success: true })
    const { update, remove } = useAwards()
    await update(7, { awardName: 'B' })
    expect(mockPut).toHaveBeenCalledWith('/awards/7', { award_name: 'B' })
    await remove(7)
    expect(mockDel).toHaveBeenCalledWith('/awards/7')
  })

  it('returns empty array when data omitted', async () => {
    mockGet.mockResolvedValue({ success: true })
    const { fetchList } = useAwards()
    const result = await fetchList()
    expect(result.data).toEqual([])
  })
})
