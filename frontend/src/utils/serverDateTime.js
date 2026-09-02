/**
 * Helper วันเวลาสำหรับค่า DATETIME ที่ backend ส่งมา
 *
 * Backend ตั้ง MySQL session time zone เป็น +07:00 แล้ว (ดู config.php — SET time_zone
 * คู่กับ date_default_timezone_set('Asia/Bangkok')) ดังนั้น string เช่น
 * '2026-09-01 10:00:00' คือ "เวลาไทย" อยู่แล้ว — เราต้อง parse โดยบอก JS ว่าเป็น +07:00
 * ไม่ใช่ 'Z' (UTC) ไม่งั้นเบราว์เซอร์ที่อยู่ timezone อื่นจะแสดงเวลาเบี่ยงไป 7 ชั่วโมง
 *
 * หลัง append marker แล้ว format เป็น th-TH ตาม convention ของระบบ
 */

const DEFAULT_FORMAT_OPTIONS = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

// format ในเวลาไทยเสมอ — เวลาที่แสดง = เวลาเดียวกับที่เก็บ แม้เครื่องผู้ใช้ตั้ง timezone อื่น
const SERVER_TIME_ZONE = 'Asia/Bangkok'

// มี timezone marker แล้ว (Z หรือ +07:00 / -0500) — ห้ามเติมซ้ำ
const HAS_TZ_MARKER = /(?:Z|[+-]\d{2}:?\d{2})$/i

/**
 * แปลง DATETIME string จาก backend เป็น Date โดยผูกเวลาไทย (+07:00) เสมอ
 *
 * @param {string|Date|null|undefined} value เช่น '2026-09-01 10:00:00' หรือ '2026-09-01T10:00:00'
 * @returns {Date|null} Date หรือ null ถ้าค่าว่าง/แปลงไม่ได้
 */
export function parseServerDateTime(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  let text = String(value).trim()
  if (!text) return null

  // 'YYYY-MM-DD HH:mm:ss' → 'YYYY-MM-DDTHH:mm:ss' ให้ Date parser อ่านได้
  text = text.replace(' ', 'T')

  if (!HAS_TZ_MARKER.test(text)) {
    // date-only ('2026-09-01') ต้องมีเวลาต่อท้ายก่อน ไม่งั้น '+07:00' ต่อแล้ว invalid
    text += text.length === 10 ? 'T00:00:00+07:00' : '+07:00'
  }

  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Format DATETIME จาก backend เป็นภาษาไทยในเวลาไทย — เวลาที่แสดง = เวลาเดียวกับที่เก็บ (ICT)
 * ทุก timezone ของเครื่องผู้ใช้
 *
 * @param {string|Date|null|undefined} value
 * @param {Intl.DateTimeFormatOptions} [options] override รูปแบบ default ได้ (timeZone คงเป็นไทย)
 * @returns {string} ข้อความ th-TH หรือ '-' ถ้าแปลงไม่ได้
 */
export function formatServerDateTime(value, options) {
  const date = parseServerDateTime(value)
  if (!date) return '-'
  return date.toLocaleString('th-TH', {
    timeZone: SERVER_TIME_ZONE,
    ...DEFAULT_FORMAT_OPTIONS,
    ...options,
  })
}
