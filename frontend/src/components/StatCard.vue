<template>
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
    <div class="flex items-center">
      <div class="flex-shrink-0">
        <div class="rounded-lg p-3" :class="iconBgClass">
          <component :is="icon" class="w-6 h-6" :class="iconClass" />
        </div>
      </div>
      <div class="ml-4 flex-1">
        <p class="text-sm font-medium text-gray-600">{{ label }}</p>
        <p class="text-2xl font-semibold text-gray-900 mt-1">{{ value }}</p>
        <p v-if="change" class="text-sm mt-1" :class="changeClass">
          {{ change }} จากเดือนที่แล้ว
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: String,
  value: [String, Number],
  icon: Object,
  change: { type: String, default: '' },
  iconBgClass: { type: String, default: 'bg-blue-50' },
  iconClass: { type: String, default: 'text-blue-600' },
})

const changeClass = computed(() => {
  if (props.change.startsWith('+')) return 'text-green-600'
  if (props.change.startsWith('-')) return 'text-red-600'
  return 'text-gray-600'
})
</script>
