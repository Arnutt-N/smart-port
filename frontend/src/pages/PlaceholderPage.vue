<template>
  <div class="p-6">
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 class="text-lg font-medium text-gray-900 mb-4">{{ title }}</h2>
      <p class="text-gray-600">{{ description }}</p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: 'หน้านี้' },
  description: { type: String, default: 'กำลังพัฒนา' },
})
</script>
