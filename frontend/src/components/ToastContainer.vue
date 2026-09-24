<template>
  <div
    class="fixed top-4 right-4 z-50 space-y-2"
    aria-live="polite"
    aria-atomic="false"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in ui.toasts"
        :key="toast.id"
        class="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm min-w-[300px]"
        :class="toastClasses[toast.type]"
        :role="toast.type === 'error' ? 'alert' : 'status'"
      >
        <component
          :is="toastIcons[toast.type]"
          class="w-5 h-5 shrink-0"
          aria-hidden="true"
        />
        <span class="flex-1">{{ toast.message }}</span>
        <button
          class="shrink-0 p-1.5 -m-1 rounded-md opacity-70 hover:opacity-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="ปิดการแจ้งเตือน"
          @click="ui.removeToast(toast.id)"
        >
          <X
            class="w-4 h-4"
            aria-hidden="true"
          />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { useUiStore } from '@/stores/ui.js'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-vue-next'

const ui = useUiStore()

const toastClasses = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-yellow-500 text-white',
  info: 'bg-blue-600 text-white',
}

const toastIcons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}
</script>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease-out;
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
