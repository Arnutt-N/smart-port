import {
  CANDIDATE_NEAR_THRESHOLD_DAYS,
  PROBATION_NEAR_THRESHOLD_DAYS,
} from '@/constants/eligibility.js'

/**
 * Display status for บัญชีรายชื่อผู้มีคุณสมบัติเลื่อนระดับ.
 * Backend still emits coarse status + remaining_days; this is the single FE seam.
 *
 * @param {string|null|undefined} backendStatus
 * @param {number|string|null|undefined} remainingDays
 * @returns {string}
 */
export function statusFor(backendStatus, remainingDays) {
  const days = remainingDays !== null && remainingDays !== undefined
    ? parseInt(remainingDays, 10)
    : null

  if (backendStatus === 'promoting') return 'PROMOTING'
  if (backendStatus === 'check_data') return 'check_data'

  if (days === null || Number.isNaN(days)) return 'NOT_MET'
  if (days > CANDIDATE_NEAR_THRESHOLD_DAYS) return 'NOT_MET'
  if (days >= 1) return 'NEAR_MET'
  if (days === 0) return 'MET'
  return 'EXCEEDED'
}

/**
 * Display status for พ้นทดลองปฏิบัติราชการ (30-day near window).
 *
 * @param {string|null|undefined} backendStatus
 * @param {number|string|null|undefined} remainingDays
 * @returns {string}
 */
export function probationStatusFor(backendStatus, remainingDays) {
  const days = remainingDays !== null && remainingDays !== undefined
    ? parseInt(remainingDays, 10)
    : null

  if (backendStatus === 'COMPLETED') return 'COMPLETED'
  if (backendStatus === 'FAILED') return 'FAILED'
  if (backendStatus === 'EXTENDED') return 'EXTENDED'

  if (days === null || Number.isNaN(days)) return 'NOT_DUE'
  if (days > PROBATION_NEAR_THRESHOLD_DAYS) return 'NOT_DUE'
  if (days >= 1) return 'NEAR_DEADLINE'
  if (days === 0) return 'READY'
  return 'OVERDUE'
}

/** Labels/classes for statuses produced by statusFor / probationStatusFor. */
export const ELIGIBILITY_STATUS_MAP = {
  NOT_MET: { label: 'ยังไม่ถึงเกณฑ์', class: 'bg-yellow-50 text-yellow-700' },
  NEAR_MET: { label: 'ใกล้ถึงเกณฑ์', class: 'bg-orange-50 text-orange-700' },
  MET: { label: 'ครบเกณฑ์', class: 'bg-green-50 text-green-700' },
  EXCEEDED: { label: 'ถึงเกณฑ์', class: 'bg-green-50 text-green-700' },
  PROMOTING: { label: 'กำลังดำเนินการ', class: 'bg-blue-50 text-blue-700' },
  qualified: { label: 'ถึงเกณฑ์', class: 'bg-green-50 text-green-700' },
  not_yet: { label: 'ยังไม่ถึงเกณฑ์', class: 'bg-yellow-50 text-yellow-700' },
  check_data: { label: 'ตรวจสอบข้อมูล', class: 'bg-orange-50 text-orange-700' },
  NOT_DUE: { label: 'ยังไม่ครบกำหนด', class: 'bg-yellow-50 text-yellow-700' },
  NEAR_DEADLINE: { label: 'ใกล้ครบกำหนด', class: 'bg-orange-50 text-orange-700' },
  READY: { label: 'พร้อมพ้นทดลอง', class: 'bg-green-50 text-green-700' },
  OVERDUE: { label: 'เกินกำหนด', class: 'bg-red-50 text-red-700' },
  IN_REVIEW: { label: 'กำลังดำเนินการ', class: 'bg-blue-50 text-blue-700' },
  IN_PROGRESS: { label: 'กำลังดำเนินการ', class: 'bg-blue-50 text-blue-700' },
  COMPLETED: { label: 'ผ่านทดลอง', class: 'bg-green-50 text-green-700' },
  FAILED: { label: 'ไม่ผ่าน', class: 'bg-red-50 text-red-700' },
  EXTENDED: { label: 'ขยายเวลา', class: 'bg-orange-50 text-orange-700' },
}
