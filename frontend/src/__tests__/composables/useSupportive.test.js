import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDel = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, post: mockPost, put: mockPut, del: mockDel }),
}))

const { useSupportive } = await import('@/composables/useSupportive.js')

const serverRow = {
  supportive_id: 11,
  personnel_id: 3,
  full_name: 'สมชาย ใจดี',
  job_series_name: 'ทรัพยากรบุคคล',
  primary_series_name: 'บริหารทั่วไป',
  start_date: '2021-01-01',
  end_date: '2021-12-31',
  start_date_thai: '1 ม.ค. 2564',
  end_date_thai: '31 ธ.ค. 2564',
  total_days: 365,
  ratio_percent: 50,
  effective_days: 183,
  net_end_date: '2022-06-30',
  description: 'ทดสอบ',
}

describe('useSupportive', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDel.mockReset()
  })

  it('fetchList calls GET /supportive with search/limit/offset and maps rows', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [serverRow],
      summary: { total: 1 },
      pagination: { total: 1, limit: 20, offset: 0, has_more: false },
    })

    const { fetchList } = useSupportive()
    const result = await fetchList({ search: 'สม', limit: 10, offset: 5 })

    const url = mockGet.mock.calls[0][0]
    expect(url).toContain('/supportive?')
    expect(url).toContain('search=')
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=5')

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      supportiveId: 11,
      personnelId: 3,
      fullName: 'สมชาย ใจดี',
      jobSeriesName: 'ทรัพยากรบุคคล',
      primarySeriesName: 'บริหารทั่วไป',
      totalDays: 365,
      ratioPercent: 50,
      effectiveDays: 183,
      description: 'ทดสอบ',
    })
    expect(result.pagination.total).toBe(1)
  })

  it('fetchList omits search param when search is empty', async () => {
    mockGet.mockResolvedValue({ success: true, data: [], pagination: {} })

    const { fetchList } = useSupportive()
    await fetchList()

    const url = mockGet.mock.calls[0][0]
    expect(url).not.toContain('search=')
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=0')
  })

  it('fetchList returns empty data array when API returns no data field', async () => {
    mockGet.mockResolvedValue({ success: true, pagination: {} })

    const { fetchList } = useSupportive()
    const result = await fetchList()

    expect(result.data).toEqual([])
  })

  it('fetchDetail calls GET /supportive/:id and maps the single row', async () => {
    mockGet.mockResolvedValue({ success: true, data: serverRow })

    const { fetchDetail } = useSupportive()
    const result = await fetchDetail(11)

    expect(mockGet).toHaveBeenCalledWith('/supportive/11')
    expect(result.data.supportiveId).toBe(11)
    expect(result.data.fullName).toBe('สมชาย ใจดี')
  })

  it('create posts to /supportive with the given payload', async () => {
    mockPost.mockResolvedValue({ success: true, supportive_id: 11 })
    const payload = { personnel_id: 3, job_series_name: 'ทรัพยากรบุคคล' }

    const { create } = useSupportive()
    const result = await create(payload)

    expect(mockPost).toHaveBeenCalledWith('/supportive', payload)
    expect(result.supportive_id).toBe(11)
  })

  it('update puts to /supportive/:id with the given payload', async () => {
    mockPut.mockResolvedValue({ success: true })
    const payload = { description: 'อัปเดต' }

    const { update } = useSupportive()
    const result = await update(11, payload)

    expect(mockPut).toHaveBeenCalledWith('/supportive/11', payload)
    expect(result.success).toBe(true)
  })

  it('remove calls DELETE /supportive/:id', async () => {
    mockDel.mockResolvedValue({ success: true })

    const { remove } = useSupportive()
    const result = await remove(11)

    expect(mockDel).toHaveBeenCalledWith('/supportive/11')
    expect(result.success).toBe(true)
  })

  it('mapRow handles sparse rows with undefined fields', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{ supportive_id: 1, personnel_id: 2, full_name: 'X' }],
      pagination: {},
    })

    const { fetchList } = useSupportive()
    const result = await fetchList()

    expect(result.data[0]).toMatchObject({
      supportiveId: 1,
      personnelId: 2,
      fullName: 'X',
      jobSeriesName: undefined,
      effectiveDays: undefined,
    })
  })
})
