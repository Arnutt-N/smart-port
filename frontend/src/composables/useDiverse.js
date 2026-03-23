import { useApi } from '@/composables/useApi.js'

export function useDiverse() {
  const api = useApi()

  async function fetchList({ search = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/diverse?${params}`)
    return {
      success: result.success,
      data: (result.data || []).map(mapRow),
      summary: result.summary,
      pagination: result.pagination,
    }
  }

  async function fetchDetail(id) {
    const result = await api.get(`/diverse/${id}`)
    return {
      success: result.success,
      data: mapRow(result.data),
    }
  }

  async function create(data) {
    return api.post('/diverse', data)
  }

  async function update(id, data) {
    return api.put(`/diverse/${id}`, data)
  }

  async function remove(id) {
    return api.del(`/diverse/${id}`)
  }

  function mapRow(row) {
    return {
      experienceId: row.experience_id,
      personnelId: row.personnel_id,
      fullName: row.full_name,
      fromJobSeries: row.from_job_series,
      fromWorkGroup: row.from_work_group,
      fromDivision: row.from_division,
      fromOrgId: row.from_org_id,
      fromProvince: row.from_province,
      fromStartDate: row.from_start_date,
      fromEndDate: row.from_end_date,
      fromStartDateThai: row.from_start_date_thai,
      fromEndDateThai: row.from_end_date_thai,
      toJobSeries: row.to_job_series,
      toWorkGroup: row.to_work_group,
      toDivision: row.to_division,
      toOrgId: row.to_org_id,
      toProvince: row.to_province,
      toStartDate: row.to_start_date,
      toEndDate: row.to_end_date,
      toStartDateThai: row.to_start_date_thai,
      toEndDateThai: row.to_end_date_thai,
      isDiffJobSeries: row.is_diff_job_series,
      isDiffOrg: row.is_diff_org,
      isDiffLocation: row.is_diff_location,
      isDiffWorkNature: row.is_diff_work_nature,
      diffCount: row.diff_count,
      qualifiedDate: row.qualified_date,
      qualifiedDateThai: row.qualified_date_thai,
    }
  }

  return { fetchList, fetchDetail, create, update, remove }
}
