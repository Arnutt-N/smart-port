/**
 * Thai citizen ID: 13 digits + official checksum.
 * sum = d1*13 + … + d12*2; check = (11 - (sum % 11)) % 10; d13 must equal check.
 */

export function isValidThaiCitizenId(citizenId) {
  const id = String(citizenId ?? '')
  if (!/^\d{13}$/.test(id)) {
    return false
  }
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(id[i]) * (13 - i)
  }
  const check = (11 - (sum % 11)) % 10
  return Number(id[12]) === check
}

export function thaiCitizenIdError(citizenId) {
  const id = String(citizenId ?? '').trim()
  if (!/^\d{13}$/.test(id)) {
    return 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก'
  }
  if (!isValidThaiCitizenId(id)) {
    return 'เลขบัตรประชาชนไม่ถูกต้อง'
  }
  return null
}
