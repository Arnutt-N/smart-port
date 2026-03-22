import { useApi } from '@/composables/useApi.js'

export function useEquivalence() {
  const api = useApi()

  async function fetchList({ search = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/equivalence?${params}`)
    return {
      success: result.success,
      data: result.data.map(mapRow),
      summary: result.summary,
      pagination: result.pagination,
    }
  }

  async function fetchDetail(id) {
    const result = await api.get(`/equivalence/${id}`)
    return {
      success: result.success,
      data: mapRow(result.data),
    }
  }

  async function create(data) {
    return api.post('/equivalence', data)
  }

  async function update(id, data) {
    return api.put(`/equivalence/${id}`, data)
  }

  async function approve(id, data) {
    return api.put(`/equivalence/${id}`, {
      approval_status: 'APPROVED',
      approved_start_date: data.approvedStartDate,
      approved_end_date: data.approvedEndDate,
    })
  }

  async function reject(id) {
    return api.put(`/equivalence/${id}`, {
      approval_status: 'REJECTED',
    })
  }

  function mapRow(row) {
    return {
      equivalenceId: row.equivalence_id,
      personnelId: row.personnel_id,
      fullName: row.full_name,
      actualPosition: row.actual_position,
      equivalentType: row.equivalent_type,
      requestStartDate: row.request_start_date,
      requestEndDate: row.request_end_date,
      requestStartDateThai: row.request_start_date_thai,
      requestEndDateThai: row.request_end_date_thai,
      requestTotalDays: row.request_total_days,
      approvalStatus: row.approval_status,
      approvedStartDate: row.approved_start_date,
      approvedEndDate: row.approved_end_date,
      approvedStartDateThai: row.approved_start_date_thai,
      approvedEndDateThai: row.approved_end_date_thai,
      approvedTotalDays: row.approved_total_days,
      approvedBy: row.approved_by,
      approvedByName: row.approved_by_name,
      approvalOrderRef: row.approval_order_ref,
    }
  }

  return { fetchList, fetchDetail, create, update, approve, reject }
}
