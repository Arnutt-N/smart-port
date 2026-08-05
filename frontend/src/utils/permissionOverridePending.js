/**
 * Build a pending permission-matrix change for PUT /settings/permissions.
 * Matching the default clears an existing override (reset); otherwise upserts allowed.
 * Returns null when the cell already matches the default and has no override (no-op).
 *
 * @param {boolean} [hasOverride=true]
 * @returns {{ role: string, action: string, resource: string, reset?: true, allowed?: boolean } | null}
 */
export function buildPendingOverride(
  role,
  action,
  resource,
  allowed,
  defaultAllowed,
  hasOverride = true
) {
  if (allowed === Boolean(defaultAllowed)) {
    if (!hasOverride) {
      return null
    }
    return { role, action, resource, reset: true }
  }
  return { role, action, resource, allowed }
}
