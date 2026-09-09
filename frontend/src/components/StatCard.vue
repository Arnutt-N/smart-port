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
      </div>
    </div>
  </div>
</template>

<script setup>
// N48: ตัด props change/sparkline — ไม่มี call site ส่งและ sparkline เคย render ข้อมูลปลอม
defineProps({
  label: String,
  value: [String, Number],
  icon: Object,
  iconBgClass: { type: String, default: 'bg-blue-50' },
  iconClass: { type: String, default: 'text-blue-600' },
})
</script>
