<template>
  <div class="flex flex-col items-center justify-center py-12 px-4">
    <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
      <component :is="icon" class="w-8 h-8 text-gray-400" />
    </div>
    <h3 class="text-base font-medium text-gray-900 mb-1">{{ title }}</h3>
    <p class="text-sm text-gray-500 text-center max-w-sm">{{ description }}</p>
    <slot />
  </div>
</template>

<script setup>
import { Inbox } from 'lucide-vue-next'

defineProps({
  icon: { type: Object, default: () => Inbox },
  title: { type: String, default: 'ไม่พบข้อมูล' },
  description: { type: String, default: 'ยังไม่มีข้อมูลในขณะนี้' },
})
</script>
