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

  // N48: ตัด props change/sparkline — เทสเดิมที่อ้างพฤติกรรมของ props ตายถูกลบ
  // คงยืนยันว่า render label/value พร้อม icon ทุก call site (10 หน้า)
  it('renders icon component', () => {
    const wrapper = mount(StatCard, {
      props: { label: 'A', value: 1, icon: DummyIcon },
    })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('applies custom icon classes', () => {
    const wrapper = mount(StatCard, {
      props: { label: 'A', value: 1, icon: DummyIcon, iconBgClass: 'bg-amber-50', iconClass: 'text-amber-600' },
    })
    expect(wrapper.find('.bg-amber-50').exists()).toBe(true)
    expect(wrapper.find('.text-amber-600').exists()).toBe(true)
  })
})
