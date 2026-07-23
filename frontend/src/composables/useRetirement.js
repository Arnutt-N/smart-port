import { useApi } from '@/composables/useApi.js'

export function useRetirement() {
  const api = useApi()

  async function fetchList({ search = '', within = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (within) params.set('within', within)
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/retirement?${params}`)
    return {
      success: result.success,
      data: (result.data || []).map(mapRow),
      pagination: result.pagination,
    }
  }

  function mapRow(row) {
    return {
      servantId: row.servant_id,
      employeeId: row.employee_id,
      fullName: row.full_name,
      retirementDate: row.retirement_date,
      servantStatus: row.servant_status,
      remainingDays: row.remaining_days === null ? null : Number(row.remaining_days),
    }
  }

  return { fetchList }
}
