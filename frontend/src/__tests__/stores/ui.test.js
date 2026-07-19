import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUiStore } from '@/stores/ui.js'

describe('ui store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('showToast adds a toast with default type info', () => {
    const ui = useUiStore()
    ui.showToast('บันทึกสำเร็จ')

    expect(ui.toasts).toHaveLength(1)
    expect(ui.toasts[0]).toMatchObject({ message: 'บันทึกสำเร็จ', type: 'info' })
  })

  it('showToast assigns incrementing ids and keeps custom type', () => {
    const ui = useUiStore()
    ui.showToast('แจ้งเตือน', 'error')
    ui.showToast('สำเร็จ', 'success')

    expect(ui.toasts).toHaveLength(2)
    expect(ui.toasts[1].id).toBeGreaterThan(ui.toasts[0].id)
    expect(ui.toasts[0].type).toBe('error')
    expect(ui.toasts[1].type).toBe('success')
  })

  it('auto-removes toast after the default duration', () => {
    const ui = useUiStore()
    ui.showToast('ชั่วคราว')

    vi.advanceTimersByTime(5000)
    expect(ui.toasts).toHaveLength(0)
  })

  it('auto-removes toast after a custom duration without touching others', () => {
    const ui = useUiStore()
    ui.showToast('สั้น', 'info', 1000)
    ui.showToast('ยาว', 'info', 10000)

    vi.advanceTimersByTime(1000)
    expect(ui.toasts).toHaveLength(1)
    expect(ui.toasts[0].message).toBe('ยาว')
  })

  it('removeToast removes only the matching id', () => {
    const ui = useUiStore()
    ui.showToast('หนึ่ง')
    ui.showToast('สอง')

    ui.removeToast(ui.toasts[0].id)
    expect(ui.toasts).toHaveLength(1)
    expect(ui.toasts[0].message).toBe('สอง')
  })
})
