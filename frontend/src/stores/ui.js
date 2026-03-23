import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const toasts = ref([])
  const isLoading = ref(false)
  let toastId = 0

  function showToast(message, type = 'info', duration = 5000) {
    const id = ++toastId
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, duration)
  }

  function removeToast(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, isLoading, showToast, removeToast }
})
