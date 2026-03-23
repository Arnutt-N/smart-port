export function getRemainingDaysClass(days) {
  if (days === null || days === undefined) return 'text-gray-400'
  if (days < 0) return 'text-red-600 font-medium'        // เกินกำหนด — แดง
  if (days === 0) return 'text-green-600 font-medium'     // ครบกำหนดวันนี้ — เขียว
  if (days <= 30) return 'text-orange-600 font-medium'    // ใกล้ครบกำหนด — ส้ม
  return 'text-yellow-600'                                // ยังไม่ครบกำหนด — เหลือง
}

export function formatRemainingDays(days) {
  if (days === null || days === undefined) return '-'
  if (days < 0) return `เกิน ${Math.abs(days)} วัน`
  if (days === 0) return 'ครบกำหนดวันนี้'
  return `${days} วัน`
}
