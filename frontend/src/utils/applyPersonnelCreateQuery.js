import { parsePersonnelCreateQuery } from '@/utils/personnelCreateQuery.js'

/**
 * Profile shortcut → open create modal with personnel prefilled, then clear query.
 * @returns {boolean} true if a create query was consumed
 */
export function applyPersonnelCreateQuery({
  route,
  router,
  openCreate,
  formData,
  personnelSearch,
  selectedPersonnelName = null,
}) {
  const prefill = parsePersonnelCreateQuery(route.query)
  if (!prefill) return false
  openCreate()
  formData.value.personnel_id = prefill.personnelId
  personnelSearch.value = prefill.fullName
  if (selectedPersonnelName) selectedPersonnelName.value = prefill.fullName
  router.replace({ query: {} })
  return true
}
