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

  it('เลข 12 หลักไม่ใช่ 13 หลัก — ผ่าน', () => {
    expect(() => toolJsonText({ a: '123456789012' })).not.toThrow()
  })

  it('เลข 14 หลักไม่ใช่ 13 หลัก — ผ่าน', () => {
    expect(() => toolJsonText({ a: '12345678901234' })).not.toThrow()
  })

  it.each([
    ['มีขีดคั่น 1-4-5-2-1', '1-2345-67890-12-3'],
    ['คั่นด้วยช่องว่าง', '1 2345 67890 12 3'],
    ['ตัวคั่นผสมขีด+ช่องว่าง', '1-2345 67890-12 3'],
    ['เลขไทย', '๑๒๓๔๕๖๗๘๙๐๑๒๓'],
    ['fullwidth', '１２３４５６７８９０１２３'],
    ['มี prefix จุดที่ไม่ใช่ทศนิยม', 'ID.1234567890123'],
    ['ส่วนจำนวนเต็ม 13 หลักของทศนิยม', '1234567890123.5'],
    ['ติดตัวอักษรหน้า-หลัง', 'x1234567890123y'],
  ])('ปฏิเสธเลขบัตรรูปแบบ: %s', (_label, value) => {
    expect(() => toolJsonText({ v: value })).toThrow('13 หลัก')
  })

  it('ปฏิเสธเมื่อเลขอยู่ใน key ของ object', () => {
    expect(() => toolJsonText({ '1234567890123': 1 })).toThrow('13 หลัก')
  })

  // ตัวเลข JSON จริง: มีแต่ส่วนจำนวนเต็มที่ถูกตรวจ — ทศนิยม 13 หลักไม่ใช่เลขบัตร (กันบล็อกผิด)
  it.each([
    ['ทศนิยมเป็นตัวเลข', { v: 12.3456789012345 }],
    ['ทศนิยมใน array', [0.1234567890123]],
    ['ทศนิยมติดลบ', { v: -0.1234567890123 }],
  ])('ผ่าน: %s', (_label, payload) => {
    expect(() => toolJsonText(payload)).not.toThrow()
  })

  // ในสตริง/key ไม่มีข้อยกเว้นทศนิยม (fail-closed): prefix เป็นตัวเลข+จุด/คอมมา/โคลอนก็ต้องไม่ทำให้เลขหลุด
  it.each([
    ['prefix เวอร์ชัน', 'v1.1234567890123'],
    ['prefix เลขข้อ', '5.1234567890123'],
    ['prefix ตัวเลข+จุดล้วน', '1.1234567890123'],
    ['หลังโคลอนในข้อความ', 'note:5.1234567890123'],
    ['หลังคอมมาในข้อความ', 'a,0.1234567890123'],
    ['ทศนิยมที่เป็นสตริง (trade-off: fail-closed)', '12.3456789012345'],
  ])('ปฏิเสธในสตริง: %s', (_label, value) => {
    expect(() => toolJsonText({ v: value })).toThrow('13 หลัก')
  })

  it('ปฏิเสธเลขที่ฝังลึกใน array/object ซ้อน (ทั้ง value และ key)', () => {
    expect(() => toolJsonText({ a: [{ b: [{ c: 'x 1-2345-67890-12-3 y' }] }] })).toThrow('13 หลัก')
    expect(() => toolJsonText({ a: { '1234567890123': 'v' } })).toThrow('13 หลัก')
  })

  // ลึก 50k: JSON.stringify เองล้มที่ ~4k ชั้น จึงต้องไล่หาเลขก่อน stringify ถึงพิสูจน์ได้ว่า walker เป็น iterative
  // (walker แบบ recursive จะล้มด้วย RangeError ที่ลึกขนาดนี้ ไม่ใช่ข้อความ 13 หลัก)
  const deepPayload = (leaf: unknown, depth: number): unknown => {
    let payload: unknown = { leaf }
    for (let level = 0; level < depth; level += 1) payload = { next: payload }
    return payload
  }

  it('JSON ซ้อนลึก 50k ชั้นที่ฝังเลขบัตรไว้ท้ายสุดยังถูกจับด้วยข้อความ 13 หลัก (walker เป็น iterative)', () => {
    expect(() => toolJsonText(deepPayload('บัตร 1234567890123', 50_000))).toThrow('13 หลัก')
  })

  it('JSON ซ้อนลึกเกินที่ stringify ได้ (ไม่มีเลข) → ข้อความไทยคงที่ ไม่ใช่ error ดิบของ engine', () => {
    let message = ''
    try {
      toolJsonText(deepPayload('ok', 50_000))
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('ส่งต่อได้')
    expect(message).not.toContain('call stack')
  })

  it('array กว้าง 200k สะอาด → ผ่าน (ไม่ล้มด้วย spread เกิน call-stack)', () => {
    expect(() => toolJsonText({ rows: new Array(200_000).fill(1) })).not.toThrow()
  })

  it('array กว้าง 200k ที่มีเลขบัตรอยู่ท้ายสุด → ถูกจับด้วยข้อความ 13 หลัก', () => {
    const rows: unknown[] = new Array(200_000).fill('x')
    rows.push('1234567890123')
    expect(() => toolJsonText({ rows })).toThrow('13 หลัก')
  })

  it('ปฏิเสธตัวเลข 13 หลักจำนวนเต็ม (รวมติดลบ และมีทศนิยมตามหลัง)', () => {
    expect(() => toolJsonText({ n: -1234567890123 })).toThrow('13 หลัก')
    expect(() => toolJsonText({ n: 1234567890123.5 })).toThrow('13 หลัก')
  })

  it('JSON.stringify ได้ undefined → throw ข้อความที่ส่งต่อไม่ได้ (ไม่คืน undefined)', () => {
    expect(() => toolJsonText(undefined)).toThrow('ส่งต่อได้')
  })

  it('ข้อความ error ของทุกรูปแบบไม่พิมพ์เลขที่ตรวจเจอ', () => {
    for (const value of ['1-2345-67890-12-3', '๑๒๓๔๕๖๗๘๙๐๑๒๓', 'ID.1234567890123']) {
      let message = ''
      try {
        toolJsonText({ v: value })
      } catch (error) {
        message = (error as Error).message
      }
      expect(message).not.toBe('')
      expect(message).not.toContain('2345')
      expect(message).not.toContain('๓๔๕')
    }
  })
})
