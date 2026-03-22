import { describe, it, expect } from 'vitest'
import { getRemainingDaysClass, formatRemainingDays } from '@/composables/useRemainingDays.js'

describe('getRemainingDaysClass', () => {
  it('returns red for days < 7', () => {
    expect(getRemainingDaysClass(0)).toBe('text-red-600 font-medium')
    expect(getRemainingDaysClass(6)).toBe('text-red-600 font-medium')
  })

  it('returns orange for days 7-14', () => {
    expect(getRemainingDaysClass(7)).toBe('text-orange-600')
    expect(getRemainingDaysClass(14)).toBe('text-orange-600')
  })

  it('returns yellow for days 15-30', () => {
    expect(getRemainingDaysClass(15)).toBe('text-yellow-600')
    expect(getRemainingDaysClass(30)).toBe('text-yellow-600')
  })

  it('returns green for days > 30', () => {
    expect(getRemainingDaysClass(31)).toBe('text-green-600')
    expect(getRemainingDaysClass(100)).toBe('text-green-600')
  })

  it('returns gray for null/undefined', () => {
    expect(getRemainingDaysClass(null)).toBe('text-gray-400')
    expect(getRemainingDaysClass(undefined)).toBe('text-gray-400')
  })
})

describe('formatRemainingDays', () => {
  it('formats positive days in Thai', () => {
    expect(formatRemainingDays(45)).toBe('45 วัน')
    expect(formatRemainingDays(0)).toBe('0 วัน')
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
