<template>
  <div class="animate-pulse">
    <!-- Stat Cards Skeleton -->
    <div v-if="type === 'stat-cards'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div v-for="i in 4" :key="i" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="flex items-center">
          <div class="w-12 h-12 bg-gray-200 rounded-lg"></div>
          <div class="ml-4 flex-1 space-y-2">
            <div class="h-3 bg-gray-200 rounded w-24"></div>
            <div class="h-6 bg-gray-200 rounded w-16"></div>
            <div class="h-3 bg-gray-200 rounded w-20"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Table Skeleton -->
    <div v-else-if="type === 'table'" class="bg-white rounded-lg shadow-sm border border-gray-200">
      <div class="p-6 border-b border-gray-200">
        <div class="h-5 bg-gray-200 rounded w-48"></div>
      </div>
      <div class="p-4 space-y-4">
        <div v-for="i in rows" :key="i" class="flex items-center space-x-4">
          <div class="w-5 h-5 bg-gray-200 rounded"></div>
          <div class="flex-1 h-4 bg-gray-200 rounded"></div>
          <div class="w-16 h-4 bg-gray-200 rounded"></div>
          <div class="w-20 h-6 bg-gray-200 rounded-full"></div>
          <div class="w-24 h-4 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>

    <!-- Generic Card Skeleton -->
    <div v-else class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-3">
      <div class="h-5 bg-gray-200 rounded w-32"></div>
      <div class="space-y-2">
        <div v-for="i in rows" :key="i" class="h-4 bg-gray-200 rounded" :style="{ width: `${70 + Math.random() * 30}%` }"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  type: { type: String, default: 'card' },
  rows: { type: Number, default: 4 },
})
</script>
