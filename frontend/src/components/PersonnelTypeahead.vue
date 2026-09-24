<template>
  <div class="relative">
    <input
      :id="inputId"
      v-model="personnelSearch"
      type="text"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :disabled="disabled"
      class="input"
      @input="onPersonnelInput"
      @compositionstart="isComposingPersonnel = true"
      @compositionend="onPersonnelCompositionEnd"
    >
    <!-- Autocomplete dropdown -->
    <div
      v-if="showPersonnelDropdown && personnelResults.length > 0"
      class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto"
    >
      <button
        v-for="person in personnelResults"
        :key="person.personnel_id"
        type="button"
        class="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 transition-colors"
        @click="selectPersonnel(person)"
      >
        {{ person.full_name }}
        <span class="text-gray-400 text-xs ml-2">{{ person.current_position || '' }}</span>
      </button>
    </div>
    <div
      v-else-if="showEmpty"
      class="text-xs mt-1"
      :class="personnelSearchFailed ? 'text-red-500' : 'text-gray-500'"
    >
      <p>
        {{ personnelSearchFailed ? 'ค้นหาไม่สำเร็จ กรุณาลองใหม่' : 'ไม่พบบุคลากรที่ตรงกับคำค้น' }}
      </p>
      <RouterLink
        v-if="personnelCreateLinkVisible({ isAdmin, searchFailed: personnelSearchFailed })"
        :to="PERSONNEL_MASTER_CREATE_TO"
        class="inline-block mt-1 text-primary-600 hover:text-primary-700 underline"
      >
        {{ PERSONNEL_MASTER_CREATE_LINK_LABEL }}
      </RouterLink>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { usePersonnelSearch } from '@/composables/usePersonnelSearch.js'
import { useDebouncedCallback } from '@/composables/useDebouncedCallback.js'
import { useRequestSeq } from '@/composables/useRequestSeq.js'
import { useAuthStore } from '@/stores/auth.js'
import {
  PERSONNEL_MASTER_CREATE_LINK_LABEL,
  PERSONNEL_MASTER_CREATE_TO,
  personnelCreateLinkVisible,
  showPersonnelTypeaheadEmpty,
} from '@/utils/personnelTypeaheadEmpty.js'

const props = defineProps({
  modelValue: { type: Number, default: null },
  displayName: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  inputId: { type: String, required: true },
  placeholder: { type: String, default: '' },
  /** accessible name สำรองเมื่อสแกน static ไม่เห็น label[for] ของหน้า (issue #148 — ตามแบบ ListSearchInput) */
  ariaLabel: { type: String, default: 'ค้นหาบุคลากร' },
})

const emit = defineEmits(['update:modelValue'])

const { searchPersonnel } = usePersonnelSearch()
const auth = useAuthStore()
const { next: nextPersonnelRequest } = useRequestSeq()

const isAdmin = computed(() => auth.isAdmin)

// Personnel autocomplete state (mirrors SupportivePage block)
const personnelSearch = ref('')
const personnelResults = ref([])
const showPersonnelDropdown = ref(false)
const personnelSearchFailed = ref(false)
const isComposingPersonnel = ref(false)
// id ที่เลือกไว้ล่าสุด — กัน watcher modelValue ล้างข้อความที่ผู้ใช้กำลังพิมพ์
// (แยก echo จาก emit ของตัวเองออกจาก external reset ของ parent)
const selectedId = ref(null)

const { run: schedulePersonnelSearch, cancel: cancelPersonnelSearch } = useDebouncedCallback(async () => {
  const req = nextPersonnelRequest()
  const val = personnelSearch.value.trim()
  if (val.length < 2) {
    if (!req.isCurrent()) return
    personnelResults.value = []
    showPersonnelDropdown.value = false
    personnelSearchFailed.value = false
    return
  }
  try {
    const rowsFound = await searchPersonnel(val, { limit: 10 })
    if (!req.isCurrent()) return
    if (val !== personnelSearch.value.trim()) return
    personnelResults.value = rowsFound
    showPersonnelDropdown.value = true
    personnelSearchFailed.value = false
  } catch {
    if (!req.isCurrent()) return
    if (val !== personnelSearch.value.trim()) return
    personnelResults.value = []
    showPersonnelDropdown.value = true
    personnelSearchFailed.value = true
  }
}, 300)

const showEmpty = computed(() => showPersonnelTypeaheadEmpty({
  showDropdown: showPersonnelDropdown.value,
  query: personnelSearch.value,
  resultsLength: personnelResults.value.length,
}))

// Sync กฎ: external null → ล้างข้อความ; id + displayName → โชว์ prop (prefill path)
watch(
  () => [props.modelValue, props.displayName],
  ([id, name]) => {
    if (id == null) {
      if (selectedId.value == null) return
      selectedId.value = null
      personnelSearch.value = ''
      personnelResults.value = []
      showPersonnelDropdown.value = false
      personnelSearchFailed.value = false
      return
    }
    selectedId.value = id
    if (name) {
      personnelSearch.value = name
      personnelResults.value = []
      showPersonnelDropdown.value = false
      personnelSearchFailed.value = false
    }
  },
  { immediate: true },
)

// Personnel autocomplete
function onPersonnelInput() {
  if (props.disabled) return
  if (isComposingPersonnel.value) return
  if (selectedId.value != null || props.modelValue != null) {
    selectedId.value = null
    emit('update:modelValue', null)
  }
  const val = personnelSearch.value.trim()
  if (val.length < 2) {
    nextPersonnelRequest() // invalidate in-flight autocomplete
    cancelPersonnelSearch()
    personnelResults.value = []
    showPersonnelDropdown.value = false
    personnelSearchFailed.value = false
    return
  }
  schedulePersonnelSearch()
}

function onPersonnelCompositionEnd() {
  isComposingPersonnel.value = false
  onPersonnelInput()
}

function selectPersonnel(person) {
  selectedId.value = person.personnel_id
  emit('update:modelValue', person.personnel_id)
  personnelSearch.value = person.full_name
  personnelResults.value = []
  showPersonnelDropdown.value = false
  personnelSearchFailed.value = false
}
</script>
