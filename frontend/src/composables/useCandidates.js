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

  // คำนวณสถานะแสดงผลจาก remaining_days และ backend status
  function computeDisplayStatus(backendStatus, remainingDays) {
    const days = (remainingDays !== null && remainingDays !== undefined) ? parseInt(remainingDays, 10) : null

    // ถ้า backend บอกว่า qualified + มีข้อมูลว่ากำลังเลื่อนตำแหน่ง
    // (สำหรับ v2: ตรวจสอบจาก promotion_evaluation table)
    // ตอนนี้ใช้ backendStatus ที่ไม่ใช่ qualified/not_yet เป็นสัญญาณ
    if (backendStatus === 'promoting') {
      return 'PROMOTING' // กำลังดำเนินการเลื่อนตำแหน่ง (สีน้ำเงิน)
    }

    if (backendStatus === 'check_data') {
      return 'check_data' // ตรวจสอบข้อมูล (สีส้ม)
    }

    // คำนวณจาก remaining_days
    if (days === null || isNaN(days)) return 'NOT_MET'
    if (days > 30) return 'NOT_MET'           // > 30 วัน = ยังไม่ถึงเกณฑ์ (สีเหลือง)
    if (days >= 1) return 'NEAR_MET'          // 1-30 วัน = ใกล้ถึงเกณฑ์ (สีส้ม)
    if (days === 0) return 'MET'              // ครบเกณฑ์วันนี้ (สีเขียว)
    return 'EXCEEDED'                         // เกินเกณฑ์แล้ว = ถึงเกณฑ์ (สีเขียว)
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
      status: computeDisplayStatus(row.status, row.remaining_days),
      department: row.department,
      supportiveDays: row.supportive_days,
      equivalenceDays: row.equivalence_days,
      diverseStatus: row.diverse_status,
    }
  }

  return { fetchByLevel, fetchOverview }
}
