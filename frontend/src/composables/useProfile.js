import { useApi } from '@/composables/useApi.js'

export function useProfile() {
  const api = useApi()

  async function fetchMe() {
    const result = await api.get('/profile')
    return { success: result.success, data: result.data ? mapAccount(result.data) : null }
  }

  async function fetchById(id) {
    const result = await api.get(`/profile/${id}`)
    return { success: result.success, data: result.data ? mapServant(result.data) : null }
  }

  function mapAccount(row) {
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

  function mapServant(row) {
    return {
      servantId: row.servant_id,
      employeeId: row.employee_id,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: row.full_name,
      birthDate: row.birth_date,
      appointmentDate: row.appointment_date,
      retirementDate: row.retirement_date,
      servantStatus: row.servant_status,
      photoPath: row.photo_path,
    }
  }

  return { fetchMe, fetchById }
}
