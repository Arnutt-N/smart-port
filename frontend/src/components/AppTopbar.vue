<template>
  <header class="bg-white shadow-sm border-b border-gray-200 h-16 flex items-center justify-between px-6">
    <div class="flex items-center space-x-4">
      <button @click="$emit('toggle-sidebar')" class="lg:hidden text-gray-600 hover:text-gray-900 transition-colors cursor-pointer" aria-label="เปิด/ปิดเมนู">
        <Menu class="w-6 h-6" />
      </button>
      <div class="flex items-center space-x-2 text-sm">
        <Home class="w-5 h-5 text-gray-400 hidden sm:block" />
        <span class="text-gray-400 hidden sm:inline">/</span>
        <span class="text-gray-900 font-medium">{{ pageTitle }}</span>
      </div>
    </div>

    <!-- User avatar + dropdown -->
    <div class="relative" ref="dropdownRef">
      <button
        @click="dropdownOpen = !dropdownOpen"
        class="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        aria-label="เมนูผู้ใช้"
      >
        <div class="relative">
          <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <span class="text-white text-sm font-medium">{{ auth.user?.name?.charAt(0) || 'A' }}</span>
          </div>
          <!-- Online dot — bottom right -->
          <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
        </div>
        <span class="hidden sm:inline text-sm text-gray-700 font-medium">{{ auth.user?.name || 'ผู้ใช้' }}</span>
        <ChevronDown class="w-4 h-4 text-gray-400 hidden sm:block" />
      </button>

      <!-- Dropdown Menu -->
      <Transition name="dropdown">
        <div
          v-if="dropdownOpen"
          class="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50"
        >
          <!-- User info header -->
          <div class="px-4 py-3 border-b border-gray-100">
            <p class="text-sm font-medium text-gray-900">{{ auth.user?.name || 'ผู้ใช้' }}</p>
            <p class="text-xs text-gray-500 mt-0.5">{{ auth.user?.email || auth.user?.username || '' }}</p>
          </div>

          <!-- Menu items -->
          <div class="py-1">
            <button
              @click="navigateTo('/profile')"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <User class="w-4 h-4 text-gray-400" />
              โปรไฟล์ของฉัน
            </button>
            <button
              @click="navigateTo('/admin')"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Settings class="w-4 h-4 text-gray-400" />
              ตั้งค่า
            </button>
          </div>

          <!-- Logout -->
          <div class="border-t border-gray-100 py-1">
            <button
              @click="handleLogout"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <LogOut class="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { Menu, Home, ChevronDown, User, Settings, LogOut } from 'lucide-vue-next'

defineEmits(['toggle-sidebar'])

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const dropdownOpen = ref(false)
const dropdownRef = ref(null)

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/probation-end': 'พ้นทดลองปฏิบัติราชการ',
  '/candidates': 'Candidate Lists',
  '/users': 'จัดการผู้ใช้',
  '/analytics': 'การวิเคราะห์ข้อมูล',
  '/admin': 'การจัดการระบบ',
  '/time-counting': 'การนับเวลาเกื้อกูล',
  '/time-difference': 'การนับแตกต่าง',
  '/position-compare': 'การเทียบตำแหน่ง',
  '/royal-decorations': 'เครื่องราชอิสริยาภรณ์',
  '/retirement-report': 'รายงานผู้เกษียณ',
  '/work-results': 'ผลงานและข้อเสนอ',
  '/awards': 'รางวัล/ความดีความชอบ',
  '/profile': 'โปรไฟล์ของฉัน',
}

const pageTitle = computed(() => {
  for (const [path, title] of Object.entries(pageTitles)) {
    if (route.path.startsWith(path)) return title
  }
  return 'Dashboard'
})

function navigateTo(path) {
  dropdownOpen.value = false
  router.push(path)
}

function handleLogout() {
  dropdownOpen.value = false
  auth.logout()
  router.push('/login')
}

// Close dropdown on click outside
function handleClickOutside(e) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    dropdownOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<style scoped>
.dropdown-enter-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}
.dropdown-leave-active {
  transition: opacity 0.1s ease-in, transform 0.1s ease-in;
}
.dropdown-enter-from {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
</style>
