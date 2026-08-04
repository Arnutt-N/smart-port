import { reactive } from 'vue'

/**
 * Global confirm dialog state — one host in App.vue (Headless UI Dialog).
 * Usage: const ok = await confirmAction({ title, message, variant: 'danger'|'primary' })
 */
const state = reactive({
  open: false,
  title: '',
  message: '',
  detail: '',
  confirmLabel: 'ยืนยัน',
  cancelLabel: 'ยกเลิก',
  variant: 'danger', // danger | primary | warning
  resolving: null,
})

function close(result) {
  const resolve = state.resolving
  state.open = false
  state.resolving = null
  resolve?.(result)
}

/**
 * @param {{
 *   title?: string,
 *   message?: string,
 *   detail?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   variant?: 'danger'|'primary'|'warning',
 * }} options
 * @returns {Promise<boolean>}
 */
export function confirmAction(options = {}) {
  if (state.open && state.resolving) {
    close(false)
  }

  state.title = options.title || 'ยืนยันการดำเนินการ'
  state.message = options.message || 'คุณต้องการดำเนินการนี้หรือไม่?'
  state.detail = options.detail || ''
  state.confirmLabel = options.confirmLabel || 'ยืนยัน'
  state.cancelLabel = options.cancelLabel || 'ยกเลิก'
  state.variant = options.variant || 'danger'
  state.open = true

  return new Promise((resolve) => {
    state.resolving = resolve
  })
}

export function useConfirm() {
  return {
    state,
    confirm: confirmAction,
    accept: () => close(true),
    cancel: () => close(false),
  }
}

export function confirmDelete(options = {}) {
  return confirmAction({
    title: 'ยืนยันการลบ',
    message: 'คุณต้องการลบรายการนี้หรือไม่?',
    confirmLabel: 'ลบ',
    variant: 'danger',
    ...options,
  })
}

export function confirmLogout(options = {}) {
  return confirmAction({
    title: 'ออกจากระบบ',
    message: 'คุณต้องการออกจากระบบหรือไม่?',
    confirmLabel: 'ออกจากระบบ',
    variant: 'danger',
    ...options,
  })
}

export function confirmSave(options = {}) {
  return confirmAction({
    title: 'ยืนยันการบันทึก',
    message: 'คุณต้องการบันทึกการแก้ไขหรือไม่?',
    confirmLabel: 'บันทึก',
    variant: 'primary',
    ...options,
  })
}
