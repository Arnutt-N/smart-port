import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDel = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, post: mockPost, put: mockPut, del: mockDel }),
}))

const { useResourceCrud } = await import('@/composables/useResourceCrud.js')

describe('useResourceCrud', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDel.mockReset()
  })

  it('fetchList maps rows and passes search params', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{ id: 1, name: 'a' }],
      pagination: { total: 1 },
    })

    const crud = useResourceCrud({
      path: '/awards',
      mapRow: (r) => ({ awardId: r.id, name: r.name }),
      toPayload: (d) => d,
    })
    const result = await crud.fetchList({ search: 'x', limit: 5, offset: 10 })

    expect(mockGet.mock.calls[0][0]).toContain('/awards?')
    expect(mockGet.mock.calls[0][0]).toContain('search=x')
    expect(result.data[0]).toEqual({ awardId: 1, name: 'a' })
  })

  it('create/update/remove hit the configured path', async () => {
    mockPost.mockResolvedValue({ success: true })
    mockPut.mockResolvedValue({ success: true })
    mockDel.mockResolvedValue({ success: true })

    const crud = useResourceCrud({
      path: 'royal-decorations',
      mapRow: (r) => r,
      toPayload: (d) => ({ snake: d.camel }),
    })

    await crud.create({ camel: 1 })
    await crud.update(9, { camel: 2 })
    await crud.remove(9)

    expect(mockPost).toHaveBeenCalledWith('/royal-decorations', { snake: 1 })
    expect(mockPut).toHaveBeenCalledWith('/royal-decorations/9', { snake: 2 })
    expect(mockDel).toHaveBeenCalledWith('/royal-decorations/9')
  })
})
