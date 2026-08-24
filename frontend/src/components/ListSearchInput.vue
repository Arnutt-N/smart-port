<template>
  <div class="relative flex-1">
    <div
      v-if="showIcon"
      class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
    >
      <Search class="w-4 h-4 text-gray-400" aria-hidden="true" />
    </div>
    <input
      :id="inputId"
      :value="modelValue"
      type="text"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      class="w-full border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      :class="showIcon ? 'pl-10 pr-4 py-2' : 'px-4 py-2'"
      @input="onInput"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
    />
  </div>
</template>

<script setup>
import { ref, computed, useId } from 'vue'
import { Search } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'ค้นหา...' },
  showIcon: { type: Boolean, default: true },
  /** When true, suppress input emit during IME composition */
  imeGuard: { type: Boolean, default: false },
  /** id ของ input — ปล่อยว่าไว้จะสร้างค่าไม่ซ้ำอัตโนมัติ (issue #148) */
  id: { type: String, default: '' },
  /** accessible name เมื่อไม่มี label ภายนอกผูกกับ input */
  ariaLabel: { type: String, default: 'ค้นหา' },
})

const autoId = useId()
const inputId = computed(() => props.id || `list-search-${autoId}`)

const emit = defineEmits(['update:modelValue', 'search'])

const isComposing = ref(false)

function onCompositionStart() {
  if (props.imeGuard) isComposing.value = true
}

function onCompositionEnd(event) {
  if (!props.imeGuard) return
  isComposing.value = false
  const value = event.target?.value ?? ''
  emit('update:modelValue', value)
  emit('search', value)
}

function onInput(event) {
  const value = event.target?.value ?? ''
  emit('update:modelValue', value)
  if (props.imeGuard && isComposing.value) return
  emit('search', value)
}
</script>
