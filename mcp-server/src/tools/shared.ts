// ข้อความ error ที่ model อ่านได้ — ภาษาไทย, ไม่มี stack trace, ไม่มี secret
export function toolErrorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'เกิดข้อผิดพลาดที่ไม่รู้จัก'
}

// ด่านสุดท้ายก่อนข้อมูลเข้า context ของ model (pii-policy: ห้าม citizen_id) — API redact ตาม role อยู่แล้ว
// นี่คือ defense-in-depth ถ้า redact หลุด: เลข 13 หลักติดกันตัวใดก็ตาม = ปฏิเสธทั้ง response (fail-closed)
// ยอมรับ false positive (เช่น timestamp ms) ดีกว่าปล่อยเลขบัตรหลุด; ข้อความ error ห้ามพิมพ์ค่าที่เจอ
const THIRTEEN_DIGITS = /(?<!\d)\d{13}(?!\d)/

export function toolJsonText(json: unknown): string {
  const text = JSON.stringify(json)
  if (THIRTEEN_DIGITS.test(text)) {
    throw new Error('ข้อมูลที่ได้มีเลข 13 หลัก (อาจเป็นเลขบัตรประชาชน) — ระบบไม่ส่งต่อเพื่อป้องกัน PII รั่ว แจ้งผู้ดูแลระบบ')
  }
  return text
}
