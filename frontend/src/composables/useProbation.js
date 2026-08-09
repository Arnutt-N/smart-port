import { useApi } from '@/composables/useApi.js'
import { probationStatusFor } from '@/utils/displayEligibility.js'

export function useProbation() {
  const api = useApi()

  async function fetchList({ search = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/probation?${params}`)
    return {
      success: result.success,
      data: (result.data || []).map(mapProbationRow),
      summary: result.summary,
      pagination: result.pagination,
    }
  }

  async function update(enrollmentId, payload) {
    return api.put(`/probation/${enrollmentId}`, payload)
  }

  async function remove(enrollmentId) {
    return api.del(`/probation/${enrollmentId}`)
  }

  function mapProbationRow(row) {
    return {
      enrollmentId: row.enrollment_id,
      personnelId: row.personnel_id,
      name: row.full_name,
      position: row.position_name,
      department: row.department,
      startDate: row.start_date_thai,
      endDate: row.end_date_thai,
      startDateIso: row.start_date || '',
      endDateIso: row.end_date || '',
      remainingDays: row.remaining_days,
      overallStatus: row.status,
      status: probationStatusFor(row.status, row.remaining_days),
      totalTasks: row.total_tasks,
      completedTasks: row.completed_tasks,
      remarks: row.remarks || '',
    }
  }

  return { fetchList, update, remove }
}
