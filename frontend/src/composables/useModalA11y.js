import { watch, onBeforeUnmount } from 'vue'

/**
 * N51 — a11y สำหรับ modal แบบทำมือ: role="dialog" + aria-modal + ปิดด้วย Escape
 * เรียกใน <script setup> ของหน้าที่มี modal เปิด/ปิดด้วย ref boolean
 *
 * @param {import('vue').Ref<boolean>} isOpen — ref ควบคุมการแสดง modal
 * @param {() => void} close — ฟังก์ชันปิด modal (โดยปกติ set isOpen=false)
 */
export function useModalA11y(isOpen, close) {
  function onKeydown(e) {
    if (e.key === 'Escape' && isOpen.value) close()
  }

  watch(isOpen, (open) => {
    if (open) {
      document.addEventListener('keydown', onKeydown)
    } else {
      document.removeEventListener('keydown', onKeydown)
    }
  })

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown)
  })
}
