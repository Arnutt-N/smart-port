import { describe, expect, it } from 'vitest'
import { roleLabel } from '@/utils/roleLabels.js'

describe('roleLabel', () => {
  it('maps known roles in English and Thai', () => {
    expect(roleLabel('superadmin')).toBe('Superadmin')
    expect(roleLabel('admin', 'th')).toBe('ผู้ดูแลระบบ')
    expect(roleLabel('viewer', 'th')).toBe('ผู้ชม')
  })
})
