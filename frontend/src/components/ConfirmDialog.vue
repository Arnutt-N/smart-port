<template>
  <Dialog :open="state.open" class="relative z-[100]" @close="cancel">
    <Transition
      enter-active-class="ease-out duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="ease-in duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="state.open" class="fixed inset-0 bg-black/40" aria-hidden="true" />
    </Transition>

    <div class="fixed inset-0 flex items-center justify-center p-4">
      <Transition
        enter-active-class="ease-out duration-200"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="ease-in duration-150"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <DialogPanel
          v-if="state.open"
          class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-gray-100"
        >
          <div class="flex items-start gap-4">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              :class="iconWrapClass"
            >
              <component :is="icon" class="h-5 w-5" :class="iconClass" />
            </div>
            <div class="min-w-0 flex-1">
              <DialogTitle class="text-lg font-semibold text-gray-900">
                {{ state.title }}
              </DialogTitle>
              <DialogDescription class="mt-2 text-sm text-gray-600 whitespace-pre-line">
                {{ state.message }}
              </DialogDescription>
              <p
                v-if="state.detail"
                class="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 whitespace-pre-line"
              >
                {{ state.detail }}
              </p>
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-3">
            <button
              type="button"
              class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              @click="cancel"
            >
              {{ state.cancelLabel }}
            </button>
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors cursor-pointer"
              :class="confirmBtnClass"
              @click="accept"
            >
              {{ state.confirmLabel }}
            </button>
          </div>
        </DialogPanel>
      </Transition>
    </div>
  </Dialog>
</template>

<script setup>
import { computed } from 'vue'
import { Dialog, DialogPanel, DialogTitle, DialogDescription } from '@headlessui/vue'
import { AlertTriangle, LogOut, Save } from 'lucide-vue-next'
import { useConfirm } from '@/composables/useConfirm.js'

const { state, accept, cancel } = useConfirm()

const icon = computed(() => {
  if (state.variant === 'primary') return Save
  if (state.title.includes('ออกจากระบบ')) return LogOut
  return AlertTriangle
})

const iconWrapClass = computed(() => {
  if (state.variant === 'primary') return 'bg-blue-100'
  if (state.variant === 'warning') return 'bg-amber-100'
  return 'bg-red-100'
})

const iconClass = computed(() => {
  if (state.variant === 'primary') return 'text-blue-600'
  if (state.variant === 'warning') return 'text-amber-600'
  return 'text-red-600'
})

const confirmBtnClass = computed(() => {
  if (state.variant === 'primary') return 'bg-blue-600 hover:bg-blue-700'
  if (state.variant === 'warning') return 'bg-amber-600 hover:bg-amber-700'
  return 'bg-red-600 hover:bg-red-700'
})
</script>
