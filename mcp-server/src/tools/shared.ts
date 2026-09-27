// ข้อความ error ที่ model อ่านได้ — ภาษาไทย, ไม่มี stack trace, ไม่มี secret
export function toolErrorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'เกิดข้อผิดพลาดที่ไม่รู้จัก'
}
