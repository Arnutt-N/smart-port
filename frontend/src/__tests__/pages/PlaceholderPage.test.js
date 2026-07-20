import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlaceholderPage from '@/pages/PlaceholderPage.vue'

describe('PlaceholderPage', () => {
  it('renders default title and description', () => {
    const wrapper = mount(PlaceholderPage)
    expect(wrapper.text()).toContain('หน้านี้')
    expect(wrapper.text()).toContain('กำลังพัฒนา')
  })

  it('renders custom title and description props', () => {
    const wrapper = mount(PlaceholderPage, {
      props: {
        title: 'ผลงานและข้อเสนอ',
        description: 'โมดูลนี้อยู่ระหว่างพัฒนา',
      },
    })
    expect(wrapper.text()).toContain('ผลงานและข้อเสนอ')
    expect(wrapper.text()).toContain('โมดูลนี้อยู่ระหว่างพัฒนา')
  })
})
