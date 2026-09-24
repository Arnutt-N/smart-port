import { nextTick, onBeforeUnmount, watch } from 'vue'

/**
 * N51 + F1 — a11y สำหรับ modal แบบทำมือ: role="dialog" + aria-modal + Escape +
 * focus trap (Tab วนใน dialog) + คืน focus ให้ปุ่มเดิมตอนปิด + โฟกัสช่องแรกตอนเปิด
 * เรียกใน <script setup> ของหน้าที่มี modal เปิด/ปิดด้วย ref boolean
 * (dialog ต้อง v-if — ตัวที่ปิดต้องไม่อยู่ใน DOM เพื่อให้ query หาตัวที่เปิดเจอตัวเดียว)
 *
 * @param {import('vue').Ref<boolean>} isOpen — ref ควบคุมการแสดง modal
 * @param {() => void} close — ฟังก์ชันปิด modal (โดยปกติ set isOpen=false)
 */
const openStack = []

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function currentDialog() {
  const dialogs = document.querySelectorAll('[role="dialog"]')
  return dialogs.length > 0 ? dialogs[dialogs.length - 1] : null
}

function focusablesIn(el) {
  return [...el.querySelectorAll(FOCUSABLE_SELECTOR)]
}

export function useModalA11y(isOpen, close) {
  const id = Symbol('modal')
  let previouslyFocused = null

  function isTop() {
    return openStack[openStack.length - 1] === id
  }

  function onKeydown(e) {
    if (!isOpen.value || !isTop()) return
    if (e.key === 'Escape') {
      close()
      return
    }
    if (e.key !== 'Tab') return
    const dialog = currentDialog()
    if (!dialog) return
    const items = focusablesIn(dialog)
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function detach() {
    document.removeEventListener('keydown', onKeydown)
    const at = openStack.indexOf(id)
    if (at >= 0) openStack.splice(at, 1)
  }

  watch(isOpen, (open) => {
    if (open) {
      previouslyFocused = document.activeElement
      openStack.push(id)
      document.addEventListener('keydown', onKeydown)
      nextTick(() => {
        const dialog = currentDialog()
        if (dialog) focusablesIn(dialog).at(0)?.focus?.()
      })
    } else {
      detach()
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
      previouslyFocused = null
    }
  })

  onBeforeUnmount(detach)
}