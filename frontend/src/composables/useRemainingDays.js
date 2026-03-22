export function getRemainingDaysClass(days) {
  if (days === null || days === undefined) return 'text-gray-400'
  if (days < 0) return 'text-red-600 font-medium'
  if (days === 0) return 'text-green-600 font-medium'
  if (days <= 30) return 'text-orange-600'
  return 'text-yellow-600'
}

export function formatRemainingDays(days) {
  if (days === null || days === undefined) return '-'
  if (days === 0) return 'ครบกำหนดวันนี้'
  if (days < 0) return `เกิน ${Math.abs(days)} วัน`
  return `${days} วัน`
}
