import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUiStore } from '@/stores/ui.js'
import ToastContainer from '@/components/ToastContainer.vue'

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing visible when there are no toasts', () => {
    const wrapper = mount(ToastContainer)
    expect(wrapper.findAll('[aria-label="ปิดการแจ้งเตือน"]')).toHaveLength(0)
  })

  it('renders toast message and type styles', async () => {
    const ui = useUiStore()
    ui.showToast('บันทึกสำเร็จ', 'success')
    ui.showToast('เกิดข้อผิดพลาด', 'error')

    const wrapper = mount(ToastContainer)
    expect(wrapper.text()).toContain('บันทึกสำเร็จ')
    expect(wrapper.text()).toContain('เกิดข้อผิดพลาด')
    expect(wrapper.html()).toContain('bg-green-600')
    expect(wrapper.html()).toContain('bg-red-600')
  })

  it('renders warning and info toast styles', () => {
    const ui = useUiStore()
    ui.showToast('ระวัง', 'warning')
    ui.showToast('ข้อมูล', 'info')

    const wrapper = mount(ToastContainer)
    expect(wrapper.html()).toContain('bg-yellow-500')
    expect(wrapper.html()).toContain('bg-blue-600')
  })

  it('dismisses a toast when close button is clicked', async () => {
    const ui = useUiStore()
    ui.showToast('ปิดได้', 'info')

    const wrapper = mount(ToastContainer)
    expect(wrapper.text()).toContain('ปิดได้')

    await wrapper.get('[aria-label="ปิดการแจ้งเตือน"]').trigger('click')
    expect(ui.toasts).toHaveLength(0)
  })

  it('removes toast from the DOM after auto-dismiss duration', async () => {
    const ui = useUiStore()
    ui.showToast('หายเอง', 'info', 2000)

    const wrapper = mount(ToastContainer)
    expect(wrapper.text()).toContain('หายเอง')

    await vi.advanceTimersByTimeAsync(2000)
    expect(ui.toasts).toHaveLength(0)
    expect(wrapper.findAll('[aria-label="ปิดการแจ้งเตือน"]')).toHaveLength(0)
  })

  it('renders without type styles when toast type is unknown', () => {
    const ui = useUiStore()
    ui.toasts.push({ id: 99, message: 'ประเภทแปลก', type: 'mystery' })

    const wrapper = mount(ToastContainer)
    expect(wrapper.text()).toContain('ประเภทแปลก')
    expect(wrapper.html()).not.toContain('bg-green-600')
    expect(wrapper.html()).not.toContain('bg-red-600')
    expect(wrapper.html()).not.toContain('bg-yellow-500')
    expect(wrapper.html()).not.toContain('bg-blue-600')
  })
})
