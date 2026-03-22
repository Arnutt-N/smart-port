import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBadge from '@/components/StatusBadge.vue'

describe('StatusBadge', () => {
  // Candidate statuses
  it('renders "ครบกำหนด" for qualified status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'qualified' } })
    expect(wrapper.text()).toBe('ครบกำหนด')
    expect(wrapper.classes()).toContain('bg-green-50')
  })

  it('renders "ใกล้ครบกำหนด" for not_yet status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'not_yet' } })
    expect(wrapper.text()).toBe('ใกล้ครบกำหนด')
    expect(wrapper.classes()).toContain('bg-amber-50')
  })

  it('renders "ตรวจสอบข้อมูล" for check_data status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'check_data' } })
    expect(wrapper.text()).toBe('ตรวจสอบข้อมูล')
    expect(wrapper.classes()).toContain('bg-orange-50')
  })

  // Probation statuses (case-sensitive UPPER_CASE)
  it('renders "กำลังดำเนินการ" for IN_PROGRESS status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'IN_PROGRESS' } })
    expect(wrapper.text()).toBe('กำลังดำเนินการ')
    expect(wrapper.classes()).toContain('bg-blue-50')
  })

  it('renders "ผ่านทดลอง" for COMPLETED status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'COMPLETED' } })
    expect(wrapper.text()).toBe('ผ่านทดลอง')
    expect(wrapper.classes()).toContain('bg-green-50')
  })

  it('renders "ไม่ผ่าน" for FAILED status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'FAILED' } })
    expect(wrapper.text()).toBe('ไม่ผ่าน')
    expect(wrapper.classes()).toContain('bg-red-50')
  })

  it('renders "ขยายเวลา" for EXTENDED status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'EXTENDED' } })
    expect(wrapper.text()).toBe('ขยายเวลา')
    expect(wrapper.classes()).toContain('bg-orange-50')
  })

  // Legacy statuses
  it('renders "กำลังจะถึง" for upcoming status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'upcoming' } })
    expect(wrapper.text()).toBe('กำลังจะถึง')
  })

  it('renders "เลยกำหนด" for overdue status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'overdue' } })
    expect(wrapper.text()).toBe('เลยกำหนด')
  })

  // Unknown status fallback
  it('falls back to raw status string for unknown status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'UNKNOWN_STATUS' } })
    expect(wrapper.text()).toBe('UNKNOWN_STATUS')
    expect(wrapper.classes()).toContain('bg-gray-100')
  })
})
