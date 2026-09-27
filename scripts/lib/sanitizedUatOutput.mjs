/**
 * ตัว formatter ผล UAT แบบ aggregate-only — ห้ามมี row data หลุด stdout/stderr
 *
 * mismatch field ที่อนุญาตต้องอยู่ใน allowlist ตายตัว (ฟิลด์ที่ compare ที่
 * scripts/uat-multiplier-live-api.mjs) เท่านั้น — ชื่ออื่นถูกตัดทิ้ง
 */

export const UAT_MISMATCH_FIELD_ALLOWLIST = Object.freeze([
  'eligible_start_date',
  'eligible_end_date',
  'service_days',
  'eligible_days',
  'effective_days',
  'bonus_days',
  'net_years',
  'net_months',
  'net_day_remainder',
])

/**
 * สร้าง summary สำหรับ log/report — นับได้อย่างเดียว ห้ามมีค่า row
 *
 * @param {{ total?: number, passed?: number, failed?: number, mismatchFields?: string[] }} stats
 * @returns {{ total: number, passed: number, failed: number, mismatchFields: Record<string, number> }}
 */
export function formatSanitizedUatSummary({
  total = 0,
  passed = 0,
  failed = 0,
  mismatchFields = [],
} = {}) {
  const counts = {}
  for (const field of mismatchFields) {
    if (UAT_MISMATCH_FIELD_ALLOWLIST.includes(field)) {
      counts[field] = (counts[field] || 0) + 1
    }
  }
  return {
    total: Number(total) || 0,
    passed: Number(passed) || 0,
    failed: Number(failed) || 0,
    mismatchFields: counts,
  }
}
