import { useApi } from '@/composables/useApi.js'
import { statusFor } from '@/utils/displayEligibility.js'

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
      data: (result.data || []).map(mapCandidateRow),
      summary: result.summary,
      pagination: result.pagination,
    }
  }

  // ภาพรวมทุกระดับจาก aggregate ฝั่ง backend (แทนการยิง 5 requests แล้วรวมเลขฝั่ง client)
  async function fetchOverview() {
    const result = await api.get('/candidates/overview')
    return {
      success: result.success,
      summary: result.summary || {},
      byLevel: result.by_level || {},
      top5: (result.top5 || []).map(mapCandidateRow),
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
      status: statusFor(row.status, row.remaining_days),
      department: row.department,
      supportiveDays: row.supportive_days,
      equivalenceDays: row.equivalence_days,
      diverseStatus: row.diverse_status,
    }
  }

  async function deactivatePersonnel(personnelId) {
    return api.del(`/civil-servants/${personnelId}`)
  }

  return { fetchByLevel, fetchOverview, deactivatePersonnel }
}
