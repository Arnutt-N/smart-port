// thaiDate.js — utility แปลง/format/parse วันที่ พ.ศ.↔ค.ศ. (pure, ไม่มี side effect)
//
// contract สำคัญ: ThaiDatePicker รับ/คืนค่าเป็น 'Y-m-d' (ค.ศ./Gregorian) เหมือน
// <input type="date"> เดิม — โค้ดนี้แปลงเป็น พ.ศ. เฉพาะตอนแสดง/รับจากผู้ใช้เท่านั้น
//
// GOTCHA timezone: ห้ามใช้ Date.toISOString() หรือ new Date('YYYY-MM-DD') เพราะ
// ตีความเป็น UTC ทำให้วันเลื่อนใน timezone +7 — ใช้ local component (getFullYear/
// getMonth/getDate) และ new Date(y, m-1, d) เสมอ

export const BE_OFFSET = 543

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

export const THAI_MONTHS_LONG = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

// เริ่มสัปดาห์ที่วันจันทร์ (จ=0 ... อา=6)
export const THAI_WEEKDAYS_SHORT = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

// ช่วงปี พ.ศ. ที่ยอมรับ + เกณฑ์สงสัยว่าพิมพ์ ค.ศ.
export const MIN_BE_YEAR = 2400
export const MAX_BE_YEAR = 2700
const SUSPECT_CE_THRESHOLD = 2500

export function toBE(ceYear) {
  return ceYear + BE_OFFSET
}

export function toCE(beYear) {
  return beYear - BE_OFFSET
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

// จำนวนวันในเดือน (month = 1-12, ceYear = ค.ศ.); day 0 ของเดือนถัดไป = วันสุดท้ายเดือนนี้
export function daysInMonth(ceYear, month) {
  return new Date(ceYear, month, 0).getDate()
}

// แปลง getDay() (อา=0..ส=6) → จันทร์=0..อาทิตย์=6
export function thaiDow(date) {
  return (date.getDay() + 6) % 7
}

// Date → 'Y-m-d' จาก local component (timezone-safe; ไม่ใช้ toISOString)
export function toYMD(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

// 'Y-m-d' (ค.ศ.) → Date local เที่ยงคืน; คืน null ถ้ารูปแบบผิดหรือวันไม่มีจริง
export function ymdToDate(ymd) {
  if (typeof ymd !== 'string') return null
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const date = new Date(year, month - 1, day)
  // กัน overflow เช่น '2026-02-31' ที่ JS จะเลื่อนไป มี.ค.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

// 'Y-m-d' (ค.ศ.) → { day, month, beYear } เป็น string (zero-padded, ปีเป็น พ.ศ.); '' ถ้า invalid
export function partsFromYMD(ymd) {
  const date = ymdToDate(ymd)
  if (!date) return { day: '', month: '', beYear: '' }
  return {
    day: pad2(date.getDate()),
    month: pad2(date.getMonth() + 1),
    beYear: String(toBE(date.getFullYear())),
  }
}

// 'Y-m-d' (ค.ศ.) → '16 มิ.ย. 2569' (พ.ศ.); '' ถ้า invalid
export function formatThaiShort(ymd) {
  const date = ymdToDate(ymd)
  if (!date) return ''
  return `${date.getDate()} ${THAI_MONTHS_SHORT[date.getMonth()]} ${toBE(date.getFullYear())}`
}

// parse ช่อง วว/ดด/ปปปป(พ.ศ.) → { ok, ymd, error, warning }
// - กรอกไม่ครบ → ok:false, error:'' (ยังไม่ถือเป็นข้อผิดพลาด)
// - กรอกครบแต่ผิด → ok:false, error:'<ข้อความ>'
// - ถูกต้อง → ok:true, ymd:'Y-m-d' (ค.ศ.)
export function parseParts(day, month, beYear) {
  const d = Number(day)
  const mo = Number(month)
  const by = Number(beYear)

  if (!day || !month || !beYear || Number.isNaN(d) || Number.isNaN(mo) || Number.isNaN(by)) {
    return { ok: false, ymd: '', error: '', warning: '' }
  }
  if (d < 1 || d > 31) {
    return { ok: false, ymd: '', error: 'วันที่ไม่ถูกต้อง (1-31)', warning: '' }
  }
  if (mo < 1 || mo > 12) {
    return { ok: false, ymd: '', error: 'เดือนไม่ถูกต้อง (1-12)', warning: '' }
  }

  const warning = by < SUSPECT_CE_THRESHOLD
    ? 'ปีดูเหมือนเป็น ค.ศ. — กรุณากรอกเป็น พ.ศ. (เช่น 2569)'
    : ''

  if (by < MIN_BE_YEAR || by > MAX_BE_YEAR) {
    return { ok: false, ymd: '', error: `ปี พ.ศ. ไม่ถูกต้อง (${MIN_BE_YEAR}-${MAX_BE_YEAR})`, warning }
  }

  const ceYear = toCE(by)
  if (d > daysInMonth(ceYear, mo)) {
    return { ok: false, ymd: '', error: 'วันที่ไม่มีในเดือนนี้', warning }
  }

  return { ok: true, ymd: `${ceYear}-${pad2(mo)}-${pad2(d)}`, error: '', warning }
}
