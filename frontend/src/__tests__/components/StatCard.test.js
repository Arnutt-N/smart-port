import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import StatCard from '@/components/StatCard.vue'

const DummyIcon = { render: () => h('svg') }

describe('StatCard', () => {
  it('renders label and value', () => {
    const wrapper = mount(StatCard, {
      props: { label: 'ทั้งหมด', value: 42, icon: DummyIcon },
    })
    expect(wrapper.text()).toContain('ทั้งหมด')
    expect(wrapper.text()).toContain('42')
  })

  it('shows green change class for positive change', () => {
    const wrapper = mount(StatCard, {
      props: { label: 'A', value: 1, icon: DummyIcon, change: '+5%' },
    })
    expect(wrapper.text()).toContain('+5% จากเดือนที่แล้ว')
    expect(wrapper.find('.text-green-600').exists()).toBe(true)
  })

  it('shows red change class for negative change', () => {
    const wrapper = mount(StatCard, {
      props: { label: 'A', value: 1, icon: DummyIcon, change: '-3%' },
    })
    expect(wrapper.find('.text-red-600').exists()).toBe(true)
  })

  it('shows gray change class for neutral change', () => {
    const wrapper = mount(StatCard, {
      props: { label: 'A', value: 1, icon: DummyIcon, change: 'คงที่' },
    })
    expect(wrapper.find('.text-gray-600').exists()).toBe(true)
  })

  it('renders sparkline bars when sparkline is true', () => {
    const wrapper = mount(StatCard, {
      props: { label: 'A', value: 1, icon: DummyIcon, sparkline: true },
    })
    const bars = wrapper.findAll('.flex.items-end .flex-1')
    expect(bars.length).toBe(8)
  })

  it('hides change and sparkline by default', () => {
    const wrapper = mount(StatCard, {
      props: { label: 'A', value: 1, icon: DummyIcon },
    })
    expect(wrapper.text()).not.toContain('จากเดือนที่แล้ว')
    expect(wrapper.findAll('.flex.items-end .flex-1')).toHaveLength(0)
  })
})
