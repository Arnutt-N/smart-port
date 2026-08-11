import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: (...args) => mockGet(...args) }),
}))

const { usePersonnelSearch } = await import('@/composables/usePersonnelSearch.js')

describe('usePersonnelSearch', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('calls /personnel with search and limit, returns data rows', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{ personnel_id: 7, full_name: 'นายสมชาย ใจดี' }],
    })
    const { searchPersonnel } = usePersonnelSearch()
    const rows = await searchPersonnel('สมชาย', { limit: 10 })

    expect(mockGet).toHaveBeenCalledTimes(1)
    const url = mockGet.mock.calls[0][0]
    expect(url).toMatch(/^\/personnel\?/)
    expect(url).toContain('search=')
    expect(decodeURIComponent(url)).toContain('สมชาย')
    expect(url).toContain('limit=10')
    expect(rows).toEqual([{ personnel_id: 7, full_name: 'นายสมชาย ใจดี' }])
  })

  it('returns [] without calling API when query is shorter than 2 chars', async () => {
    const { searchPersonnel } = usePersonnelSearch()
    await expect(searchPersonnel('ส')).resolves.toEqual([])
    await expect(searchPersonnel('')).resolves.toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('returns [] when API payload has no data array', async () => {
    mockGet.mockResolvedValue({ success: true })
    const { searchPersonnel } = usePersonnelSearch()
    await expect(searchPersonnel('สมชาย')).resolves.toEqual([])
  })
})
