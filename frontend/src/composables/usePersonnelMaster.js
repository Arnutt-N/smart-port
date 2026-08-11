import { useApi } from '@/composables/useApi.js'

/**
 * Master CRUD สำหรับหน้าข้อมูลบุคลากร (แยกจาก usePersonnelSearch typeahead)
 */
export function usePersonnelMaster() {
  const api = useApi()

  async function fetchList({
    search = '',
    limit = 20,
    offset = 0,
    includeInactive = false,
  } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    if (includeInactive) params.set('include_inactive', '1')

    const result = await api.get(`/personnel?${params}`)
    return {
      success: result.success,
      data: (result.data || []).map(mapRow),
      pagination: result.pagination,
    }
  }

  async function fetchLookups() {
    const result = await api.get('/personnel/lookups')
    return result.data?.prefixes || []
  }

  async function create(data) {
    return api.post('/personnel', {
      first_name: data.firstName,
      last_name: data.lastName,
      citizen_id: data.citizenId,
      employee_id: data.employeeId || null,
      prefix_id: data.prefixId || null,
    })
  }

  async function update(id, data) {
    const payload = {}
    if (data.firstName !== undefined) payload.first_name = data.firstName
    if (data.lastName !== undefined) payload.last_name = data.lastName
    if (data.employeeId !== undefined) payload.employee_id = data.employeeId || null
    if (data.prefixId !== undefined) payload.prefix_id = data.prefixId || null
    if (data.isActive !== undefined) payload.is_active = data.isActive ? 1 : 0
    return api.put(`/personnel/${id}`, payload)
  }

  function mapRow(row) {
    return {
      personnelId: row.personnel_id,
      citizenId: row.citizen_id,
      employeeId: row.employee_id,
      prefixId: row.prefix_id,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: row.full_name,
      isActive: Boolean(Number(row.is_active)),
      currentPosition: row.current_position,
      department: row.department,
      prefixNameTh: row.prefix_name_th,
    }
  }

  return { fetchList, fetchLookups, create, update }
}
