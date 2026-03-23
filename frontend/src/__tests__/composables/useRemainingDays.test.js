import { describe, it, expect } from 'vitest'
import { getRemainingDaysClass, formatRemainingDays } from '@/composables/useRemainingDays.js'

describe('getRemainingDaysClass', () => {
  it('returns red for days < 0', () => {
    expect(getRemainingDaysClass(-1)).toBe('text-red-600 font-medium')
    expect(getRemainingDaysClass(-30)).toBe('text-red-600 font-medium')
  })

  it('returns green for days === 0', () => {
    expect(getRemainingDaysClass(0)).toBe('text-green-600 font-medium')
  })

  it('returns orange for days 1-30', () => {
    expect(getRemainingDaysClass(1)).toBe('text-orange-600')
    expect(getRemainingDaysClass(15)).toBe('text-orange-600')
    expect(getRemainingDaysClass(30)).toBe('text-orange-600')
  })

  it('returns yellow for days > 30', () => {
    expect(getRemainingDaysClass(31)).toBe('text-yellow-600')
    expect(getRemainingDaysClass(100)).toBe('text-yellow-600')
  })

  it('returns gray for null/undefined', () => {
    expect(getRemainingDaysClass(null)).toBe('text-gray-400')
    expect(getRemainingDaysClass(undefined)).toBe('text-gray-400')
  })
})

describe('formatRemainingDays', () => {
  it('formats positive days in Thai', () => {
    expect(formatRemainingDays(45)).toBe('45 วัน')
  })

  it('formats zero as due today in Thai', () => {
    expect(formatRemainingDays(0)).toBe('ครบกำหนดวันนี้')
  })

  it('formats negative days as overdue in Thai', () => {
    expect(formatRemainingDays(-5)).toBe('เกิน 5 วัน')
    expect(formatRemainingDays(-30)).toBe('เกิน 30 วัน')
  })

  it('returns dash for null/undefined', () => {
    expect(formatRemainingDays(null)).toBe('-')
    expect(formatRemainingDays(undefined)).toBe('-')
  })
})
