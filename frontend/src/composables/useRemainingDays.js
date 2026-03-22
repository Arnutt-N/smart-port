export function getRemainingDaysClass(days) {
  if (days === null || days === undefined) return 'text-gray-400'
  if (days < 7) return 'text-red-600 font-medium'
  if (days <= 14) return 'text-orange-600'
  if (days <= 30) return 'text-yellow-600'
  return 'text-green-600'
}

export function formatRemainingDays(days) {
  if (days === null || days === undefined) return '-'
  if (days < 0) return `เกิน ${Math.abs(days)} วัน`
  return `${days} วัน`
}
