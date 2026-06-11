import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from '@/components/EmptyState.vue'

describe('EmptyState', () => {
  it('renders title and description', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'ไม่พบข้อมูล', description: 'ยังไม่มีข้อมูลในขณะนี้' },
    })
    expect(wrapper.text()).toContain('ไม่พบข้อมูล')
    expect(wrapper.text()).toContain('ยังไม่มีข้อมูลในขณะนี้')
  })

  it('does not render action button when actionLabel is not provided', () => {
    const wrapper = mount(EmptyState)
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('renders action button with label when actionLabel is provided', () => {
    const wrapper = mount(EmptyState, {
      props: { actionLabel: 'ลองใหม่อีกครั้ง' },
    })
    const button = wrapper.find('button')
    expect(button.exists()).toBe(true)
    expect(button.text()).toBe('ลองใหม่อีกครั้ง')
  })

  it('emits action when the button is clicked', async () => {
    const wrapper = mount(EmptyState, {
      props: { actionLabel: 'ลองใหม่อีกครั้ง' },
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('action')).toBeTruthy()
    expect(wrapper.emitted('action')).toHaveLength(1)
  })

  it('still renders default slot content (backward compat)', () => {
    const wrapper = mount(EmptyState, {
      slots: { default: '<button class="slot-btn">retry</button>' },
    })
    expect(wrapper.find('.slot-btn').exists()).toBe(true)
  })
})
