import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'

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
