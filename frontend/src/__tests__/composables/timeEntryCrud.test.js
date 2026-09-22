import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDel = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, post: mockPost, put: mockPut, del: mockDel }),
}))

const { useSupportive, useDiverse, useEquivalence } = await import('@/composables/timeEntryCrud.js')

const supportiveRow = {
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

const diverseRow = {
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

const equivalenceRow = {
  equivalence_id: 7,
  personnel_id: 20,
  full_name: 'สมหญิง รักงาน',
  actual_position: 'นักวิเคราะห์',
  equivalent_type: 'CROSS_SERIES',
  request_start_date: '2024-01-01',
  request_end_date: '2024-12-31',
  request_start_date_thai: '1 ม.ค. 2567',
  request_end_date_thai: '31 ธ.ค. 2567',
  request_total_days: 366,
  approval_status: 'PENDING',
  approved_start_date: null,
  approved_end_date: null,
  approved_start_date_thai: null,
  approved_end_date_thai: null,
  approved_total_days: null,
  approved_by: null,
  approved_by_name: null,
  approval_order_ref: null,
}

describe('timeEntryCrud', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDel.mockReset()
  })

  describe('useSupportive', () => {
    it('fetchList calls GET /supportive with search/limit/offset and maps rows', async () => {
      mockGet.mockResolvedValue({
        success: true,
        data: [supportiveRow],
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

  describe('useDiverse', () => {
    it('fetchList calls GET /diverse with search/limit/offset and maps rows', async () => {
      mockGet.mockResolvedValue({
        success: true,
        data: [diverseRow],
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

  describe('useEquivalence', () => {
    it('fetchList calls GET /equivalence with search/limit/offset and maps rows', async () => {
      mockGet.mockResolvedValue({
        success: true,
        data: [equivalenceRow],
        summary: { total: 1 },
        pagination: { total: 1, limit: 20, offset: 0, has_more: false },
      })

      const { fetchList } = useEquivalence()
      const result = await fetchList({ search: 'สมหญิง', limit: 5, offset: 10 })

      const url = mockGet.mock.calls[0][0]
      expect(url).toContain('/equivalence?')
      expect(url).toContain('search=')
      expect(url).toContain('limit=5')
      expect(url).toContain('offset=10')

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toMatchObject({
        equivalenceId: 7,
        personnelId: 20,
        fullName: 'สมหญิง รักงาน',
        actualPosition: 'นักวิเคราะห์',
        equivalentType: 'CROSS_SERIES',
        requestTotalDays: 366,
        approvalStatus: 'PENDING',
      })
    })

    it('fetchList omits search param when empty', async () => {
      mockGet.mockResolvedValue({ success: true, data: [], pagination: {} })

      const { fetchList } = useEquivalence()
      await fetchList()

      const url = mockGet.mock.calls[0][0]
      expect(url).not.toContain('search=')
      expect(url).toContain('limit=20')
    })

    it('fetchList returns empty array when API returns no data field', async () => {
      mockGet.mockResolvedValue({ success: true, pagination: {} })

      const { fetchList } = useEquivalence()
      const result = await fetchList()

      expect(result.data).toEqual([])
    })

    it('create posts to /equivalence with the given payload', async () => {
      mockPost.mockResolvedValue({ success: true, equivalence_id: 7 })
      const payload = { personnel_id: 20, equivalent_type: 'CROSS_SERIES' }

      const { create } = useEquivalence()
      const result = await create(payload)

      expect(mockPost).toHaveBeenCalledWith('/equivalence', payload)
      expect(result.equivalence_id).toBe(7)
    })

    it('update puts to /equivalence/:id with the given payload', async () => {
      mockPut.mockResolvedValue({ success: true })
      const payload = { actual_position: 'นักวิเคราะห์นโยบาย' }

      const { update } = useEquivalence()
      const result = await update(7, payload)

      expect(mockPut).toHaveBeenCalledWith('/equivalence/7', payload)
      expect(result.success).toBe(true)
    })

    it('approve puts approval_status=APPROVED with approved date range', async () => {
      mockPut.mockResolvedValue({ success: true })

      const { approve } = useEquivalence()
      await approve(7, { approvedStartDate: '2024-02-01', approvedEndDate: '2024-11-30' })

      expect(mockPut).toHaveBeenCalledWith('/equivalence/7', {
        approval_status: 'APPROVED',
        approved_start_date: '2024-02-01',
        approved_end_date: '2024-11-30',
      })
    })

    it('reject puts approval_status=REJECTED with no extra fields', async () => {
      mockPut.mockResolvedValue({ success: true })

      const { reject } = useEquivalence()
      await reject(7)

      expect(mockPut).toHaveBeenCalledWith('/equivalence/7', {
        approval_status: 'REJECTED',
      })
    })

    it('mapRow handles sparse rows with undefined fields', async () => {
      mockGet.mockResolvedValue({
        success: true,
        data: [{ equivalence_id: 1, personnel_id: 2, full_name: 'Y' }],
        pagination: {},
      })

      const { fetchList } = useEquivalence()
      const result = await fetchList()

      expect(result.data[0]).toMatchObject({
        equivalenceId: 1,
        personnelId: 2,
        fullName: 'Y',
        actualPosition: undefined,
        approvedBy: undefined,
      })
    })
  })
})
