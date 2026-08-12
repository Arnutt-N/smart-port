/**
 * Typeahead empty-state helpers for time-entry modals (ADR-0004 §7).
 * Admin gets a link to create on ข้อมูลบุคลากร — never inline create.
 */

export const PERSONNEL_MASTER_CREATE_TO = {
  path: '/personnel',
  query: { create: '1' },
}

export const PERSONNEL_MASTER_CREATE_LINK_LABEL = 'ไปสร้างที่ข้อมูลบุคลากร'

/**
 * Same gate as the existing empty message under typeahead inputs.
 */
export function showPersonnelTypeaheadEmpty({
  showDropdown = false,
  query = '',
  resultsLength = 0,
} = {}) {
  return Boolean(showDropdown)
    && String(query).trim().length >= 2
    && Number(resultsLength) === 0
}

/**
 * Link only when admin/superadmin and search succeeded with zero hits.
 */
export function personnelCreateLinkVisible({ isAdmin = false, searchFailed = false } = {}) {
  return Boolean(isAdmin) && !searchFailed
}

/**
 * Personnel master page: open create modal from ?create=1
 */
export function shouldOpenPersonnelMasterCreate(query = {}) {
  return String(query?.create ?? '') === '1'
}
