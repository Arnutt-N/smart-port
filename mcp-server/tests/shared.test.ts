import { describe, expect, it } from 'vitest'
import { toolJsonText } from '../src/tools/shared.js'

describe('toolJsonText — M3 13-digit guard', () => {
  it('payload ปกติ (id เล็ก/วันที่/ยอดนับ) ผ่านและเท่ากับ JSON.stringify', () => {
    const json = { success: true, total: 42, rows: [{ enrollment_id: 7, qualification_date: '2026-10-01' }] }
    expect(toolJsonText(json)).toBe(JSON.stringify(json))
  })

  it('เลข 13 หลักใน string ถูกปฏิเสธ (fail-closed)', () => {
    expect(() => toolJsonText({ citizen_id: '1234567890123' })).toThrow('13 หลัก')
  })

  it('เลข 13 หลักที่เป็น number ก็ถูกปฏิเสธ', () => {
    expect(() => toolJsonText({ n: 1234567890123 })).toThrow('13 หลัก')
  })

  it('เลข 13 หลักที่ซ่อนใน string ยาว/ซ้อนลึกก็ถูกปฏิเสธ', () => {
    expect(() => toolJsonText({ a: [{ b: 'บัตร 1234567890123 หมดอายุ' }] })).toThrow()
  })

  it('ข้อความ error ไม่พิมพ์ค่าที่ตรวจเจอ', () => {
    let message = ''
    try {
      toolJsonText({ x: '1234567890123' })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).not.toBe('')
    expect(message).not.toContain('1234567890123')
  })

  it('เลข 12 หรือ 14 หลักไม่ใช่ 13 หลัก — ผ่าน', () => {
    expect(() => toolJsonText({ a: '123456789012', b: '12345678901234' })).not.toThrow()
  })
})
