<template>
  <div class="flex items-center justify-between mt-4 text-sm text-gray-600">
    <span>แสดง {{ from }} ถึง {{ to }} จาก {{ total }} รายการ</span>
    <div class="flex items-center gap-1">
      <button
        :disabled="currentPage === 1"
        class="px-3 py-1 text-sm rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        @click="goToPage(currentPage - 1)"
      >
        ก่อนหน้า
      </button>

      <template v-for="page in visiblePages" :key="page">
        <span v-if="page === '...'" class="px-2 py-1 text-gray-400">...</span>
        <button
          v-else
          class="px-3 py-1 text-sm rounded-lg"
          :class="page === currentPage
            ? 'bg-blue-500 text-white'
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'"
          @click="goToPage(page)"
        >
          {{ page }}
        </button>
      </template>

      <button
        :disabled="currentPage === totalPages"
        class="px-3 py-1 text-sm rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        @click="goToPage(currentPage + 1)"
      >
        ถัดไป
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  total: { type: Number, required: true },
  limit: { type: Number, required: true },
  offset: { type: Number, required: true },
})

const emit = defineEmits(['update:offset'])

const from = computed(() => props.total === 0 ? 0 : props.offset + 1)
const to = computed(() => Math.min(props.offset + props.limit, props.total))
const currentPage = computed(() => Math.floor(props.offset / props.limit) + 1)
const totalPages = computed(() => Math.ceil(props.total / props.limit) || 1)

const visiblePages = computed(() => {
  const pages = []
  const current = currentPage.value
  const last = totalPages.value

  if (last <= 5) {
    for (let i = 1; i <= last; i++) pages.push(i)
    return pages
  }

  pages.push(1)
  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(last - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)

  if (current < last - 2) pages.push('...')
  pages.push(last)

  return pages
})

function goToPage(page) {
  if (page < 1 || page > totalPages.value) return
  emit('update:offset', (page - 1) * props.limit)
}
</script>
