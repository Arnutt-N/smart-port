<template>
  <div
    v-if="sidebarOpen"
    class="fixed inset-0 bg-black/50 z-20 lg:hidden"
    @click="sidebarOpen = false"
  />

  <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

  <div class="lg:ml-64 transition-all duration-300">
    <AppTopbar @toggle-sidebar="sidebarOpen = !sidebarOpen" />
    <main class="min-h-[calc(100vh-4rem)] bg-gray-50">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'

const sidebarOpen = ref(window.innerWidth >= 1024)

function handleResize() {
  sidebarOpen.value = window.innerWidth >= 1024
}

onMounted(() => window.addEventListener('resize', handleResize))
onUnmounted(() => window.removeEventListener('resize', handleResize))
</script>
