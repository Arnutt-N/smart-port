import { getSignedPhotoUrl, useApi } from '@/composables/useApi.js'

export function useProfile() {
  const api = useApi()

  async function fetchMe() {
    const result = await api.get('/profile')
    return { success: result.success, data: result.data ? mapAccount(result.data) : null }
  }

  async function fetchById(id) {
    const result = await api.get(`/profile/${id}`)
    if (!result.data) return { success: result.success, data: null }
    const data = mapPersonnel(result.data)
    data.photoPath = await resolvePhotoUrl(data.photoPath)
    return { success: result.success, data }
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

  function mapPersonnel(row) {
    return {
      personnelId: row.personnel_id,
      employeeId: row.employee_id,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: row.full_name,
      birthDate: row.birth_date,
      appointmentDate: row.appointment_date,
      retirementDate: row.retirement_date,
      servantStatus: row.servant_status,
      isActive: Boolean(Number(row.is_active)),
      // backend คืน path สัมพัทธ์ (uploads/xxx.jpg) — resolve เป็น signed URL ตอน fetch
      photoPath: row.photo_path,
    }
  }

  // D1: path สัมพัทธ์ → signed URL (absolute URL ใช้ตรงๆ; ล้มเหลว → null = placeholder)
  async function resolvePhotoUrl(photoPath) {
    if (!photoPath) return null
    if (/^https?:\/\//i.test(photoPath)) return photoPath
    const fileName = String(photoPath).split('/').pop()
    try {
      return await getSignedPhotoUrl(fileName)
    } catch {
      return null
    }
  }

  return { fetchMe, fetchById }
}
