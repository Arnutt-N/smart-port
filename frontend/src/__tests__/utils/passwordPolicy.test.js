import { describe, expect, it } from 'vitest'
import {
  PASSWORD_MESSAGES,
  passwordErrorMessage,
  validatePassword,
} from '@/utils/passwordPolicy.js'

describe('passwordPolicy', () => {
  it('accepts a 12-code-point password with all required classes', () => {
    expect(validatePassword('Abcdefghij1!')).toEqual({ valid: true, code: null })
  })

  it('counts Unicode code points, not UTF-16 units (emoji is 2 units)', () => {
    // 12 code points — PHP mb_strlen นับแบบเดียวกัน
    expect(validatePassword('Abcdefghi1!🙂')).toEqual({ valid: true, code: null })
  })

  it('rejects passwords shorter than 12 code points', () => {
    expect(validatePassword('Abcdefg1!')).toEqual({ valid: false, code: 'too_short' })
  })

  it('reports the first missing class in backend order', () => {
    expect(validatePassword('abcdefghij1!').code).toBe('missing_uppercase')
    expect(validatePassword('ABCDEFGHIJ1!').code).toBe('missing_lowercase')
    expect(validatePassword('Abcdefghij!!').code).toBe('missing_number')
    expect(validatePassword('Abcdefghij12').code).toBe('missing_special')
  })

  it('enforces the 72 UTF-8 byte boundary', () => {
    const atLimit = `Aa1!${'a'.repeat(68)}` // 72 ASCII bytes
    const overLimit = `Aa1!${'a'.repeat(69)}` // 73 ASCII bytes
    expect(validatePassword(atLimit)).toEqual({ valid: true, code: null })
    expect(validatePassword(overLimit)).toEqual({ valid: false, code: 'too_many_bytes' })
  })

  it('maps every code to the verbatim backend message', () => {
    expect(PASSWORD_MESSAGES.too_short).toBe('รหัสผ่านต้องมีความยาวอย่างน้อย 12 ตัวอักษร')
    expect(PASSWORD_MESSAGES.too_many_bytes).toBe('รหัสผ่านต้องยาวไม่เกิน 72 bytes')
    expect(PASSWORD_MESSAGES.missing_uppercase).toBe('รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว')
    expect(PASSWORD_MESSAGES.missing_lowercase).toBe('รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว')
    expect(PASSWORD_MESSAGES.missing_number).toBe('รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว')
    expect(PASSWORD_MESSAGES.missing_special).toBe('รหัสผ่านต้องมีอักขระพิเศษอย่างน้อย 1 ตัว')
  })

  it('passwordErrorMessage returns first failing message or null when valid', () => {
    expect(passwordErrorMessage('Abcdefg1!')).toBe(PASSWORD_MESSAGES.too_short)
    expect(passwordErrorMessage('abcdefghij1!')).toBe(PASSWORD_MESSAGES.missing_uppercase)
    expect(passwordErrorMessage('Abcdefghij1!')).toBeNull()
  })
})
