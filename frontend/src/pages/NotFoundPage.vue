<template>
  <EmptyState
    :icon="FileSearch"
    title="ไม่พบหน้าที่ต้องการ (404)"
    description="URL นี้ไม่มีในระบบ หรือคุณอาจพิมพ์ที่อยู่ผิด"
  >
    <RouterLink
      to="/"
      class="btn-primary mt-4 px-4 py-2"
    >
      กลับไปหน้าแรก
    </RouterLink>
  </EmptyState>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { FileSearch } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
</script>
