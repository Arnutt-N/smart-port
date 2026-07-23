import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDel = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, post: mockPost, put: mockPut, del: mockDel }),
}))

const { useDecorations } = await import('@/composables/useDecorations.js')

describe('useDecorations', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDel.mockReset()
  })

  it('exposes CRUD functions', () => {
    const api = useDecorations()
    expect(typeof api.fetchList).toBe('function')
    expect(typeof api.create).toBe('function')
    expect(typeof api.update).toBe('function')
    expect(typeof api.remove).toBe('function')
  })

  it('fetchList calls /royal-decorations and maps rows', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{
        decoration_id: 2, servant_id: 4, servant_name: 'สมหญิง',
        decoration_name: 'ทวีติยาภรณ์', decoration_class: 'ชั้นที่ 1',
        received_year: 2566, gazette_ref: 'ล.123', description: 'y', created_at: '2024-02-02',
      }],
      pagination: { total: 1 },
    })
    const { fetchList } = useDecorations()
    const result = await fetchList()
    expect(mockGet.mock.calls[0][0]).toContain('/royal-decorations')
    expect(result.data[0]).toEqual({
      decorationId: 2, servantId: 4, servantName: 'สมหญิง',
      decorationName: 'ทวีติยาภรณ์', decorationClass: 'ชั้นที่ 1',
      receivedYear: 2566, gazetteRef: 'ล.123', description: 'y', createdAt: '2024-02-02',
    })
  })

  it('create maps camelCase to snake_case', async () => {
    mockPost.mockResolvedValue({ success: true })
    const { create } = useDecorations()
    await create({ servantId: 1, decorationName: 'D', decorationClass: 'c', receivedYear: 2565, gazetteRef: 'g', description: 'z' })
    expect(mockPost).toHaveBeenCalledWith('/royal-decorations', {
      servant_id: 1, decoration_name: 'D', decoration_class: 'c', received_year: 2565, gazette_ref: 'g', description: 'z',
    })
  })

  it('update and remove target the id', async () => {
    mockPut.mockResolvedValue({ success: true })
    mockDel.mockResolvedValue({ success: true })
    const { update, remove } = useDecorations()
    await update(9, { decorationName: 'E' })
    expect(mockPut).toHaveBeenCalledWith('/royal-decorations/9', { decoration_name: 'E' })
    await remove(9)
    expect(mockDel).toHaveBeenCalledWith('/royal-decorations/9')
  })
})
