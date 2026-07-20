import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PaginationBar from '@/components/PaginationBar.vue'

describe('PaginationBar', () => {
  const defaultProps = {
    total: 50,
    limit: 10,
    offset: 0,
  }

  it('shows correct Thai display text', () => {
    const wrapper = mount(PaginationBar, { props: defaultProps })
    expect(wrapper.text()).toContain('แสดง 1 ถึง 10 จาก 50 รายการ')
  })

  it('disables previous button on first page', () => {
    const wrapper = mount(PaginationBar, { props: defaultProps })
    const prevBtn = wrapper.findAll('button')[0]
    expect(prevBtn.attributes('disabled')).toBeDefined()
  })

  it('enables next button when more pages exist', () => {
    const wrapper = mount(PaginationBar, { props: defaultProps })
    const buttons = wrapper.findAll('button')
    const nextBtn = buttons[buttons.length - 1]
    expect(nextBtn.attributes('disabled')).toBeUndefined()
  })

  it('disables next button on last page', () => {
    const wrapper = mount(PaginationBar, {
      props: { total: 50, limit: 10, offset: 40 },
    })
    const buttons = wrapper.findAll('button')
    const nextBtn = buttons[buttons.length - 1]
    expect(nextBtn.attributes('disabled')).toBeDefined()
  })

  it('emits update:offset when next is clicked', async () => {
    const wrapper = mount(PaginationBar, { props: defaultProps })
    const buttons = wrapper.findAll('button')
    const nextBtn = buttons[buttons.length - 1]
    await nextBtn.trigger('click')
    expect(wrapper.emitted('update:offset')).toBeTruthy()
    expect(wrapper.emitted('update:offset')[0]).toEqual([10])
  })

  it('shows nothing when total is 0', () => {
    const wrapper = mount(PaginationBar, {
      props: { total: 0, limit: 10, offset: 0 },
    })
    expect(wrapper.text()).toContain('0 รายการ')
  })

  it('emits update:offset when previous is clicked', async () => {
    const wrapper = mount(PaginationBar, {
      props: { total: 50, limit: 10, offset: 20 },
    })
    const prevBtn = wrapper.findAll('button')[0]
    await prevBtn.trigger('click')
    expect(wrapper.emitted('update:offset')[0]).toEqual([10])
  })

  it('emits update:offset when a page number is clicked', async () => {
    const wrapper = mount(PaginationBar, { props: defaultProps })
    const page3 = wrapper.findAll('button').find((b) => b.text() === '3')
    await page3.trigger('click')
    expect(wrapper.emitted('update:offset')[0]).toEqual([20])
  })

  it('shows ellipsis for many pages when not near edges', () => {
    const wrapper = mount(PaginationBar, {
      props: { total: 200, limit: 10, offset: 100 },
    })
    expect(wrapper.text()).toContain('...')
    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).toContain('20')
  })

  it('highlights the current page button', () => {
    const wrapper = mount(PaginationBar, {
      props: { total: 50, limit: 10, offset: 20 },
    })
    const page3 = wrapper.findAll('button').find((b) => b.text() === '3')
    expect(page3.classes()).toContain('bg-blue-500')
  })
})
