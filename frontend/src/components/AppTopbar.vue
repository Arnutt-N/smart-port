<template>
  <header class="bg-white shadow-sm border-b border-gray-200 h-16 flex items-center justify-between px-6">
    <div class="flex items-center space-x-4">
      <button @click="$emit('toggle-sidebar')" class="lg:hidden text-gray-600 hover:text-gray-900 transition-colors" aria-label="เปิด/ปิดเมนู">
        <Menu class="w-6 h-6" />
      </button>
      <div class="flex items-center space-x-2 text-sm">
        <Home class="w-5 h-5 text-gray-400" />
        <span class="text-gray-400">/</span>
        <span class="text-gray-900 font-medium">{{ pageTitle }}</span>
      </div>
    </div>

    <div class="flex items-center space-x-4">
      <div class="relative">
        <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
          <span class="text-white text-sm font-medium">{{ auth.user?.name?.charAt(0) || 'A' }}</span>
        </div>
        <div class="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
      </div>
      <button @click="handleLogout" class="text-red-600 hover:text-red-800 transition-colors cursor-pointer" aria-label="ออกจากระบบ">
        <LogOut class="w-5 h-5" />
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { Menu, Home, LogOut } from 'lucide-vue-next'

defineEmits(['toggle-sidebar'])

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/probation-end': 'พ้นทดลองปฏิบัติราชการ',
  '/candidates': 'Candidate Lists',
  '/analytics': 'การวิเคราะห์ข้อมูล',
  '/admin': 'การจัดการระบบ',
  '/time-counting': 'การนับเวลาเกื้อกูล',
  '/royal-decorations': 'เครื่องราชอิสริยาภรณ์',
  '/retirement-report': 'รายงานผู้เกษียณ',
}

const pageTitle = computed(() => {
  for (const [path, title] of Object.entries(pageTitles)) {
    if (route.path.startsWith(path)) return title
  }
  return 'Dashboard'
})

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>
