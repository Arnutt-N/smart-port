export const PERSONNEL_CREATE_QUERY_UNAVAILABLE = {
  inactive: 'บุคลากรนี้ถูกปิดใช้งาน ไม่สามารถเพิ่มรายการใหม่ได้',
  missing: 'ไม่พบบุคลากร ไม่สามารถเปิดฟอร์มเพิ่มรายการได้',
}

/**
 * Parse profile → time-page shortcut query:
 * ?create=1&personnel_id=123&full_name=...
 * @returns {{ personnelId: number, fullName: string } | null}
 */
export function parsePersonnelCreateQuery(query = {}) {
  if (String(query?.create ?? '') !== '1') return null
  const personnelId = Number(query.personnel_id)
  if (!Number.isFinite(personnelId) || personnelId <= 0) return null
  return {
    personnelId,
    fullName: typeof query.full_name === 'string' ? query.full_name : '',
  }
}
