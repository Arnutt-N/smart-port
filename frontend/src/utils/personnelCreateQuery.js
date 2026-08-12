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
