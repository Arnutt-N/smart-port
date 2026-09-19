import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import { resolveTrail } from '@/utils/breadcrumb.js'

describe('PageBreadcrumb', () => {
  it('renders label as the only crumb after Home', () => {
    const wrapper = mount(PageBreadcrumb, { props: { label: 'พ้นทดลอง' } })
    expect(wrapper.text()).toContain('พ้นทดลอง')
    expect(wrapper.attributes('aria-label')).toBe('Breadcrumb')
  })

  it('prefers items over label when provided', () => {
    const wrapper = mount(PageBreadcrumb, {
      props: { label: 'ignored', items: ['หมวด', 'รายการ'] },
    })
    expect(wrapper.text()).toContain('หมวด')
    expect(wrapper.text()).toContain('รายการ')
    expect(wrapper.text()).not.toContain('ignored')
  })
})

describe('resolveTrail (Topbar single source)', () => {
  it('returns meta breadcrumb for plain routes', () => {
    expect(resolveTrail({ name: 'personnel', meta: { breadcrumb: ['ข้อมูลบุคลากร'] } }))
      .toEqual(['ข้อมูลบุคลากร'])
  })

  it('keeps the two-level trail for special-areas', () => {
    expect(resolveTrail({ name: 'settings-special-areas', meta: { breadcrumb: ['การนับทวีคูณ', 'จัดการพื้นที่พิเศษ'] } }))
      .toEqual(['การนับทวีคูณ', 'จัดการพื้นที่พิเศษ'])
  })

  it('appends the dynamic section label for candidates', () => {
    const base = { name: 'candidates', meta: { breadcrumb: ['Candidate Lists'] } }
    expect(resolveTrail({ ...base, params: { section: 'overview' } }))
      .toEqual(['Candidate Lists', 'ภาพรวม'])
    expect(resolveTrail({ ...base, params: { section: 'general' } }))
      .toEqual(['Candidate Lists', 'ทั่วไป'])
    expect(resolveTrail({ ...base, params: { section: 'management' } }))
      .toEqual(['Candidate Lists', 'บริหาร'])
  })

  it('falls back to the base trail for unknown candidate sections', () => {
    expect(resolveTrail({ name: 'candidates', params: { section: 'nope' }, meta: { breadcrumb: ['Candidate Lists'] } }))
      .toEqual(['Candidate Lists'])
  })

  it('returns empty trail when meta is missing (never a fake Dashboard)', () => {
    expect(resolveTrail({ name: 'unknown', meta: {} })).toEqual([])
    expect(resolveTrail({})).toEqual([])
  })
})
