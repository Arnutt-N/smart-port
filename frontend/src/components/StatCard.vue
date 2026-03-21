<template>
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
    <div class="flex items-center">
      <div class="flex-shrink-0">
        <div class="rounded-lg p-3" :class="iconBgClass">
          <component :is="icon" class="w-6 h-6" :class="iconClass" />
        </div>
      </div>
      <div class="ml-4 flex-1">
        <p class="text-sm font-medium text-gray-600">{{ label }}</p>
        <p class="text-2xl font-semibold tabular-nums text-gray-900 mt-1">{{ value }}</p>
        <p v-if="change" class="text-sm mt-1" :class="changeClass">
          {{ change }} จากเดือนที่แล้ว
        </p>
        <div v-if="sparkline" class="flex items-end gap-0.5 mt-2 h-6">
          <div
            v-for="(val, i) in sparklineData"
            :key="i"
            class="flex-1 rounded-sm transition-all duration-300"
            :class="sparklineColor"
            :style="{ height: `${val}%` }"
          ></div>
        </div>
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
  sparkline: { type: Boolean, default: false },
  sparklineColor: { type: String, default: 'bg-blue-200' },
})

const sparklineData = computed(() => {
  // Generate 8 bars with realistic-looking data
  const base = [40, 55, 35, 70, 45, 80, 60, 90]
  return base
})

const changeClass = computed(() => {
  if (props.change.startsWith('+')) return 'text-green-600'
  if (props.change.startsWith('-')) return 'text-red-600'
  return 'text-gray-600'
})
</script>
