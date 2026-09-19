<template>
  <header class="bg-white shadow-sm border-b border-gray-200 h-16 flex items-center justify-between px-6">
    <div class="flex items-center space-x-4">
      <button @click="$emit('toggle-sidebar')" class="lg:hidden text-gray-600 hover:text-gray-900 transition-colors cursor-pointer" aria-label="เปิด/ปิดเมนู">
        <Menu class="w-6 h-6" />
      </button>
      <nav class="flex items-center space-x-2 text-sm" aria-label="Breadcrumb">
        <RouterLink to="/dashboard" class="text-gray-400 hover:text-gray-600 transition-colors shrink-0" aria-label="กลับหน้า Dashboard">
          <Home class="w-5 h-5" />
        </RouterLink>
        <span class="text-gray-400" aria-hidden="true">/</span>
        <template v-for="(crumb, idx) in trail" :key="`${idx}-${crumb}`">
          <span v-if="idx > 0" class="text-gray-400" aria-hidden="true">/</span>
          <span
            :class="idx === trail.length - 1 ? 'text-gray-900 font-medium truncate max-w-[40vw] sm:max-w-none' : 'text-gray-500 hidden sm:inline'"
          >{{ crumb }}</span>
        </template>
      </nav>
    </div>

    <!-- User avatar + dropdown -->
    <div class="relative" ref="dropdownRef">
      <button
        @click="dropdownOpen = !dropdownOpen"
        class="flex items-center gap-2 p-1 min-h-11 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        aria-label="เมนูผู้ใช้"
        aria-haspopup="menu"
        :aria-expanded="dropdownOpen"
      >
        <div class="relative">
          <div class="w-8 h-8 bg-primary-700 rounded-full flex items-center justify-center">
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
              class="w-full flex items-center gap-3 px-4 py-2.5 min-h-11 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <User class="w-4 h-4 text-gray-400" />
              โปรไฟล์
            </button>
            <button
              @click="navigateTo('/settings/account')"
              class="w-full flex items-center gap-3 px-4 py-2.5 min-h-11 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Settings class="w-4 h-4 text-gray-400" />
              ตั้งค่า
            </button>
            <button
              v-if="auth.isAdmin"
              @click="navigateTo('/users')"
              class="w-full flex items-center gap-3 px-4 py-2.5 min-h-11 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Shield class="w-4 h-4 text-gray-400" />
              ผู้ดูแล
            </button>
          </div>

          <!-- Logout -->
          <div class="border-t border-gray-100 py-1">
            <button
              @click="handleLogout"
              class="w-full flex items-center gap-3 px-4 py-2.5 min-h-11 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
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
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { confirmLogout } from '@/composables/useConfirm.js'
import { resolveTrail } from '@/utils/breadcrumb.js'
import { Menu, Home, ChevronDown, User, Settings, Shield, LogOut } from 'lucide-vue-next'

defineEmits(['toggle-sidebar'])

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const dropdownOpen = ref(false)
const dropdownRef = ref(null)

// Breadcrumb trail — single source จาก route.meta (เติม dynamic section ให้ candidates)
const trail = computed(() => resolveTrail(route))

// ชื่อหน้าปัจจุบัน = crumb ตัวสุดท้าย (ใช้แสดงบนจอเล็กที่ซ่อน trail ไว้)
const pageTitle = computed(() => trail.value.at(-1) ?? '')

function navigateTo(path) {
  dropdownOpen.value = false
  router.push(path)
}

async function handleLogout() {
  dropdownOpen.value = false
  const ok = await confirmLogout()
  if (!ok) return
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
