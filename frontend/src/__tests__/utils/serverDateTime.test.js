import { describe, expect, it } from 'vitest'
import { formatServerDateTime, parseServerDateTime } from '@/utils/serverDateTime.js'

// หมายเหตุ: การ assert "แสดง 10:00" ทำได้ deterministic โดยไม่ต้องแก้ TZ ของ process
// เพราะ helper format ด้วย timeZone: 'Asia/Bangkok' เสมอ (เวลาที่แสดง = เวลาที่เก็บทุกเครื่อง)

describe('parseServerDateTime', () => {
  it('binds server DATETIME strings to +07:00 (not Z)', () => {
    // '2026-09-01 10:00:00' เก็บเป็นเวลาไทยแล้ว — instant ต้องเท่ากับ 10:00+07:00 (03:00 UTC)
    expect(parseServerDateTime('2026-09-01 10:00:00').getTime()).toBe(
      Date.parse('2026-09-01T10:00:00+07:00'),
    )
    // ถ้าตีความผิดเป็น UTC ('Z') instant จะเพี้ยนไป 7 ชม.
    expect(parseServerDateTime('2026-09-01 10:00:00').getTime()).not.toBe(
      Date.parse('2026-09-01T10:00:00Z'),
    )
  })

  it('accepts the T-separated ISO-ish form from the backend as well', () => {
    expect(parseServerDateTime('2026-07-01T10:30:00').getTime()).toBe(
      Date.parse('2026-07-01T10:30:00+07:00'),
    )
  })

  it('keeps explicit timezone markers untouched', () => {
    expect(parseServerDateTime('2026-09-01T03:00:00Z').getTime()).toBe(
      Date.parse('2026-09-01T03:00:00Z'),
    )
    expect(parseServerDateTime('2026-09-01T03:00:00+00:00').getTime()).toBe(
      Date.parse('2026-09-01T03:00:00+00:00'),
    )
  })

  it('parses date-only strings as Thai midnight', () => {
    expect(parseServerDateTime('2026-09-01').getTime()).toBe(
      Date.parse('2026-09-01T00:00:00+07:00'),
    )
  })

  it('returns null for empty or invalid input', () => {
    expect(parseServerDateTime(null)).toBeNull()
    expect(parseServerDateTime(undefined)).toBeNull()
    expect(parseServerDateTime('')).toBeNull()
    expect(parseServerDateTime('not-a-date')).toBeNull()
  })
})

describe('formatServerDateTime', () => {
  it("displays '2026-09-01 10:00:00' as 10:00 ICT — เวลาเดียวกับที่เก็บ", () => {
    const formatted = formatServerDateTime('2026-09-01 10:00:00')
    expect(formatted).toContain('10:00')
    expect(formatted).not.toContain('17:00') // จะเป็นค่านี้ถ้า helper ใช้ 'Z'
    expect(formatted).not.toContain('03:00') // จะเป็นค่านี้ถ้า parse เป็น UTC แต่ format ที่เครื่อง UTC
    // ปี พ.ศ. (2569 = ค.ศ. 2026 + 543) — th-TH default calendar
    expect(formatted).toContain('2569')
  })

  it('returns a dash for empty or invalid values', () => {
    expect(formatServerDateTime(null)).toBe('-')
    expect(formatServerDateTime('')).toBe('-')
    expect(formatServerDateTime('garbage')).toBe('-')
  })

  it('supports custom format options while keeping the Thai time zone', () => {
    // options override เป็นราย key — default (วัน/เดือน/ปี) ยังอยู่ แต่เวลายังเป็น 10:00 เวลาไทย
    const formatted = formatServerDateTime('2026-09-01 10:00:00', { hour: '2-digit', minute: '2-digit' })
    expect(formatted).toContain('10:00')
    expect(formatted).toContain('2569')
  })
})
