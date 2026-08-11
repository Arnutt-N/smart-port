import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({
    get: mockGet,
    post: mockPost,
    put: mockPut,
  }),
}))

const { usePersonnelMaster } = await import('@/composables/usePersonnelMaster.js')

describe('usePersonnelMaster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchList sends offset so API uses master list mode', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{
        personnel_id: 1,
        citizen_id: '1234567890123',
        first_name: 'สมชาย',
        last_name: 'ใจดี',
        full_name: 'นายสมชาย ใจดี',
        is_active: 1,
      }],
      pagination: { total: 1, limit: 20, offset: 0, has_more: false },
    })

    const { fetchList } = usePersonnelMaster()
    const result = await fetchList({ search: 'สมชาย', offset: 0, includeInactive: true })

    expect(mockGet).toHaveBeenCalledWith(expect.stringMatching(/^\/personnel\?/))
    const url = mockGet.mock.calls[0][0]
    expect(url).toContain('offset=0')
    expect(url).toContain('include_inactive=1')
    expect(url).toContain('search=')
    expect(result.data[0].personnelId).toBe(1)
    expect(result.data[0].fullName).toBe('นายสมชาย ใจดี')
    expect(result.data[0].isActive).toBe(true)
  })

  it('create posts identity fields', async () => {
    mockPost.mockResolvedValue({ success: true, personnel_id: 9 })
    const { create } = usePersonnelMaster()
    await create({
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      citizenId: '1234567890123',
      employeeId: 'E1',
      prefixId: 2,
    })
    expect(mockPost).toHaveBeenCalledWith('/personnel', {
      first_name: 'สมชาย',
      last_name: 'ใจดี',
      citizen_id: '1234567890123',
      employee_id: 'E1',
      prefix_id: 2,
    })
  })

  it('update never sends citizen_id', async () => {
    mockPut.mockResolvedValue({ success: true })
    const { update } = usePersonnelMaster()
    await update(5, { firstName: 'สมหญิง', isActive: false })
    expect(mockPut).toHaveBeenCalledWith('/personnel/5', {
      first_name: 'สมหญิง',
      is_active: 0,
    })
  })
})
