import { parsePersonnelCreateQuery } from '@/utils/personnelCreateQuery.js'

/**
 * Profile shortcut → open create modal with personnel prefilled, then clear query.
 * Inactive / missing personnel do not open the modal.
 * @returns {Promise<boolean>} true if a create query was applied
 */
export async function applyPersonnelCreateQuery({
  route,
  router,
  openCreate,
  formData,
  personnelSearch,
  selectedPersonnelName = null,
  get,
  onUnavailable,
}) {
  const prefill = parsePersonnelCreateQuery(route.query)
  if (!prefill) return false

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
    return false
  }

  if (!Number(person.is_active)) {
    onUnavailable?.('inactive')
    return false
  }

  openCreate()
  formData.value.personnel_id = prefill.personnelId
  personnelSearch.value = prefill.fullName
  if (selectedPersonnelName) selectedPersonnelName.value = prefill.fullName
  return true
}
