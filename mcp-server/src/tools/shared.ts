// ข้อความ error ที่ model อ่านได้ — ภาษาไทย, ไม่มี stack trace, ไม่มี secret
export function toolErrorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'เกิดข้อผิดพลาดที่ไม่รู้จัก'
}

// ด่านสุดท้ายก่อนข้อมูลเข้า context ของ model (pii-policy: ห้าม citizen_id) — API redact ตาม role อยู่แล้ว
// นี่คือ defense-in-depth ถ้า redact หลุด: เลข 13 หลักติดกันตัวใดก็ตาม = ปฏิเสธทั้ง response (fail-closed)
// ยอมรับ false positive (เช่น timestamp ms) ดีกว่าปล่อยเลขบัตรหลุด; ข้อความ error ห้ามพิมพ์ค่าที่เจอ
// ครอบ: ติดกัน 13 หลัก + แบบมีตัวคั่น 1-4-5-2-1 (ขีด/ช่องว่าง) + เลขไทย/fullwidth (\p{Nd})
// ข้อจำกัดที่ยอมรับ (MS-03/MS-13): เลขที่คั่นด้วย zero-width character, หรือจัดกลุ่มด้วย . _ / หรือ 4-4-4-1 ไม่ถูกจับ
// ไล่ที่ "ค่าที่ parse แล้ว" ไม่ใช่ข้อความ JSON เพราะ regex บนข้อความแยก "ทศนิยมที่เป็นตัวเลข" ออกจาก "สตริงที่มีจุดนำหน้า" ไม่ได้:
//   สตริง/key → ตรวจเข้มทุกกรณี (รวม `5.1234567890123` และทศนิยมที่เป็นสตริง — fail-closed)
//   ตัวเลข   → ตรวจเฉพาะส่วนจำนวนเต็ม (ทศนิยม 13 หลักหลังจุดไม่ใช่เลขบัตร)
const CITIZEN_ID_PATTERNS: readonly RegExp[] = [
  /(?<!\p{Nd})\p{Nd}{13}(?!\p{Nd})/u,
  /(?<!\p{Nd})\p{Nd}[\s-]\p{Nd}{4}[\s-]\p{Nd}{5}[\s-]\p{Nd}{2}[\s-]\p{Nd}(?!\p{Nd})/u,
]

const looksLikeCitizenId = (text: string): boolean => CITIZEN_ID_PATTERNS.some((pattern) => pattern.test(text))

// iterative (ไม่ recursive) กัน stack overflow กับ JSON ซ้อนลึก
function containsCitizenId(root: unknown): boolean {
  const pending: unknown[] = [root]
  while (pending.length > 0) {
    const value = pending.pop()
    if (typeof value === 'string') {
      if (looksLikeCitizenId(value)) return true
    } else if (typeof value === 'number') {
      if (Number.isFinite(value) && looksLikeCitizenId(String(Math.trunc(value)))) return true
    } else if (Array.isArray(value)) {
      // loop ไม่ใช่ push(...value): spread ส่ง element เป็น argument ซึ่งล้ม (RangeError) เมื่อ array เกิน ~120k
      for (const item of value) pending.push(item)
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value)) {
        if (looksLikeCitizenId(key)) return true
        pending.push(child)
      }
    }
  }
  return false
}

const NOT_FORWARDABLE = 'ข้อมูลตอบกลับไม่ใช่ JSON ที่ส่งต่อได้'

export function toolJsonText(json: unknown): string {
  // ไล่หาเลขก่อน stringify: JSON.stringify เองเป็น recursive และล้มที่ ~4k ชั้น — ถ้า stringify ก่อน เลขที่ฝังลึกจะไม่ถูกตรวจ
  if (containsCitizenId(json)) {
    throw new Error('ข้อมูลที่ได้มีเลข 13 หลัก (อาจเป็นเลขบัตรประชาชน) — ระบบไม่ส่งต่อเพื่อป้องกัน PII รั่ว แจ้งผู้ดูแลระบบ')
  }
  let text: string | undefined
  try {
    text = JSON.stringify(json)
  } catch {
    text = undefined // ซ้อนลึกเกิน/มีค่าที่ serialize ไม่ได้ (เช่น BigInt) — ไม่ส่งต่อข้อความดิบของ engine ให้ model
  }
  if (typeof text !== 'string') {
    throw new Error(NOT_FORWARDABLE)
  }
  return text
}
