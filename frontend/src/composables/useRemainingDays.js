// สำหรับหน้าพ้นทดลอง — เกินกำหนดเป็นเรื่องเร่งด่วน (สีแดง)
export function getRemainingDaysClass(days) {
  if (days === null || days === undefined) return 'text-gray-400'
  if (days < 0) return 'text-red-600 font-medium'
  if (days === 0) return 'text-green-600 font-medium'
  if (days <= 30) return 'text-orange-600 font-medium'
  return 'text-yellow-600'
}

// สำหรับหน้า candidate list — เกินเกณฑ์เป็นเรื่องดี (สีปกติ)
export function getCandidateRemainingDaysClass(days) {
  if (days === null || days === undefined) return 'text-gray-400'
  if (days < 0) return 'text-gray-700'                         // ถึงเกณฑ์แล้ว — สีปกติ
  if (days === 0) return 'text-green-600 font-medium'          // ครบเกณฑ์วันนี้ — เขียว
  if (days <= 30) return 'text-orange-600 font-medium'         // ใกล้ถึงเกณฑ์ — ส้ม
  return 'text-yellow-600'                                     // ยังไม่ถึงเกณฑ์ — เหลือง
}

export function formatRemainingDays(days) {
  if (days === null || days === undefined) return '-'
  if (days < 0) return `เกิน ${Math.abs(days)} วัน`
  if (days === 0) return 'ครบกำหนดวันนี้'
  return `${days} วัน`
}
