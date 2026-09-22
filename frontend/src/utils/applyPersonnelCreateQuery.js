import { parsePersonnelCreateQuery } from '@/utils/personnelCreateQuery.js'

/**
 * Profile shortcut → open create modal with personnel prefilled, then clear query.
 * Inactive / missing personnel do not open the modal.
 * @returns {Promise<object|null>} fetched person when applied, else null (caller prefills)
 */
export async function applyPersonnelCreateQuery({
  route,
  router,
  openCreate,
  get,
  onUnavailable,
}) {
  const prefill = parsePersonnelCreateQuery(route.query)
  if (!prefill) return null

  router.replace({ query: {} })

  let person = null
  try {
    const result = await get(`/personnel/${prefill.personnelId}`)
    person = result?.data ?? null
  } catch {
    person = null
  }

  if (!person) {
    onUnavailable?.('missing')
    return null
  }

  if (!Number(person.is_active)) {
    onUnavailable?.('inactive')
    return null
  }

  openCreate()
  return person
}
