import { describe, expect, it } from 'vitest'
import { buildPendingOverride } from '@/utils/permissionOverridePending.js'

describe('buildPendingOverride', () => {
  it('emits reset when value matches default and an override exists', () => {
    expect(buildPendingOverride('operator', 'delete', 'multiplier', false, false, true)).toEqual({
      role: 'operator',
      action: 'delete',
      resource: 'multiplier',
      reset: true,
    })
  })

  it('returns null when value already matches default with no override', () => {
    expect(buildPendingOverride('operator', 'delete', 'multiplier', false, false, false)).toBeNull()
  })

  it('emits upsert when value differs from default', () => {
    expect(buildPendingOverride('operator', 'delete', 'multiplier', true, false, false)).toEqual({
      role: 'operator',
      action: 'delete',
      resource: 'multiplier',
      allowed: true,
    })
  })
})
