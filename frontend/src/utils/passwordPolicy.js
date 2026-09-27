/**
 * นโยบายรหัสผ่านฝั่ง client — ตรงกับ backend/auth.php validatePasswordPolicy()
 * (backend ยังเป็นผู้ตัดสินสุดท้าย; ประวัติรหัสผ่านซ้ำตรวจที่ server เท่านั้น)
 */

export const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_BYTES = 72

/** ข้อความ error ตรงตัวอักษรกับ backend/auth.php (ไม่แต่งคำเอง) */
export const PASSWORD_MESSAGES = {
  too_short: `รหัสผ่านต้องมีความยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`,
  too_many_bytes: `รหัสผ่านต้องยาวไม่เกิน ${PASSWORD_MAX_BYTES} bytes`,
  missing_uppercase: 'รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว',
  missing_lowercase: 'รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว',
  missing_number: 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว',
  missing_special: 'รหัสผ่านต้องมีอักขระพิเศษอย่างน้อย 1 ตัว',
}

/** บรรทัดช่วยจำใต้ช่องรหัสผ่านทุกช่อง */
export const PASSWORD_GUIDANCE =
  'อย่างน้อย 12 ตัวอักษร มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษ อย่างละอย่างน้อย 1 ตัว และต้องไม่ซ้ำกับ 5 รุ่นล่าสุด'

/**
 * ตรวจรหัสผ่านตามนโยบาย — เรียงลำดับเหมับ backend (length → bytes → upper →
 * lower → number → special) เพื่อให้ code แรกที่เจอตรงกับ server
 *
 * @param {string} value
 * @returns {{ valid: boolean, code: string | null }} code = null เมื่อผ่าน
 */
export function validatePassword(value) {
  const pw = String(value ?? '')

  // PHP mb_strlen นับ Unicode code points — JS .length นับ UTF-16 ต้องใช้ Array.from
  if (Array.from(pw).length < PASSWORD_MIN_LENGTH) {
    return { valid: false, code: 'too_short' }
  }

  if (new TextEncoder().encode(pw).length > PASSWORD_MAX_BYTES) {
    return { valid: false, code: 'too_many_bytes' }
  }

  if (!/\p{Lu}/u.test(pw)) {
    return { valid: false, code: 'missing_uppercase' }
  }
  if (!/\p{Ll}/u.test(pw)) {
    return { valid: false, code: 'missing_lowercase' }
  }
  if (!/[\p{N}]/u.test(pw)) {
    return { valid: false, code: 'missing_number' }
  }
  if (!/[^\p{L}\p{N}\s]/u.test(pw)) {
    return { valid: false, code: 'missing_special' }
  }

  return { valid: true, code: null }
}

/**
 * ข้อความไทยของ code แรกที่ตก (null ถ้าผ่าน)
 *
 * @param {string} value
 * @returns {string | null}
 */
export function passwordErrorMessage(value) {
  const { code } = validatePassword(value)
  return code === null ? null : PASSWORD_MESSAGES[code]
}
