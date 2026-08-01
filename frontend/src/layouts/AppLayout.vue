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
      <!-- แสดง loading แทนพื้นที่ว่างเมื่อ RouterView ยังไม่มี component; ไม่ใช้ out-in -->
      <RouterView v-slot="{ Component }">
        <component :is="Component" v-if="Component" :key="$route.path" />
        <div
          v-else
          class="flex min-h-[40vh] items-center justify-center px-6 text-sm text-gray-500"
        >
          กำลังโหลดหน้า...
        </div>
      </RouterView>
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
