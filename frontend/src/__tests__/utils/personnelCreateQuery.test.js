import { describe, expect, it } from 'vitest'
import { parsePersonnelCreateQuery } from '@/utils/personnelCreateQuery.js'

describe('parsePersonnelCreateQuery', () => {
  it('returns personnel prefill when create=1 and valid id', () => {
    expect(parsePersonnelCreateQuery({
      create: '1',
      personnel_id: '12',
      full_name: 'นายสมชาย ไทยแท้',
    })).toEqual({
      personnelId: 12,
      fullName: 'นายสมชาย ไทยแท้',
    })
  })

  it('returns null without create=1', () => {
    expect(parsePersonnelCreateQuery({
      personnel_id: '12',
      full_name: 'นายสมชาย ไทยแท้',
    })).toBeNull()
  })

  it('returns null for invalid personnel_id', () => {
    expect(parsePersonnelCreateQuery({ create: '1', personnel_id: '0' })).toBeNull()
    expect(parsePersonnelCreateQuery({ create: '1', personnel_id: 'abc' })).toBeNull()
  })
})
