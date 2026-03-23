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
      data: (result.data || []).map(mapProbationRow),
      summary: result.summary,
      pagination: result.pagination,
    }
  }

  // คำนวณสถานะแสดงผลจาก remaining_days และ backend status
  function computeDisplayStatus(backendStatus, remainingDays) {
    const days = (remainingDays !== null && remainingDays !== undefined) ? parseInt(remainingDays, 10) : null

    // สถานะจาก backend ที่ไม่ใช่ IN_PROGRESS — ส่งผ่านตรงๆ ให้ StatusBadge แสดง
    if (backendStatus === 'COMPLETED') return 'COMPLETED'   // ผ่านทดลอง (สีเขียว)
    if (backendStatus === 'FAILED') return 'FAILED'         // ไม่ผ่าน (สีแดง)
    if (backendStatus === 'EXTENDED') return 'EXTENDED'     // ขยายเวลา (สีส้ม)

    // ถ้ายังเป็น IN_PROGRESS — คำนวณสถานะแสดงผลจาก remaining_days
    if (days === null || isNaN(days)) return 'NOT_DUE'
    if (days > 30) return 'NOT_DUE'           // > 30 วัน = ยังไม่ครบกำหนด (สีเหลือง)
    if (days >= 1) return 'NEAR_DEADLINE'     // 1-30 วัน = ใกล้ครบกำหนด (สีส้ม)
    if (days === 0) return 'READY'            // ครบกำหนดวันนี้ = พร้อมพ้นทดลอง (สีเขียว)
    return 'OVERDUE'                          // < 0 วัน = เกินกำหนด (สีแดง)
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
      status: computeDisplayStatus(row.status, row.remaining_days),
      totalTasks: row.total_tasks,
      completedTasks: row.completed_tasks,
    }
  }

  return { fetchList }
}
