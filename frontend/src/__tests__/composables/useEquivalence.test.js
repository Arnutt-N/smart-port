import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, post: mockPost, put: mockPut }),
}))

const { useEquivalence } = await import('@/composables/useEquivalence.js')

const serverRow = {
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

describe('useEquivalence', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
  })

  it('fetchList calls GET /equivalence with search/limit/offset and maps rows', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [serverRow],
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

  it('fetchDetail calls GET /equivalence/:id and maps the single row', async () => {
    mockGet.mockResolvedValue({ success: true, data: serverRow })

    const { fetchDetail } = useEquivalence()
    const result = await fetchDetail(7)

    expect(mockGet).toHaveBeenCalledWith('/equivalence/7')
    expect(result.data.equivalenceId).toBe(7)
    expect(result.data.approvalStatus).toBe('PENDING')
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