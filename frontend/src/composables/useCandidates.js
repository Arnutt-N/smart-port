import { useApi } from '@/composables/useApi.js'

export function useCandidates() {
  const api = useApi()

  async function fetchByLevel(targetLevel, { search = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/candidates/${targetLevel}?${params}`)
    return {
      success: result.success,
      data: result.data.map(mapCandidateRow),
      summary: result.summary,
      pagination: result.pagination,
    }
  }

  function mapCandidateRow(row) {
    return {
      personnelId: row.personnel_id,
      name: row.full_name,
      currentPosition: row.current_position,
      currentLevelCode: row.current_level_code,
      currentLevelName: row.current_level_name,
      levelStartDate: row.level_start_date_thai,
      qualificationDate: row.qualification_date_thai,
      remainingDays: row.remaining_days,
      status: row.status,
      department: row.department,
    }
  }

  return { fetchByLevel }
}
