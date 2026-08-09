<template>
  <div ref="rootEl" class="relative inline-flex items-center justify-end gap-1" data-table-row-actions>
    <template v-if="useMenu">
      <button
        type="button"
        class="p-1 text-government-400 hover:text-primary-600 transition-colors cursor-pointer rounded"
        title="จัดการ"
        aria-label="จัดการ"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click.stop="toggleMenu"
      >
        <MoreVertical class="w-4 h-4" aria-hidden="true" />
      </button>
      <div
        v-if="menuOpen"
        role="menu"
        class="absolute right-0 top-full z-20 mt-1 min-w-40 rounded-md border border-government-200 bg-white py-1 elevation-2"
      >
        <template v-for="(action, index) in visibleActions" :key="action.key">
          <div
            v-if="showSeparatorBefore(action, index)"
            class="my-1 border-t border-government-100"
            role="separator"
          />
          <button
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            :class="menuItemClass(action)"
            :title="action.label"
            :disabled="action.disabled"
            @click.stop="runAction(action)"
          >
            <component :is="resolveIcon(action)" class="w-4 h-4 shrink-0" />
            <span>{{ action.label }}</span>
          </button>
        </template>
      </div>
    </template>
    <template v-else>
      <button
        v-for="action in visibleActions"
        :key="action.key"
        type="button"
        class="p-1 transition-colors cursor-pointer rounded disabled:opacity-50 disabled:pointer-events-none"
        :class="iconButtonClass(action)"
        :title="action.label"
        :aria-label="action.label"
        :disabled="action.disabled"
        @click.stop="runAction(action)"
      >
        <component :is="resolveIcon(action)" class="w-4 h-4" aria-hidden="true" />
      </button>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Eye, Pencil, Trash2, MoreVertical } from 'lucide-vue-next'

const DEFAULT_ICONS = {
  view: Eye,
  edit: Pencil,
  delete: Trash2,
}

const props = defineProps({
  /** @type {{ key: string, label: string, icon?: object|Function, variant?: string, disabled?: boolean, onClick?: Function }[]} */
  actions: { type: Array, default: () => [] },
  /** Inline icons when visible count ≤ this; otherwise MoreVertical menu */
  maxInline: { type: Number, default: 3 },
})

const emit = defineEmits(['action'])

const rootEl = ref(null)
const menuOpen = ref(false)

const visibleActions = computed(() =>
  (props.actions || []).filter((action) => action && action.key && action.label)
)

const useMenu = computed(() => visibleActions.value.length > props.maxInline)

function resolveIcon(action) {
  return action.icon || DEFAULT_ICONS[action.key] || Eye
}

function iconButtonClass(action) {
  const variant = action.variant || (action.key === 'delete' ? 'danger' : 'default')
  if (variant === 'danger') return 'text-government-400 hover:text-red-600'
  if (variant === 'success') return 'text-government-400 hover:text-green-600'
  if (variant === 'warning') return 'text-government-400 hover:text-amber-600'
  return 'text-government-400 hover:text-primary-600'
}

function menuItemClass(action) {
  const variant = action.variant || (action.key === 'delete' ? 'danger' : 'default')
  if (variant === 'danger') return 'text-red-600 hover:bg-red-50'
  if (variant === 'success') return 'text-green-700 hover:bg-green-50'
  if (variant === 'warning') return 'text-amber-700 hover:bg-amber-50'
  return 'text-government-700 hover:bg-primary-50'
}

function showSeparatorBefore(action, index) {
  if (index === 0) return false
  const variant = action.variant || (action.key === 'delete' ? 'danger' : 'default')
  return variant === 'danger'
}

function runAction(action) {
  if (action.disabled) return
  closeMenu()
  if (typeof action.onClick === 'function') {
    action.onClick()
  }
  emit('action', action.key)
}

function onDocumentClick(event) {
  if (!menuOpen.value || !rootEl.value) return
  if (!rootEl.value.contains(event.target)) {
    closeMenu()
  }
}

function onKeydown(event) {
  if (event.key === 'Escape') closeMenu()
}

function bindMenuListeners() {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
}

function unbindMenuListeners() {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
}

function openMenu() {
  if (menuOpen.value) return
  menuOpen.value = true
  bindMenuListeners()
}

function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  unbindMenuListeners()
}

function toggleMenu() {
  if (menuOpen.value) closeMenu()
  else openMenu()
}

watch(useMenu, (menu) => {
  if (!menu) closeMenu()
})

onBeforeUnmount(() => {
  unbindMenuListeners()
})
</script>
