/**
 * Build a standard TableRowActions action list (view?/edit?/admin-gated delete).
 * Handlers stay in the page; this only shapes the actions array.
 *
 * @param {object} opts
 * @param {Function} [opts.onView]
 * @param {Function} [opts.onEdit]
 * @param {Function} [opts.onDelete]
 * @param {boolean} [opts.canDelete=false]
 * @returns {{ key: string, label: string, variant?: string, onClick: Function }[]}
 */
export function buildStandardRowActions({
  onView,
  onEdit,
  onDelete,
  canDelete = false,
} = {}) {
  const actions = []
  if (onView) {
    actions.push({ key: 'view', label: 'ดูรายละเอียด', onClick: onView })
  }
  if (onEdit) {
    actions.push({ key: 'edit', label: 'แก้ไข', onClick: onEdit })
  }
  if (onDelete && canDelete) {
    actions.push({ key: 'delete', label: 'ลบ', variant: 'danger', onClick: onDelete })
  }
  return actions
}
