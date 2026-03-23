import { useApi } from '@/composables/useApi.js'

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
      data: result.data.map(mapProbationRow),
      summary: result.summary,
      pagination: result.pagination,
    }
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
      remainingDays: row.remaining_days,
      status: row.status,
      totalTasks: row.total_tasks,
      completedTasks: row.completed_tasks,
    }
  }

  return { fetchList }
}
