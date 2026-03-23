import { useApi } from '@/composables/useApi.js'

export function useSupportive() {
  const api = useApi()

  async function fetchList({ search = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/supportive?${params}`)
    return {
      success: result.success,
      data: result.data.map(mapRow),
      summary: result.summary,
      pagination: result.pagination,
    }
  }

  async function fetchDetail(id) {
    const result = await api.get(`/supportive/${id}`)
    return {
      success: result.success,
      data: mapRow(result.data),
    }
  }

  async function create(data) {
    return api.post('/supportive', data)
  }

  async function update(id, data) {
    return api.put(`/supportive/${id}`, data)
  }

  async function remove(id) {
    return api.del(`/supportive/${id}`)
  }

  function mapRow(row) {
    return {
      supportiveId: row.supportive_id,
      personnelId: row.personnel_id,
      fullName: row.full_name,
      jobSeriesName: row.job_series_name,
      primarySeriesName: row.primary_series_name,
      startDate: row.start_date,
      endDate: row.end_date,
      startDateThai: row.start_date_thai,
      endDateThai: row.end_date_thai,
      totalDays: row.total_days,
      ratioPercent: row.ratio_percent,
      effectiveDays: row.effective_days,
      netEndDate: row.net_end_date,
      description: row.description,
    }
  }

  return { fetchList, fetchDetail, create, update, remove }
}
