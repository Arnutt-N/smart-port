import { useApi } from '@/composables/useApi.js'

export function useUsers() {
  const api = useApi()

  async function fetchList({ search = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/users?${params}`)
    return {
      success: result.success,
      data: (result.data || []).map(mapRow),
      pagination: result.pagination,
    }
  }

  async function create(data) {
    return api.post('/users', {
      username: data.username,
      password: data.password,
      full_name: data.fullName,
      email: data.email || null,
      role: data.role,
    })
  }

  async function update(id, data) {
    const payload = {}
    if (data.fullName !== undefined) payload.full_name = data.fullName
    if (data.email !== undefined) payload.email = data.email
    if (data.role !== undefined) payload.role = data.role
    if (data.isActive !== undefined) payload.is_active = data.isActive ? 1 : 0
    if (data.password !== undefined && data.password !== '') payload.password = data.password
    return api.put(`/users/${id}`, payload)
  }

  function mapRow(row) {
    return {
      userId: row.user_id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      isActive: Boolean(Number(row.is_active)),
      mustChangePassword: Boolean(Number(row.must_change_password)),
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
    }
  }

  return { fetchList, create, update }
}
