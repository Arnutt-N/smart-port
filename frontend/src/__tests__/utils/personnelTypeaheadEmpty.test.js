import { describe, expect, it } from 'vitest'
import {
  showPersonnelTypeaheadEmpty,
  personnelCreateLinkVisible,
  PERSONNEL_MASTER_CREATE_TO,
  PERSONNEL_MASTER_CREATE_LINK_LABEL,
  shouldOpenPersonnelMasterCreate,
} from '@/utils/personnelTypeaheadEmpty.js'

describe('showPersonnelTypeaheadEmpty', () => {
  it('is true when dropdown open, query long enough, and no results', () => {
    expect(showPersonnelTypeaheadEmpty({
      showDropdown: true,
      query: 'สมชาย',
      resultsLength: 0,
    })).toBe(true)
  })

  it('is false when results exist, dropdown closed, or query too short', () => {
    expect(showPersonnelTypeaheadEmpty({
      showDropdown: true,
      query: 'สมชาย',
      resultsLength: 1,
    })).toBe(false)
    expect(showPersonnelTypeaheadEmpty({
      showDropdown: false,
      query: 'สมชาย',
      resultsLength: 0,
    })).toBe(false)
    expect(showPersonnelTypeaheadEmpty({
      showDropdown: true,
      query: 'ส',
      resultsLength: 0,
    })).toBe(false)
  })
})

describe('personnelCreateLinkVisible', () => {
  it('is true only for admin when search did not fail', () => {
    expect(personnelCreateLinkVisible({ isAdmin: true, searchFailed: false })).toBe(true)
    expect(personnelCreateLinkVisible({ isAdmin: true, searchFailed: true })).toBe(false)
    expect(personnelCreateLinkVisible({ isAdmin: false, searchFailed: false })).toBe(false)
  })
})

describe('PERSONNEL_MASTER_CREATE_TO', () => {
  it('points at /personnel?create=1', () => {
    expect(PERSONNEL_MASTER_CREATE_TO).toEqual({
      path: '/personnel',
      query: { create: '1' },
    })
  })

  it('exposes Thai link label', () => {
    expect(PERSONNEL_MASTER_CREATE_LINK_LABEL).toBe('ไปสร้างที่ข้อมูลบุคลากร')
  })
})

describe('shouldOpenPersonnelMasterCreate', () => {
  it('is true for create=1', () => {
    expect(shouldOpenPersonnelMasterCreate({ create: '1' })).toBe(true)
  })

  it('is false without create=1', () => {
    expect(shouldOpenPersonnelMasterCreate({})).toBe(false)
    expect(shouldOpenPersonnelMasterCreate({ create: '0' })).toBe(false)
  })
})
