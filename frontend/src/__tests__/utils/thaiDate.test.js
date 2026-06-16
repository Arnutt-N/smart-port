import { describe, it, expect } from 'vitest'
import {
  toBE,
  toCE,
  toYMD,
  ymdToDate,
  partsFromYMD,
  formatThaiShort,
  parseParts,
  daysInMonth,
  thaiDow,
} from '@/utils/thaiDate.js'

describe('thaiDate conversion', () => {
  it('toBE adds 543 (ค.ศ. → พ.ศ.)', () => {
    expect(toBE(2026)).toBe(2569)
  })

  it('toCE subtracts 543 (พ.ศ. → ค.ศ.)', () => {
    expect(toCE(2569)).toBe(2026)
  })
})

describe('toYMD (timezone-safe)', () => {
  it('formats a local Date to Y-m-d', () => {
    // มิ.ย. = month index 5
    expect(toYMD(new Date(2026, 5, 16))).toBe('2026-06-16')
  })

  it('does not shift across year boundary (1 ม.ค.)', () => {
    expect(toYMD(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('does not shift across year boundary (31 ธ.ค.)', () => {
    expect(toYMD(new Date(2025, 11, 31))).toBe('2025-12-31')
  })

  it('returns empty string for invalid input', () => {
    expect(toYMD('nope')).toBe('')
    expect(toYMD(new Date('invalid'))).toBe('')
  })
})

describe('ymdToDate', () => {
  it('parses a valid Y-m-d to local Date', () => {
    const d = ymdToDate('2026-06-16')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(16)
  })

  it('rejects overflow dates (2026-02-31)', () => {
    expect(ymdToDate('2026-02-31')).toBeNull()
  })

  it('rejects malformed strings', () => {
    expect(ymdToDate('2026-6-16')).toBeNull()
    expect(ymdToDate('')).toBeNull()
    expect(ymdToDate(null)).toBeNull()
  })
})

describe('partsFromYMD', () => {
  it('splits Y-m-d into zero-padded พ.ศ. parts', () => {
    expect(partsFromYMD('2026-06-16')).toEqual({ day: '16', month: '06', beYear: '2569' })
  })

  it('returns empty parts for invalid input', () => {
    expect(partsFromYMD('')).toEqual({ day: '', month: '', beYear: '' })
    expect(partsFromYMD('garbage')).toEqual({ day: '', month: '', beYear: '' })
  })
})

describe('formatThaiShort', () => {
  it('renders a Thai short date in พ.ศ.', () => {
    expect(formatThaiShort('2026-06-16')).toBe('16 มิ.ย. 2569')
  })

  it('returns empty string for invalid input', () => {
    expect(formatThaiShort('')).toBe('')
  })
})

describe('parseParts', () => {
  it('produces Y-m-d (ค.ศ.) from valid พ.ศ. parts', () => {
    const r = parseParts('16', '06', '2569')
    expect(r.ok).toBe(true)
    expect(r.ymd).toBe('2026-06-16')
  })

  it('flags day that does not exist in month (31 ก.พ.)', () => {
    const r = parseParts('31', '02', '2569')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('ไม่มีในเดือน')
  })

  it('accepts 29 ก.พ. in a leap year (พ.ศ. 2567 = ค.ศ. 2024)', () => {
    expect(parseParts('29', '02', '2567').ok).toBe(true)
  })

  it('rejects 29 ก.พ. in a non-leap year (พ.ศ. 2569 = ค.ศ. 2026)', () => {
    expect(parseParts('29', '02', '2569').ok).toBe(false)
  })

  it('rejects out-of-range month', () => {
    expect(parseParts('16', '13', '2569').ok).toBe(false)
  })

  it('rejects a year that looks like ค.ศ. and surfaces a warning', () => {
    const r = parseParts('16', '06', '2026')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('ปี พ.ศ. ไม่ถูกต้อง')
    expect(r.warning).toContain('ค.ศ.')
  })

  it('treats incomplete input as not-yet-error', () => {
    const r = parseParts('16', '', '')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('')
  })
})

describe('calendar helpers', () => {
  it('daysInMonth handles February leap/non-leap', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2026, 6)).toBe(30)
  })

  it('thaiDow maps Monday to 0', () => {
    // 2026-06-15 เป็นวันจันทร์
    expect(thaiDow(new Date(2026, 5, 15))).toBe(0)
  })
})
