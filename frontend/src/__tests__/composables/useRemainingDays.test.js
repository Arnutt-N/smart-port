import { describe, it, expect } from 'vitest'
import { getRemainingDaysClass, getCandidateRemainingDaysClass, formatRemainingDays } from '@/composables/useRemainingDays.js'

describe('getRemainingDaysClass (probation)', () => {
  it('returns red for days < 0 (overdue)', () => {
    expect(getRemainingDaysClass(-1)).toBe('text-red-600 font-medium')
    expect(getRemainingDaysClass(-30)).toBe('text-red-600 font-medium')
  })

  it('returns green for days === 0 (due today)', () => {
    expect(getRemainingDaysClass(0)).toBe('text-green-600 font-medium')
  })

  it('returns orange for days 1-30 (near deadline)', () => {
    expect(getRemainingDaysClass(1)).toBe('text-orange-600 font-medium')
    expect(getRemainingDaysClass(30)).toBe('text-orange-600 font-medium')
  })

  it('returns yellow for days > 30 (not due)', () => {
    expect(getRemainingDaysClass(31)).toBe('text-yellow-600')
  })

  it('returns gray for null/undefined', () => {
    expect(getRemainingDaysClass(null)).toBe('text-gray-400')
    expect(getRemainingDaysClass(undefined)).toBe('text-gray-400')
  })
})

describe('getCandidateRemainingDaysClass', () => {
  it('returns normal text for days < 0 (already met criteria)', () => {
    expect(getCandidateRemainingDaysClass(-1)).toBe('text-gray-700')
    expect(getCandidateRemainingDaysClass(-100)).toBe('text-gray-700')
  })

  it('returns green for days === 0 (met today)', () => {
    expect(getCandidateRemainingDaysClass(0)).toBe('text-green-600 font-medium')
  })

  it('returns orange for days 1-30 (near criteria)', () => {
    expect(getCandidateRemainingDaysClass(1)).toBe('text-orange-600 font-medium')
    expect(getCandidateRemainingDaysClass(30)).toBe('text-orange-600 font-medium')
  })

  it('returns yellow for days > 30 (not met)', () => {
    expect(getCandidateRemainingDaysClass(31)).toBe('text-yellow-600')
  })

  it('returns gray for null/undefined', () => {
    expect(getCandidateRemainingDaysClass(null)).toBe('text-gray-400')
  })
})

describe('formatRemainingDays', () => {
  it('formats positive days in Thai', () => {
    expect(formatRemainingDays(45)).toBe('45 วัน')
  })

  it('formats zero as due today', () => {
    expect(formatRemainingDays(0)).toBe('ครบกำหนดวันนี้')
  })

  it('formats negative days as overdue in Thai', () => {
    expect(formatRemainingDays(-5)).toBe('เกิน 5 วัน')
  })

  it('returns dash for null/undefined', () => {
    expect(formatRemainingDays(null)).toBe('-')
    expect(formatRemainingDays(undefined)).toBe('-')
  })
})
