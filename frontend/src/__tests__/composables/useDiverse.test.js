import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDel = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, post: mockPost, put: mockPut, del: mockDel }),
}))

const { useDiverse } = await import('@/composables/useDiverse.js')

const serverRow = {
  experience_id: 5,
  personnel_id: 12,
  full_name: 'สมชาย ใจดี',
  from_job_series: 'ปกครอง',
  from_work_group: 'อำนเภอ A',
  from_division: 'กลุ่ม A',
  from_org_id: 100,
  from_province: 'กรุงเทพมหานคร',
  from_start_date: '2020-01-01',
  from_end_date: '2022-12-31',
  from_start_date_thai: '1 ม.ค. 2563',
  from_end_date_thai: '31 ธ.ค. 2565',
  to_job_series: 'เทคโนโลยีสารสนเทศ',
  to_work_group: 'กลุ่ม B',
  to_division: 'ฝ่าย B',
  to_org_id: 200,
  to_province: 'เชียงใหม่',
  to_start_date: '2023-01-01',
  to_end_date: '2025-12-31',
  to_start_date_thai: '1 ม.ค. 2566',
  to_end_date_thai: '31 ธ.ค. 2568',
  is_diff_job_series: 1,
  is_diff_org: 1,
  is_diff_location: 1,
  is_diff_work_nature: 0,
  diff_count: 3,
  qualified_date: '2025-06-01',
  qualified_date_thai: '1 มิ.ย. 2568',
}

describe('useDiverse', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDel.mockReset()
  })

  it('fetchList calls GET /diverse with search/limit/offset and maps rows', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [serverRow],
      summary: { total: 1 },
      pagination: { total: 1, limit: 20, offset: 0, has_more: false },
    })

    const { fetchList } = useDiverse()
    const result = await fetchList({ search: 'สม', limit: 10, offset: 5 })

    expect(mockGet).toHaveBeenCalledTimes(1)
    const url = mockGet.mock.calls[0][0]
    expect(url).toContain('/diverse?')
    expect(url).toContain('search=')
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=5')

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      experienceId: 5,
      personnelId: 12,
      fullName: 'สมชาย ใจดี',
      fromJobSeries: 'ปกครอง',
      toJobSeries: 'เทคโนโลยีสารสนเทศ',
      isDiffJobSeries: 1,
      diffCount: 3,
      qualifiedDateThai: '1 มิ.ย. 2568',
    })
    expect(result.pagination.total).toBe(1)
  })

  it('fetchList omits search param when search is empty', async () => {
    mockGet.mockResolvedValue({ success: true, data: [], pagination: {} })

    const { fetchList } = useDiverse()
    await fetchList()

    const url = mockGet.mock.calls[0][0]
    expect(url).not.toContain('search=')
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=0')
  })

  it('fetchList returns empty data array when API returns no data field', async () => {
    mockGet.mockResolvedValue({ success: true, pagination: {} })

    const { fetchList } = useDiverse()
    const result = await fetchList()

    expect(result.data).toEqual([])
  })

  it('fetchDetail calls GET /diverse/:id and maps the single row', async () => {
    mockGet.mockResolvedValue({ success: true, data: serverRow })

    const { fetchDetail } = useDiverse()
    const result = await fetchDetail(5)

    expect(mockGet).toHaveBeenCalledWith('/diverse/5')
    expect(result.data.experienceId).toBe(5)
    expect(result.data.fullName).toBe('สมชาย ใจดี')
  })

  it('create posts to /diverse with the given payload', async () => {
    mockPost.mockResolvedValue({ success: true, experience_id: 5 })
    const payload = { personnel_id: 12, from_job_series: 'ปกครอง' }

    const { create } = useDiverse()
    const result = await create(payload)

    expect(mockPost).toHaveBeenCalledWith('/diverse', payload)
    expect(result.experience_id).toBe(5)
  })

  it('update puts to /diverse/:id with the given payload', async () => {
    mockPut.mockResolvedValue({ success: true })
    const payload = { from_job_series: 'ปกครองแผนใหม่' }

    const { update } = useDiverse()
    const result = await update(5, payload)

    expect(mockPut).toHaveBeenCalledWith('/diverse/5', payload)
    expect(result.success).toBe(true)
  })

  it('remove calls DELETE /diverse/:id', async () => {
    mockDel.mockResolvedValue({ success: true })

    const { remove } = useDiverse()
    const result = await remove(5)

    expect(mockDel).toHaveBeenCalledWith('/diverse/5')
    expect(result.success).toBe(true)
  })

  it('mapRow handles null/undefined fields gracefully', () => {
    // mapRow is internal but exercised via fetchList with a sparse row
    mockGet.mockResolvedValue({
      success: true,
      data: [{
        experience_id: 1,
        personnel_id: 2,
        full_name: 'X',
        // all other fields missing
      }],
      pagination: {},
    })

    const { fetchList } = useDiverse()
    return fetchList().then((result) => {
      expect(result.data[0]).toMatchObject({
        experienceId: 1,
        personnelId: 2,
        fullName: 'X',
        fromJobSeries: undefined,
        toProvince: undefined,
        diffCount: undefined,
      })
    })
  })
})