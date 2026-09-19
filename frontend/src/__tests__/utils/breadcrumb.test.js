import { describe, expect, it } from 'vitest'
import { CANDIDATE_SECTION_LABELS, resolveTrail } from '@/utils/breadcrumb.js'

describe('resolveTrail', () => {
  it('returns meta breadcrumb when present', () => {
    expect(resolveTrail({ name: 'admin', meta: { title: 'การจัดการงาน', breadcrumb: ['การจัดการงาน'] } }))
      .toEqual(['การจัดการงาน'])
  })

  it('returns empty trail when meta is missing (never a fake Dashboard)', () => {
    // contract ตั้งใจเดียวกับ PageBreadcrumb.test.js — Topbar ซ่อนตัวคั่นเองเมื่อ trail ว่าง
    expect(resolveTrail({ name: 'unknown', meta: {} })).toEqual([])
    expect(resolveTrail({})).toEqual([])
  })

  it('returns empty trail for explicit null (no throw)', () => {
    expect(resolveTrail(null)).toEqual([])
  })

  it('expands candidates trail with the dynamic section label', () => {
    expect(resolveTrail({ name: 'candidates', params: { section: 'academic' } }))
      .toEqual(['Candidate Lists', 'วิชาการ'])
  })

  it('returns base Candidate Lists for unknown section', () => {
    expect(resolveTrail({ name: 'candidates', params: { section: 'xxx' } })).toEqual(['Candidate Lists'])
  })
})

describe('CANDIDATE_SECTION_LABELS parity', () => {
  // ล็อกให้ตรงกับ categoryConfig.breadcrumb ใน CandidateListsPage.vue —
  // เปลี่ยนป้ายต้องแก้ 2 ที่พร้อมกัน (แตกดังดีกว่า drift เงียบ)
  it('matches the page header labels', () => {
    expect(CANDIDATE_SECTION_LABELS).toEqual({
      overview: 'ภาพรวม',
      general: 'ทั่วไป',
      academic: 'วิชาการ',
      support: 'อำนวยการ',
      management: 'บริหาร',
    })
  })
})
