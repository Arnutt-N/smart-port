import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NotFoundPage from '@/pages/NotFoundPage.vue'

describe('NotFoundPage', () => {
  it('renders the 404 message with a home link', () => {
    const wrapper = mount(NotFoundPage, {
      global: {
        stubs: {
          RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
        },
      },
    })
    expect(wrapper.text()).toContain('ไม่พบหน้า')
    expect(wrapper.text()).toContain('404')
    const home = wrapper.find('a')
    expect(home.attributes('href')).toBe('/')
    expect(home.text()).toContain('กลับไปหน้าแรก')
  })
})
