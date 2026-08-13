import { describe, expect, it } from 'vitest'
import { isValidThaiCitizenId, thaiCitizenIdError } from '@/utils/thaiCitizenId.js'

describe('isValidThaiCitizenId', () => {
  it('accepts 13 digits with a valid checksum', () => {
    expect(isValidThaiCitizenId('1234567890121')).toBe(true)
  })

  it('rejects 13 digits with a bad checksum', () => {
    expect(isValidThaiCitizenId('1234567890123')).toBe(false)
  })

  it('rejects wrong length, non-digits, and empty', () => {
    expect(isValidThaiCitizenId('123456789012')).toBe(false)
    expect(isValidThaiCitizenId('12345678901234')).toBe(false)
    expect(isValidThaiCitizenId('123456789012a')).toBe(false)
    expect(isValidThaiCitizenId('')).toBe(false)
  })
})

describe('thaiCitizenIdError', () => {
  it('returns null when the ID is valid', () => {
    expect(thaiCitizenIdError('1234567890121')).toBeNull()
  })

  it('distinguishes format vs checksum', () => {
    expect(thaiCitizenIdError('123456789012')).toBe('เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก')
    expect(thaiCitizenIdError('1234567890123')).toBe('เลขบัตรประชาชนไม่ถูกต้อง')
  })
})
