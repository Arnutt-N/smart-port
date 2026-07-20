import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ThaiDatePicker from '@/components/ThaiDatePicker.vue'

const sel = {
  day: '[aria-label="วัน"]',
  month: '[aria-label="เดือน"]',
  year: '[aria-label="ปี พ.ศ."]',
  clear: '[aria-label="ล้างวันที่"]',
  openCal: '[aria-label="เปิดปฏิทินเลือกวันที่"]',
}

function lastEmit(wrapper) {
  const events = wrapper.emitted('update:modelValue')
  return events ? events[events.length - 1][0] : undefined
}

describe('ThaiDatePicker', () => {
  it('renders modelValue (Y-m-d) as พ.ศ. parts', () => {
    const wrapper = mount(ThaiDatePicker, { props: { modelValue: '2026-06-16' } })
    expect(wrapper.find(sel.day).element.value).toBe('16')
    expect(wrapper.find(sel.month).element.value).toBe('06')
    expect(wrapper.find(sel.year).element.value).toBe('2569')
  })

  it('emits update:modelValue with Y-m-d (ค.ศ.) when a full พ.ศ. date is typed', async () => {
    const wrapper = mount(ThaiDatePicker, { props: { modelValue: '' } })
    await wrapper.find(sel.day).setValue('16')
    await wrapper.find(sel.month).setValue('06')
    await wrapper.find(sel.year).setValue('2569')
    expect(lastEmit(wrapper)).toBe('2026-06-16')
  })

  it('sanitizes non-digit input', async () => {
    const wrapper = mount(ThaiDatePicker, { props: { modelValue: '' } })
    await wrapper.find(sel.day).setValue('1a6!')
    expect(wrapper.find(sel.day).element.value).toBe('16')
  })

  it('emits empty string when cleared', async () => {
    const wrapper = mount(ThaiDatePicker, { props: { modelValue: '2026-06-16' } })
    await wrapper.find(sel.clear).trigger('click')
    expect(lastEmit(wrapper)).toBe('')
  })

  it('emits Y-m-d when a calendar day is picked', async () => {
    const wrapper = mount(ThaiDatePicker, { props: { modelValue: '2026-06-16' } })
    await wrapper.find(sel.openCal).trigger('click')
    await wrapper.find('[aria-label="20 มิถุนายน 2569"]').trigger('click')
    expect(lastEmit(wrapper)).toBe('2026-06-20')
  })

  it('shows an error and does not emit when a ค.ศ. year is typed', async () => {
    const wrapper = mount(ThaiDatePicker, { props: { modelValue: '' } })
    await wrapper.find(sel.day).setValue('16')
    await wrapper.find(sel.month).setValue('06')
    await wrapper.find(sel.year).setValue('2026')
    expect(wrapper.text()).toContain('ปี พ.ศ. ไม่ถูกต้อง')
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })

  it('renders the error prop', () => {
    const wrapper = mount(ThaiDatePicker, {
      props: { modelValue: '', error: 'กรุณาระบุวันเริ่มต้น' },
    })
    expect(wrapper.text()).toContain('กรุณาระบุวันเริ่มต้น')
  })

  it('switches to the decade (year) grid and picks a พ.ศ. year', async () => {
    const wrapper = mount(ThaiDatePicker, { props: { modelValue: '2026-06-16' } })
    await wrapper.find(sel.openCal).trigger('click')
    await wrapper.find('[aria-label="เลือกปี"]').trigger('click')
    expect(wrapper.find('[aria-label="พ.ศ. 2569"]').exists()).toBe(true)
  })

  it('closes calendar when Escape is pressed', async () => {
    const wrapper = mount(ThaiDatePicker, {
      props: { modelValue: '2026-06-16' },
      attachTo: document.body,
    })
    await wrapper.find(sel.openCal).trigger('click')
    expect(wrapper.find('[aria-label="20 มิถุนายน 2569"]').exists()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[aria-label="20 มิถุนายน 2569"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('navigates months with previous/next controls', async () => {
    const wrapper = mount(ThaiDatePicker, { props: { modelValue: '2026-06-16' } })
    await wrapper.find(sel.openCal).trigger('click')

    await wrapper.find('[aria-label="เดือนก่อนหน้า"]').trigger('click')
    await wrapper.find('[aria-label="เดือนถัดไป"]').trigger('click')
    expect(wrapper.find(sel.openCal).exists()).toBe(true)
  })
})
